/**
 * Renderer-side wrapper for the `todo` namespace on the Electron preload
 * bridge. Reads and writes a TODO.md file at the root of an arbitrary
 * project directory.
 */

export type ReadTodoResult =
  | { ok: true; path: string; content: string; mtime: number; missing?: boolean }
  | { ok: false; error: string };

export type WriteTodoResult =
  | { ok: true; path: string; mtime: number }
  | { ok: false; error: string };

type TodoBridge = {
  read(projectPath: string): Promise<ReadTodoResult>;
  write(projectPath: string, content: string): Promise<WriteTodoResult>;
};

function getBridge(): TodoBridge | null {
  if (typeof window === "undefined") return null;
  const electron = window.__OPENWORK_ELECTRON__;
  const raw = electron?.todo;
  if (!raw || !raw.read || !raw.write) return null;
  return {
    read: (projectPath: string) => raw.read!(projectPath) as Promise<ReadTodoResult>,
    write: (projectPath: string, content: string) =>
      raw.write!(projectPath, content) as Promise<WriteTodoResult>,
  };
}

export function isTodoBridgeAvailable(): boolean {
  return getBridge() !== null;
}

export async function readTodoFile(projectPath: string): Promise<ReadTodoResult> {
  const bridge = getBridge();
  if (!bridge) {
    return { ok: false, error: "todo bridge not available (running outside Electron)" };
  }
  return bridge.read(projectPath);
}

export async function writeTodoFile(
  projectPath: string,
  content: string,
): Promise<WriteTodoResult> {
  const bridge = getBridge();
  if (!bridge) {
    return { ok: false, error: "todo bridge not available (running outside Electron)" };
  }
  return bridge.write(projectPath, content);
}

// ─────────────────────────────────────────────────────────────────────
// TODO.md parsing helpers — kept lightweight intentionally. Anything we
// don't recognize is preserved verbatim around the structured items so
// agent-edited markdown stays human-readable.
// ─────────────────────────────────────────────────────────────────────

export type TodoItem = {
  /** Index of the source line in the original content. */
  lineIndex: number;
  /** Indent (number of leading spaces) on the source line. */
  indent: number;
  done: boolean;
  text: string;
  /** Lowercased tag tokens parsed from the trailing #tag bits in the text. */
  tags: string[];
};

export type ParsedTodos = {
  items: TodoItem[];
  /** The exact source split into lines. Mutate via toggle/replace, then join. */
  lines: string[];
};

const CHECKBOX_PATTERN = /^(\s*)[-*+]\s+\[(.| )\]\s?(.*)$/;
const TAG_PATTERN = /(?:^|\s)#([a-zA-Z][\w-]*)/g;

export function parseTodoMarkdown(content: string): ParsedTodos {
  const lines = content.split(/\r?\n/);
  const items: TodoItem[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = CHECKBOX_PATTERN.exec(lines[i]);
    if (!match) continue;
    const [, indentRaw, mark, textRaw] = match;
    const indent = indentRaw.length;
    const done = mark === "x" || mark === "X";
    const text = textRaw ?? "";
    const tags: string[] = [];
    for (const tagMatch of text.matchAll(TAG_PATTERN)) {
      tags.push(tagMatch[1]?.toLowerCase());
    }
    items.push({ lineIndex: i, indent, done, text, tags });
  }
  return { items, lines };
}

export function stringifyTodos(parsed: ParsedTodos): string {
  return parsed.lines.join("\n");
}

/** Toggle the checkbox at `lineIndex` in-place on the lines array. */
export function toggleAtLine(parsed: ParsedTodos, lineIndex: number): ParsedTodos {
  const next = { ...parsed, lines: parsed.lines.slice() };
  const line = next.lines[lineIndex];
  if (line === undefined) return next;
  const match = CHECKBOX_PATTERN.exec(line);
  if (!match) return next;
  const [, indent, mark, text] = match;
  const newMark = mark === "x" || mark === "X" ? " " : "x";
  next.lines[lineIndex] = `${indent}- [${newMark}] ${text}`;
  return next;
}

/** Append a new top-level todo item to the end of the document. */
export function appendTodo(parsed: ParsedTodos, text: string): ParsedTodos {
  const trimmed = text.trim();
  if (!trimmed) return parsed;
  const next = { ...parsed, lines: parsed.lines.slice() };
  // If the last line is non-empty, push a separator newline first so the
  // new item lands on its own line. Avoid double-blank lines either side.
  if (next.lines.length > 0 && next.lines[next.lines.length - 1].trim() !== "") {
    next.lines.push("");
  }
  next.lines.push(`- [ ] ${trimmed}`);
  return next;
}

/** Remove the line at `lineIndex` (and a trailing blank if present). */
export function removeAtLine(parsed: ParsedTodos, lineIndex: number): ParsedTodos {
  const next = { ...parsed, lines: parsed.lines.slice() };
  if (lineIndex < 0 || lineIndex >= next.lines.length) return next;
  next.lines.splice(lineIndex, 1);
  return next;
}
