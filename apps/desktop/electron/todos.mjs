import { promises as fs } from "node:fs";
import path from "node:path";
import { ipcMain } from "electron";

const TODO_FILENAME = "TODO.md";
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB cap

function todoPathFor(projectPath) {
  return path.resolve(projectPath, TODO_FILENAME);
}

async function handleReadTodo(_event, projectPath) {
  if (typeof projectPath !== "string" || !projectPath.trim()) {
    return { ok: false, error: "missing projectPath" };
  }
  const target = todoPathFor(projectPath);
  try {
    const stat = await fs.stat(target);
    if (stat.size > MAX_BYTES) {
      return { ok: false, error: `TODO.md too large (${stat.size} bytes, max ${MAX_BYTES})` };
    }
    const content = await fs.readFile(target, "utf8");
    return { ok: true, path: target, content, mtime: stat.mtimeMs };
  } catch (error) {
    if (error?.code === "ENOENT") {
      // Missing TODO.md is normal — every fresh project starts with no todos.
      return { ok: true, path: target, content: "", mtime: 0, missing: true };
    }
    return { ok: false, error: String(error?.message ?? error) };
  }
}

async function handleWriteTodo(_event, projectPath, content) {
  if (typeof projectPath !== "string" || !projectPath.trim()) {
    return { ok: false, error: "missing projectPath" };
  }
  if (typeof content !== "string") {
    return { ok: false, error: "content must be a string" };
  }
  if (Buffer.byteLength(content, "utf8") > MAX_BYTES) {
    return { ok: false, error: `content too large (max ${MAX_BYTES} bytes)` };
  }
  const target = todoPathFor(projectPath);
  try {
    // Ensure the project directory exists. Don't create it automatically
    // beyond the immediate parent — projectPath should already exist.
    const projStat = await fs.stat(path.dirname(target));
    if (!projStat.isDirectory()) {
      return { ok: false, error: "project path is not a directory" };
    }
    await fs.writeFile(target, content, "utf8");
    const stat = await fs.stat(target);
    return { ok: true, path: target, mtime: stat.mtimeMs };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

let registered = false;

export function registerTodoHandlers() {
  if (registered) return;
  registered = true;
  ipcMain.handle("openwork:todo:read", handleReadTodo);
  ipcMain.handle("openwork:todo:write", handleWriteTodo);
}
