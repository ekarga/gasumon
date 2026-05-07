/** @jsxImportSource react */

type VaultFiltersProps = {
  searchQuery: string;
  onSearchChange: (next: string) => void;
  allTags: string[];
  allStatuses: string[];
  selectedTag: string | null;
  selectedStatus: string | null;
  onSelectTag: (tag: string | null) => void;
  onSelectStatus: (status: string | null) => void;
  loading: boolean;
  /** Number of files matching the current filter, for the count badge. */
  matchedCount: number;
  totalCount: number;
};

export function VaultFilters(props: VaultFiltersProps) {
  const showStatuses = props.allStatuses.length > 0;
  const showTags = props.allTags.length > 0;
  const filtersActive = Boolean(props.searchQuery || props.selectedTag || props.selectedStatus);

  return (
    <div className="border-b border-dls-border/70 bg-dls-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search vault…"
          value={props.searchQuery}
          onChange={(e) => props.onSearchChange(e.target.value)}
          className="flex-1 rounded-md border border-dls-border bg-dls-surface px-2 py-1 text-[12px] text-gray-12 placeholder:text-gray-9 focus:border-dls-accent focus:outline-none"
        />
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              props.onSearchChange("");
              props.onSelectTag(null);
              props.onSelectStatus(null);
            }}
            className="rounded-md border border-dls-border px-2 py-1 text-[11px] text-dls-text transition-colors hover:bg-dls-hover"
            title="Clear all filters"
          >
            Clear
          </button>
        ) : null}
      </div>

      {filtersActive ? (
        <div className="mt-1 text-[11px] text-gray-10">
          {props.matchedCount} of {props.totalCount} files match
        </div>
      ) : null}

      {showStatuses ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-10">
            Status
          </div>
          <div className="flex flex-wrap gap-1">
            {props.allStatuses.map((status) => {
              const active = props.selectedStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => props.onSelectStatus(active ? null : status)}
                  className={`rounded-full border px-2 py-[2px] text-[11px] transition-colors ${
                    active
                      ? "border-dls-accent bg-dls-accent/15 text-dls-text"
                      : "border-dls-border text-gray-11 hover:bg-dls-hover hover:text-gray-12"
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showTags ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-10">
            Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {props.allTags.map((tag) => {
              const active = props.selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => props.onSelectTag(active ? null : tag)}
                  className={`rounded-full border px-2 py-[2px] text-[11px] transition-colors ${
                    active
                      ? "border-dls-accent bg-dls-accent/15 text-dls-text"
                      : "border-dls-border text-gray-11 hover:bg-dls-hover hover:text-gray-12"
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {props.loading ? (
        <div className="mt-2 text-[11px] text-gray-10">Indexing vault…</div>
      ) : null}
    </div>
  );
}
