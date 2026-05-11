#!/usr/bin/env node
/**
 * Tiny CDP driver for the running OpenWork Dev Electron app. Uses Node's
 * built-in WebSocket (v22+) so it has zero dependencies and starts in
 * milliseconds.
 *
 * Usage:
 *   node cdp-driver.mjs navigate "/todos?path=/Users/.../foo"
 *   node cdp-driver.mjs screenshot /tmp/openwork.png
 *   node cdp-driver.mjs eval "document.title"
 *   node cdp-driver.mjs errors                      # 1.5s console capture
 *   node cdp-driver.mjs status                      # current URL + title
 *
 * Environment overrides:
 *   CDP_URL              default: http://127.0.0.1:9823
 *   OPENWORK_DEV_URL     default: http://localhost:5173 (page filter)
 */

import { writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9823";
const DEV_URL = process.env.OPENWORK_DEV_URL ?? "http://localhost:5173";

function fail(msg, extra) {
  process.stdout.write(JSON.stringify({ ok: false, error: msg, ...(extra ?? {}) }, null, 2) + "\n");
  process.exit(1);
}

// Node 22's fetch hangs against Chromium's CDP HTTP endpoints (likely
// keep-alive + connection-close mismatch). Use http.request directly so
// we get clean one-shot requests against the IPv4 loopback.
function httpJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpRequest(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: "GET",
        family: 4,
        headers: { Accept: "application/json", Connection: "close" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`bad JSON: ${e.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function getTarget() {
  let targets;
  try {
    targets = await httpJson(`${CDP_URL}/json/list`);
  } catch (e) {
    fail(`CDP not reachable at ${CDP_URL}: ${e.message}. Is the dev server running?`);
  }
  const page = targets.find(
    (t) => t.type === "page" && (t.url.startsWith(DEV_URL) || t.url.includes("localhost:5173")),
  );
  if (!page) fail("no OpenWork renderer page found at CDP", { targets: targets.map((t) => ({ type: t.type, url: t.url })) });
  return page;
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (e) => reject(e));
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined) {
        const handler = this.pending.get(msg.id);
        if (!handler) return;
        this.pending.delete(msg.id);
        if (msg.error) handler.reject(new Error(msg.error.message));
        else handler.resolve(msg.result);
      } else if (msg.method) {
        const handlers = this.eventHandlers.get(msg.method);
        if (handlers) for (const h of handlers) h(msg.params);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      // Generous default timeout — page navigation can be slow on first paint.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP ${method} timed out after 15s`));
        }
      }, 15000);
    });
  }
  on(method, handler) {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, new Set());
    this.eventHandlers.get(method).add(handler);
  }
  close() {
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

async function withClient(fn) {
  const target = await getTarget();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    return await fn(client, target);
  } finally {
    client.close();
  }
}

const COMMANDS = {
  async status() {
    return withClient(async (client, target) => ({
      ok: true,
      url: target.url,
      title: target.title,
    }));
  },

  async navigate(rawUrl) {
    if (!rawUrl) fail("usage: navigate <path-or-url>");
    // OpenWork uses HashRouter inside Electron. A path like "/todos?x=y"
    // becomes "http://localhost:5173/#/todos?x=y". Pass-through full URLs.
    let url;
    if (/^https?:\/\//i.test(rawUrl)) {
      url = rawUrl;
    } else {
      const cleaned = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
      url = `${DEV_URL}/#${cleaned}`;
    }
    return withClient(async (client) => {
      await client.send("Page.enable");
      const loaded = new Promise((resolve) => {
        client.on("Page.loadEventFired", () => resolve());
      });
      await client.send("Page.navigate", { url });
      // Best-effort wait for the load event, with a fallback timeout so
      // SPA route changes (which may not refire load) still return.
      await Promise.race([loaded, new Promise((r) => setTimeout(r, 3000))]);
      return { ok: true, navigated: url };
    });
  },

  async eval(...exprParts) {
    const expression = exprParts.join(" ");
    if (!expression) fail("usage: eval <js-expression>");
    return withClient(async (client) => {
      const result = await client.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        return {
          ok: false,
          error: result.exceptionDetails.text,
          exception: result.exceptionDetails.exception?.description,
        };
      }
      return { ok: true, value: result.result.value };
    });
  },

  async screenshot(path) {
    if (!path) fail("usage: screenshot <output-path.png>");
    return withClient(async (client) => {
      const result = await client.send("Page.captureScreenshot", { format: "png" });
      const buffer = Buffer.from(result.data, "base64");
      await writeFile(path, buffer);
      return { ok: true, path, bytes: buffer.length };
    });
  },

  async errors(durationMs = "1500") {
    const ms = Number.parseInt(durationMs, 10) || 1500;
    return withClient(async (client) => {
      const collected = [];
      await client.send("Runtime.enable");
      client.on("Runtime.consoleAPICalled", (params) => {
        if (params.type === "error" || params.type === "warning") {
          const text = params.args.map((a) => a.value ?? a.description ?? "").join(" ");
          collected.push({ type: params.type, text });
        }
      });
      client.on("Runtime.exceptionThrown", (params) => {
        collected.push({
          type: "exception",
          text: params.exceptionDetails?.text ?? "",
          exception: params.exceptionDetails?.exception?.description ?? "",
        });
      });
      await new Promise((r) => setTimeout(r, ms));
      return { ok: true, count: collected.length, entries: collected };
    });
  },

  async wait(selector, timeoutMs = "5000") {
    if (!selector) fail("usage: wait <css-selector> [timeout-ms]");
    const ms = Number.parseInt(timeoutMs, 10) || 5000;
    return withClient(async (client) => {
      const expr = `new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          if (document.querySelector(${JSON.stringify(selector)})) return resolve(true);
          if (Date.now() - start > ${ms}) return reject(new Error("timeout"));
          setTimeout(tick, 100);
        };
        tick();
      })`;
      try {
        const result = await client.send("Runtime.evaluate", {
          expression: expr,
          returnByValue: true,
          awaitPromise: true,
        });
        if (result.exceptionDetails) {
          return { ok: false, error: result.exceptionDetails.text };
        }
        return { ok: true, found: true };
      } catch (e) {
        return { ok: false, error: String(e?.message ?? e) };
      }
    });
  },

  async click(selector) {
    if (!selector) fail("usage: click <css-selector>");
    return withClient(async (client) => {
      const expr = `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { found: false };
        el.click();
        return { found: true, tag: el.tagName, text: (el.textContent || "").slice(0, 80) };
      })()`;
      const result = await client.send("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        return { ok: false, error: result.exceptionDetails.text };
      }
      return { ok: true, ...result.result.value };
    });
  },

  async fill(selector, ...valueParts) {
    if (!selector) fail("usage: fill <css-selector> <value>");
    const value = valueParts.join(" ");
    return withClient(async (client) => {
      const expr = `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { found: false };
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(el, ${JSON.stringify(value)});
        else el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return { found: true, value: el.value };
      })()`;
      const result = await client.send("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        return { ok: false, error: result.exceptionDetails.text };
      }
      return { ok: true, ...result.result.value };
    });
  },
};

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || !COMMANDS[cmd]) {
    const list = Object.keys(COMMANDS).join(", ");
    fail(`unknown command "${cmd}". valid: ${list}`);
  }
  try {
    const result = await COMMANDS[cmd](...args);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exit(result.ok === false ? 1 : 0);
  } catch (error) {
    fail(String(error?.message ?? error));
  }
}

main();
