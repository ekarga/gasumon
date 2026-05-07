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

type VaultBridge = {
  listTree(rootPath?: string): Promise<ListTreeResult>;
  readFile(rootPath: string, relPath: string): Promise<ReadFileResult>;
  resolveDefault(): Promise<{ ok: true; path: string }>;
};

declare global {
  interface Window {
    __OPENWORK_ELECTRON__?: {
      vault?: VaultBridge;
    };
  }
}

function getBridge(): VaultBridge | null {
  if (typeof window === "undefined") return null;
  const electron = window.__OPENWORK_ELECTRON__;
  return electron?.vault ?? null;
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

export async function resolveDefaultVaultPath(): Promise<string | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  const result = await bridge.resolveDefault();
  return result.ok ? result.path : null;
}
