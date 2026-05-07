/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  isVaultBridgeAvailable,
  listVaultTree,
  readVaultFile,
  readVaultIndex,
  resolveDefaultVaultPath,
  type IndexEntry,
  type ReadFileResult,
  type VaultEntry,
} from "./vault-bridge";

const VAULT_PATH_KEY = "openwork.vault.root.v1";
const SELECTED_FILE_KEY = "openwork.vault.selected.v1";

function frontmatterValueToStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((v) => frontmatterValueToStrings(v));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      frontmatterValueToStrings(v),
    );
  }
  return [];
}

function lc(value: string) {
  return value.toLowerCase();
}

function indexEntryMatchesQuery(entry: IndexEntry, query: string): boolean {
  if (!query) return true;
  const q = lc(query);
  if (lc(entry.name).includes(q)) return true;
  if (lc(entry.path).includes(q)) return true;
  if (entry.preview && lc(entry.preview).includes(q)) return true;
  if (entry.frontmatter) {
    for (const [key, value] of Object.entries(entry.frontmatter)) {
      if (lc(key).includes(q)) return true;
      for (const stringified of frontmatterValueToStrings(value)) {
        if (lc(stringified).includes(q)) return true;
      }
    }
  }
  return false;
}

function indexEntryHasTag(entry: IndexEntry, tag: string): boolean {
  if (!entry.frontmatter) return false;
  const target = lc(tag);
  const collect = (key: string) => {
    const value = (entry.frontmatter as Record<string, unknown> | null)?.[key];
    return frontmatterValueToStrings(value).map((v) => lc(v));
  };
  const tagValues = [...collect("tags"), ...collect("tag")];
  return tagValues.includes(target);
}

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
  /** Filtered entries — respects searchQuery + selectedTag. */
  visibleEntries: VaultEntry[];
  index: IndexEntry[];
  /** Index entries that satisfy the current filter — for previews/list views. */
  filteredIndex: IndexEntry[];
  allTags: string[];
  allStatuses: string[];
  searchQuery: string;
  setSearchQuery: (next: string) => void;
  selectedTag: string | null;
  setSelectedTag: (next: string | null) => void;
  selectedStatus: string | null;
  setSelectedStatus: (next: string | null) => void;
  loading: boolean;
  indexLoading: boolean;
  error: string | null;
  indexError: string | null;
  selectedPath: string | null;
  fileContent: string | null;
  fileError: string | null;
  fileLoading: boolean;
  selectFile: (relPath: string) => void;
  refreshTree: () => Promise<void>;
  refreshIndex: () => Promise<void>;
};

export function useVaultState(): VaultState {
  const [bridgeAvailable] = useState(() => isVaultBridgeAvailable());
  const [vaultRoot, setVaultRoot] = useState<string | null>(() => readPersisted(VAULT_PATH_KEY));
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [index, setIndex] = useState<IndexEntry[]>([]);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

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

  const refreshIndex = useCallback(async () => {
    if (!bridgeAvailable || !vaultRoot) return;
    setIndexLoading(true);
    setIndexError(null);
    try {
      const result = await readVaultIndex(vaultRoot);
      if (!result.ok) {
        setIndexError(result.error);
        setIndex([]);
        return;
      }
      setIndex(result.entries);
    } catch (e) {
      setIndexError(String((e as Error)?.message ?? e));
    } finally {
      setIndexLoading(false);
    }
  }, [bridgeAvailable, vaultRoot]);

  // Load the frontmatter index whenever the root changes.
  useEffect(() => {
    if (!bridgeAvailable || !vaultRoot) return;
    void refreshIndex();
  }, [bridgeAvailable, vaultRoot, refreshIndex]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const entry of index) {
      const fm = entry.frontmatter as Record<string, unknown> | null;
      if (!fm) continue;
      for (const key of ["tags", "tag"]) {
        for (const value of frontmatterValueToStrings(fm[key])) {
          const trimmed = value.trim();
          if (trimmed) set.add(trimmed);
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [index]);

  const allStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const entry of index) {
      const fm = entry.frontmatter as Record<string, unknown> | null;
      if (!fm) continue;
      for (const value of frontmatterValueToStrings(fm.status)) {
        const trimmed = value.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [index]);

  const filteredIndex = useMemo(() => {
    return index.filter((entry) => {
      if (selectedTag && !indexEntryHasTag(entry, selectedTag)) return false;
      if (selectedStatus) {
        const fm = entry.frontmatter as Record<string, unknown> | null;
        const statuses = frontmatterValueToStrings(fm?.status).map(lc);
        if (!statuses.includes(lc(selectedStatus))) return false;
      }
      if (!indexEntryMatchesQuery(entry, searchQuery)) return false;
      return true;
    });
  }, [index, searchQuery, selectedTag, selectedStatus]);

  const visibleEntries = useMemo(() => {
    const noFilters = !searchQuery && !selectedTag && !selectedStatus;
    if (noFilters) return entries;
    const visiblePaths = new Set(filteredIndex.map((entry) => entry.path));
    // Also keep any directory that contains a visible file so the tree can
    // render parent paths. Walking the visible paths and pulling all parent
    // directory segments gives us the minimal directory set.
    const dirsToShow = new Set<string>();
    for (const filePath of visiblePaths) {
      const segments = filePath.split("/");
      for (let i = 1; i < segments.length; i += 1) {
        dirsToShow.add(segments.slice(0, i).join("/"));
      }
    }
    return entries.filter((entry) => {
      if (entry.type === "dir") return dirsToShow.has(entry.path);
      return visiblePaths.has(entry.path);
    });
  }, [entries, filteredIndex, searchQuery, selectedTag, selectedStatus]);

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
    visibleEntries,
    index,
    filteredIndex,
    allTags,
    allStatuses,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    selectedStatus,
    setSelectedStatus,
    loading,
    indexLoading,
    error,
    indexError,
    selectedPath,
    fileContent,
    fileError,
    fileLoading,
    selectFile,
    refreshTree,
    refreshIndex,
  };
}
