import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { BrowserWindow, dialog, ipcMain } from "electron";
import YAML from "yaml";

const DEFAULT_VAULT = path.join(os.homedir(), "vault");
const MAX_TREE_ENTRIES = 5000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_INDEX_FILES = 2000;
const MAX_INDEX_PREVIEW = 400;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".obsidian",
  ".trash",
  ".DS_Store",
]);

/** Parse frontmatter from a markdown buffer. Returns { frontmatter, body }. */
function parseFrontmatter(text) {
  if (!text.startsWith("---")) return { frontmatter: null, body: text };
  // Find the closing fence at the start of a line.
  const closing = text.indexOf("\n---", 3);
  if (closing === -1) return { frontmatter: null, body: text };
  // The closing must be followed by a newline or EOF.
  const after = closing + 4;
  const next = text[after];
  if (next !== undefined && next !== "\n" && next !== "\r") {
    return { frontmatter: null, body: text };
  }
  const yamlSlice = text.slice(3, closing).trim();
  let parsed;
  try {
    parsed = YAML.parse(yamlSlice);
  } catch {
    return { frontmatter: null, body: text };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { frontmatter: null, body: text };
  }
  const body = text.slice(after + (next === "\n" ? 1 : 2));
  return { frontmatter: parsed, body };
}

/** Build a short plain-text preview from a markdown body, with frontmatter already stripped. */
function buildPreview(body) {
  // Strip headings, code fences, link syntax for a cleaner preview.
  const cleaned = body
    .replace(/^```[\s\S]*?```/gm, "")
    .replace(/^#+\s*/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g, "$1")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > MAX_INDEX_PREVIEW ? `${cleaned.slice(0, MAX_INDEX_PREVIEW)}…` : cleaned;
}

/**
 * Extract every Obsidian-style wikilink target from the body. Returns the
 * raw target strings (left-of-pipe, no extension stripping) so the renderer
 * can resolve them however it likes.
 */
function extractWikilinkTargets(body) {
  const out = [];
  const pattern = /\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const target = match[1]?.trim();
    if (target) out.push(target);
  }
  return Array.from(new Set(out));
}

function isInsideVault(vaultRoot, target) {
  const resolvedRoot = path.resolve(vaultRoot);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function listTreeRecursive(rootDir, currentDir, out, depth) {
  if (out.length >= MAX_TREE_ENTRIES) return;
  if (depth > 8) return;

  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (out.length >= MAX_TREE_ENTRIES) break;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;

    const absPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, absPath);

    if (entry.isDirectory()) {
      out.push({ type: "dir", name: entry.name, path: relPath });
      await listTreeRecursive(rootDir, absPath, out, depth + 1);
    } else if (entry.isFile()) {
      out.push({ type: "file", name: entry.name, path: relPath });
    }
  }
}

async function handleListTree(_event, requestedRoot) {
  const root = requestedRoot && typeof requestedRoot === "string" ? requestedRoot : DEFAULT_VAULT;
  const resolvedRoot = path.resolve(root);

  let stat;
  try {
    stat = await fs.stat(resolvedRoot);
  } catch (error) {
    return { ok: false, error: `vault path does not exist: ${resolvedRoot}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `vault path is not a directory: ${resolvedRoot}` };
  }

  const out = [];
  await listTreeRecursive(resolvedRoot, resolvedRoot, out, 0);
  return { ok: true, root: resolvedRoot, entries: out };
}

async function handleReadFile(_event, vaultRoot, relPath) {
  if (typeof vaultRoot !== "string" || typeof relPath !== "string") {
    return { ok: false, error: "vaultRoot and relPath must be strings" };
  }
  const resolvedRoot = path.resolve(vaultRoot);
  const target = path.resolve(resolvedRoot, relPath);

  if (!isInsideVault(resolvedRoot, target)) {
    return { ok: false, error: "path escapes vault root" };
  }

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return { ok: false, error: "file not found" };
  }
  if (!stat.isFile()) {
    return { ok: false, error: "not a file" };
  }
  if (stat.size > MAX_FILE_BYTES) {
    return { ok: false, error: `file too large (${stat.size} bytes, max ${MAX_FILE_BYTES})` };
  }

  try {
    const content = await fs.readFile(target, "utf8");
    return { ok: true, path: relPath, content, size: stat.size, mtime: stat.mtimeMs };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function handleResolveDefault() {
  return { ok: true, path: DEFAULT_VAULT };
}

async function handleReadIndex(_event, requestedRoot) {
  const root = requestedRoot && typeof requestedRoot === "string" ? requestedRoot : DEFAULT_VAULT;
  const resolvedRoot = path.resolve(root);

  let stat;
  try {
    stat = await fs.stat(resolvedRoot);
  } catch {
    return { ok: false, error: `vault path does not exist: ${resolvedRoot}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `vault path is not a directory: ${resolvedRoot}` };
  }

  const treeEntries = [];
  await listTreeRecursive(resolvedRoot, resolvedRoot, treeEntries, 0);

  const indexEntries = [];
  for (const entry of treeEntries) {
    if (indexEntries.length >= MAX_INDEX_FILES) break;
    if (entry.type !== "file") continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;

    const absPath = path.join(resolvedRoot, entry.path);
    let fileStat;
    try {
      fileStat = await fs.stat(absPath);
    } catch {
      continue;
    }
    if (fileStat.size > MAX_FILE_BYTES) continue;

    let raw;
    try {
      raw = await fs.readFile(absPath, "utf8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(raw);
    indexEntries.push({
      path: entry.path,
      name: entry.name,
      mtime: fileStat.mtimeMs,
      size: fileStat.size,
      frontmatter,
      preview: buildPreview(body),
      outgoingLinks: extractWikilinkTargets(body),
    });
  }

  return { ok: true, root: resolvedRoot, entries: indexEntries };
}

async function handlePickPath(event) {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(browserWindow ?? undefined, {
    title: "Choose vault folder",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: DEFAULT_VAULT,
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }
  return { ok: true, path: result.filePaths[0] };
}

let registered = false;

export function registerVaultHandlers() {
  if (registered) return;
  registered = true;
  ipcMain.handle("openwork:vault:listTree", handleListTree);
  ipcMain.handle("openwork:vault:readFile", handleReadFile);
  ipcMain.handle("openwork:vault:resolveDefault", handleResolveDefault);
  ipcMain.handle("openwork:vault:readIndex", handleReadIndex);
  ipcMain.handle("openwork:vault:pickPath", handlePickPath);
}
