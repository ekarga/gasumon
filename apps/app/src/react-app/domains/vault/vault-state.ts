/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";

import {
  isVaultBridgeAvailable,
  listVaultTree,
  readVaultFile,
  resolveDefaultVaultPath,
  type ReadFileResult,
  type VaultEntry,
} from "./vault-bridge";

const VAULT_PATH_KEY = "openwork.vault.root.v1";
const SELECTED_FILE_KEY = "openwork.vault.selected.v1";

function readPersisted(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePersisted(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore persistence failures
  }
}

export type VaultState = {
  bridgeAvailable: boolean;
  vaultRoot: string | null;
  entries: VaultEntry[];
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
  fileContent: string | null;
  fileError: string | null;
  fileLoading: boolean;
  selectFile: (relPath: string) => void;
  refreshTree: () => Promise<void>;
};

export function useVaultState(): VaultState {
  const [bridgeAvailable] = useState(() => isVaultBridgeAvailable());
  const [vaultRoot, setVaultRoot] = useState<string | null>(() => readPersisted(VAULT_PATH_KEY));
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(() => readPersisted(SELECTED_FILE_KEY));
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const refreshTree = useCallback(async () => {
    if (!bridgeAvailable) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listVaultTree(vaultRoot ?? undefined);
      if (!result.ok) {
        setError(result.error);
        setEntries([]);
        return;
      }
      if (result.root !== vaultRoot) {
        setVaultRoot(result.root);
        writePersisted(VAULT_PATH_KEY, result.root);
      }
      setEntries(result.entries);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [bridgeAvailable, vaultRoot]);

  // Resolve the default root on first mount if we don't have one persisted.
  useEffect(() => {
    if (!bridgeAvailable) return;
    if (vaultRoot) return;
    let cancelled = false;
    void (async () => {
      const resolved = await resolveDefaultVaultPath();
      if (cancelled) return;
      if (resolved) {
        setVaultRoot(resolved);
        writePersisted(VAULT_PATH_KEY, resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridgeAvailable, vaultRoot]);

  // Load tree whenever the root changes.
  useEffect(() => {
    if (!bridgeAvailable || !vaultRoot) return;
    void refreshTree();
  }, [bridgeAvailable, vaultRoot, refreshTree]);

  const selectFile = useCallback((relPath: string) => {
    setSelectedPath(relPath);
    writePersisted(SELECTED_FILE_KEY, relPath);
  }, []);

  // Load file content whenever the selection changes.
  useEffect(() => {
    if (!bridgeAvailable || !vaultRoot || !selectedPath) {
      setFileContent(null);
      setFileError(null);
      return;
    }
    let cancelled = false;
    setFileLoading(true);
    setFileError(null);
    void (async () => {
      const result: ReadFileResult = await readVaultFile(vaultRoot, selectedPath);
      if (cancelled) return;
      if (!result.ok) {
        setFileError(result.error);
        setFileContent(null);
      } else {
        setFileContent(result.content);
        setFileError(null);
      }
      setFileLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bridgeAvailable, vaultRoot, selectedPath]);

  return {
    bridgeAvailable,
    vaultRoot,
    entries,
    loading,
    error,
    selectedPath,
    fileContent,
    fileError,
    fileLoading,
    selectFile,
    refreshTree,
  };
}
