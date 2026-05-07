/** @jsxImportSource react */
import { useCallback, useMemo } from "react";

import { VaultFilters } from "./vault-filters";
import { useVaultState } from "./vault-state";
import { VaultTree } from "./vault-tree";
import { VaultViewer } from "./vault-viewer";

const SIDEBAR_WIDTH = 280;

function buildBasenameIndex(entries: { type: "dir" | "file"; path: string; name: string }[]) {
  // Map from a "wikilink target" (basename without extension, lowercased) to
  // the first matching vault-relative path. Obsidian's resolution rules are
  // more nuanced than this (closest-first, then alphabetical), but for v1
  // we keep it simple: first match wins.
  const index = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type !== "file") continue;
    if (!entry.name.toLowerCase().endsWith(".md")) continue;
    const stem = entry.name.replace(/\.md$/i, "").toLowerCase();
    if (!index.has(stem)) index.set(stem, entry.path);
    // Also index by the last path segment with extension lowercased so
    // `[[notes/foo.md]]` style targets work.
    const lowerPath = entry.path.toLowerCase();
    if (!index.has(lowerPath)) index.set(lowerPath, entry.path);
  }
  return index;
}

export function VaultRoute() {
  const vault = useVaultState();

  const basenameIndex = useMemo(() => buildBasenameIndex(vault.entries), [vault.entries]);

  const resolveWikilink = useCallback(
    (target: string) => {
      const lowered = target.toLowerCase();
      // 1. Try exact stem match
      const direct = basenameIndex.get(lowered);
      if (direct) return direct;
      // 2. Try with .md appended (in case user wrote [[file.md]])
      const withMd = basenameIndex.get(`${lowered}.md`);
      if (withMd) return withMd;
      // 3. Strip extension and retry
      const stripped = lowered.replace(/\.md$/, "");
      const strippedHit = basenameIndex.get(stripped);
      if (strippedHit) return strippedHit;
      return null;
    },
    [basenameIndex],
  );

  const onOpenPath = useCallback(
    (relPath: string) => {
      vault.selectFile(relPath);
    },
    [vault],
  );

  if (!vault.bridgeAvailable) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-gray-10">
        The vault sidebar requires the OpenWork desktop app — file system access is
        not available in this build.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div
        className="flex shrink-0 flex-col border-r border-dls-border/70"
        style={{ width: `${SIDEBAR_WIDTH}px` }}
      >
        <VaultFilters
          searchQuery={vault.searchQuery}
          onSearchChange={vault.setSearchQuery}
          allTags={vault.allTags}
          allStatuses={vault.allStatuses}
          selectedTag={vault.selectedTag}
          selectedStatus={vault.selectedStatus}
          onSelectTag={vault.setSelectedTag}
          onSelectStatus={vault.setSelectedStatus}
          loading={vault.indexLoading}
          matchedCount={vault.filteredIndex.length}
          totalCount={vault.index.length}
        />
        <div className="min-h-0 flex-1">
          <VaultTree
            entries={vault.visibleEntries}
            selectedPath={vault.selectedPath}
            onSelect={vault.selectFile}
            loading={vault.loading}
            error={vault.error}
            vaultRoot={vault.vaultRoot}
            onRefresh={() => {
              void vault.refreshTree();
              void vault.refreshIndex();
            }}
            onChangeRoot={() => {
              void vault.pickAndSetVault();
            }}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <VaultViewer
            filePath={vault.selectedPath}
            content={vault.fileContent}
            loading={vault.fileLoading}
            error={vault.fileError}
            resolveWikilink={resolveWikilink}
            onOpenPath={onOpenPath}
          />
        </div>
        {vault.selectedPath && vault.backlinks.length > 0 ? (
          <div className="shrink-0 border-t border-dls-border/70 bg-dls-surface px-6 py-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-10">
              Backlinks ({vault.backlinks.length})
            </div>
            <ul className="flex flex-wrap gap-2 text-[12px]">
              {vault.backlinks.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => onOpenPath(path)}
                    className="rounded-md border border-dls-border px-2 py-1 font-mono text-gray-12 transition-colors hover:bg-dls-hover"
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
