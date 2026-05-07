import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ipcMain } from "electron";

const DEFAULT_VAULT = path.join(os.homedir(), "vault");
const MAX_TREE_ENTRIES = 5000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".obsidian",
  ".trash",
  ".DS_Store",
]);

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

let registered = false;

export function registerVaultHandlers() {
  if (registered) return;
  registered = true;
  ipcMain.handle("openwork:vault:listTree", handleListTree);
  ipcMain.handle("openwork:vault:readFile", handleReadFile);
  ipcMain.handle("openwork:vault:resolveDefault", handleResolveDefault);
}
