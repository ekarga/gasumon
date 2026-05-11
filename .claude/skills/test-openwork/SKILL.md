---
name: test-openwork
description: Drive the running OpenWork Dev Electron app via Chrome DevTools Protocol to self-verify UI/UX changes. Use after any change to apps/app/ or apps/desktop/electron/ to navigate, screenshot, evaluate JS, click, fill, and capture console errors against the live app instead of asking the user to test by hand.
---

# test-openwork

Self-test the OpenWork Dev app from the terminal. No Playwright dependency,
no extra tooling — just Node 22's built-in WebSocket talking to the Electron
renderer's Chrome DevTools Protocol port.

## When to use

- After every code change in `apps/app/src/` or `apps/desktop/electron/`
- Before reporting a feature as DONE
- Whenever the user asks "does it work?"
- Instead of asking the user to test something — **test it yourself first**

## Prerequisites

The dev server must be running:

```bash
cd ~/Desktop/openwork-vault && pnpm dev > /tmp/openwork-dev.log 2>&1 &
until grep -qE "VITE.*ready" /tmp/openwork-dev.log; do sleep 1; done
sleep 3   # let the renderer fully boot
```

Verify Electron is up + CDP exposed:

```bash
curl -sf http://127.0.0.1:9823/json/list >/dev/null && echo "CDP ready" || echo "DEAD"
```

If `DEAD`, do not silently restart — that disrupts whatever the user is doing
in their dev window. Tell them and ask before killing.

## Commands

All commands return one JSON object on stdout. Exit code 0 = `ok: true`.

```bash
# What page is loaded right now?
node .claude/skills/test-openwork/cdp-driver.mjs status

# Navigate. Path is rewritten to HashRouter form (`#/path`).
node .claude/skills/test-openwork/cdp-driver.mjs navigate "/projects"
node .claude/skills/test-openwork/cdp-driver.mjs navigate "/todos?path=/Users/me/Desktop/foo"

# Wait for a selector to appear (default 5s timeout).
node .claude/skills/test-openwork/cdp-driver.mjs wait "input[placeholder='Add a todo… (Enter to add)']"

# Take a screenshot. Always read it back so the user can see it.
node .claude/skills/test-openwork/cdp-driver.mjs screenshot /tmp/openwork-test.png

# Evaluate any JavaScript expression. returnByValue + awaitPromise are on.
node .claude/skills/test-openwork/cdp-driver.mjs eval "Object.keys(window.__OPENWORK_ELECTRON__).join(',')"

# Click an element. CSS selector required.
node .claude/skills/test-openwork/cdp-driver.mjs click "button[type=submit]"

# Fill a text input. Dispatches input + change events.
node .claude/skills/test-openwork/cdp-driver.mjs fill "input[type=text]" "hello world"

# Capture console errors + uncaught exceptions over a window (default 1500ms).
node .claude/skills/test-openwork/cdp-driver.mjs errors
node .claude/skills/test-openwork/cdp-driver.mjs errors 3000
```

## Standard test loop for a new UI feature

1. **status** — confirm Electron is up
2. **navigate** to the route under test
3. **wait** for a key element to render
4. **screenshot** — read the PNG with the Read tool so the user sees it
5. **eval** — assert any non-visual state (DOM contents, localStorage, bridge namespaces)
6. **errors** — confirm no exceptions or console errors over ~1.5s
7. If interactive: **fill** + **click**, then re-verify with screenshot/eval
8. Report: pass/fail with screenshot evidence; do NOT claim DONE without this loop

## Hot vs cold reloads

- **Renderer-only change** (anything under `apps/app/src/`): Vite HMR picks it up.
  Just reload via `navigate` to the same URL or `eval "location.reload()"`.
- **Main-process change** (anything under `apps/desktop/electron/`): the Electron
  main process must restart. **Ask the user before doing this** — it kills
  whatever session they have open. Restart sequence:

  ```bash
  pkill -f "electron-dev.mjs"
  cd ~/Desktop/openwork-vault && pnpm dev > /tmp/openwork-dev.log 2>&1 &
  until grep -qE "VITE.*ready" /tmp/openwork-dev.log; do sleep 1; done
  sleep 5  # main-process IPC handlers register on boot, give them a beat
  ```

## Useful eval snippets

```javascript
// What workspace is currently active?
JSON.stringify({
  hash: location.hash,
  workspaceId: localStorage.getItem("openwork.active-workspace-id"),
})

// Are my custom preload namespaces all exposed?
Object.keys(window.__OPENWORK_ELECTRON__ || {})

// Read a piece of state from the DOM.
Array.from(document.querySelectorAll('li')).map(li => li.textContent?.trim())

// Force-trigger Cmd+K via DOM event (most components listen on document).
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
```

## Troubleshooting

- `fetch failed` → Node's built-in fetch hangs against Chromium CDP. The driver
  uses `node:http` directly with `family: 4` and `Connection: close` to dodge it.
  If you ever rewrite this with `fetch`, expect crashes.
- `ECONNREFUSED 127.0.0.1:9823` → dev server died. Check `/tmp/openwork-dev.log`.
- `no OpenWork renderer page found` → renderer crashed but Electron is alive.
  The driver lists the targets it saw in the error JSON. Reload the URL.
- Driver hangs → CDP command timed out (15s). Either the renderer is frozen or
  the WebSocket is wedged. Kill the process, restart Electron only with user
  permission.

## What NOT to do

- Don't run this against `/Applications/OpenWork.app` (the user's installed
  production app). It does not expose CDP and it is not yours to test.
- Don't `pkill` Electron without asking — the user is using that window.
- Don't write to TODO.md or other project files for "smoke testing" without
  cleaning up. The project root is the user's, not a test fixture.
