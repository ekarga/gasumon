/**
 * Renderer-side wrapper around the Electron preload bridge for the vault
 * file system operations. Falls back to a "not available" path when the
 * window does not expose `__OPENWORK_ELECTRON__` (e.g. running the UI in
 * a plain browser, where the file tree should render an empty state).
 */

export type VaultEntry =
  | { type: "dir"; name: string; path: string }
  | { type: "file"; name: string; path: string };

export type ListTreeResult =
  | { ok: true; root: string; entries: VaultEntry[] }
  | { ok: false; error: string };

export type ReadFileResult =
  | { ok: true; path: string; content: string; size: number; mtime: number }
  | { ok: false; error: string };

export type Frontmatter = Record<string, unknown> | null;

export type IndexEntry = {
  path: string;
  name: string;
  mtime: number;
  size: number;
  frontmatter: Frontmatter;
  preview: string;
  /** Raw wikilink targets found in the body, deduped, in source order. */
  outgoingLinks: string[];
};

export type ReadIndexResult =
  | { ok: true; root: string; entries: IndexEntry[] }
  | { ok: false; error: string };

export type PickPathResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; error: string };

type VaultBridge = {
  listTree(rootPath?: string): Promise<ListTreeResult>;
  readFile(rootPath: string, relPath: string): Promise<ReadFileResult>;
  resolveDefault(): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
  readIndex(rootPath?: string): Promise<ReadIndexResult>;
  pickPath(): Promise<PickPathResult>;
};

// The canonical `Window.__OPENWORK_ELECTRON__` shape lives in
// `src/app/lib/desktop.ts`; this module narrows the loosely-typed `vault`
// namespace declared there into a strongly-typed bridge handle.
function getBridge(): VaultBridge | null {
  if (typeof window === "undefined") return null;
  const electron = window.__OPENWORK_ELECTRON__;
  const raw = electron?.vault;
  if (
    !raw ||
    !raw.listTree ||
    !raw.readFile ||
    !raw.resolveDefault ||
    !raw.readIndex ||
    !raw.pickPath
  ) {
    return null;
  }
  return {
    listTree: (rootPath?: string) => raw.listTree!(rootPath) as Promise<ListTreeResult>,
    readFile: (rootPath: string, relPath: string) =>
      raw.readFile!(rootPath, relPath) as Promise<ReadFileResult>,
    resolveDefault: () => raw.resolveDefault!() as Promise<{ ok: true; path: string } | { ok: false; error: string }>,
    readIndex: (rootPath?: string) => raw.readIndex!(rootPath) as Promise<ReadIndexResult>,
    pickPath: () => raw.pickPath!() as Promise<PickPathResult>,
  };
}

export function isVaultBridgeAvailable(): boolean {
  return getBridge() !== null;
}

export async function listVaultTree(rootPath?: string): Promise<ListTreeResult> {
  const bridge = getBridge();
  if (!bridge) {
    return { ok: false, error: "vault bridge not available (running outside Electron)" };
  }
  return bridge.listTree(rootPath);
}

export async function readVaultFile(rootPath: string, relPath: string): Promise<ReadFileResult> {
  const bridge = getBridge();
  if (!bridge) {
    return { ok: false, error: "vault bridge not available (running outside Electron)" };
  }
  return bridge.readFile(rootPath, relPath);
}

export async function readVaultIndex(rootPath?: string): Promise<ReadIndexResult> {
  const bridge = getBridge();
  if (!bridge) {
    return { ok: false, error: "vault bridge not available (running outside Electron)" };
  }
  return bridge.readIndex(rootPath);
}

export async function pickVaultPath(): Promise<PickPathResult> {
  const bridge = getBridge();
  if (!bridge) {
    return { ok: false, error: "vault bridge not available (running outside Electron)" };
  }
  return bridge.pickPath();
}

export async function resolveDefaultVaultPath(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  const result = await bridge.resolveDefault();
  return result.ok && "path" in result ? result.path : null;
}
