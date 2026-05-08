/** @jsxImportSource react */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "react-router-dom";

import {
  appendTodo,
  isTodoBridgeAvailable,
  parseTodoMarkdown,
  readTodoFile,
  removeAtLine,
  stringifyTodos,
  toggleAtLine,
  writeTodoFile,
  type ParsedTodos,
} from "./todos-bridge";

const SAVE_DEBOUNCE_MS = 350;

export function TodosRoute() {
  const [searchParams] = useSearchParams();
  const projectPath = searchParams.get("path");
  const [bridgeAvailable] = useState(() => isTodoBridgeAvailable());

  const [parsed, setParsed] = useState<ParsedTodos | null>(null);
  const [todoPath, setTodoPath] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(true);

  const saveTimer = useRef<number | null>(null);

  const reload = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await readTodoFile(projectPath);
      if (!result.ok) {
        setError(result.error);
        setParsed(null);
        return;
      }
      setTodoPath(result.path);
      setMissing(Boolean(result.missing));
      setParsed(parseTodoMarkdown(result.content));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (!bridgeAvailable) return;
    void reload();
  }, [bridgeAvailable, reload]);

  // Debounced write whenever the parsed state changes (after the initial load).
  // Skip the very first effect run — that's just the load completing.
  const isDirtyRef = useRef(false);
  useEffect(() => {
    if (!parsed) return;
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      return;
    }
    if (!projectPath) return;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        setSaving(true);
        setSaveError(null);
        const result = await writeTodoFile(projectPath, stringifyTodos(parsed));
        if (!result.ok) {
          setSaveError(result.error);
        } else {
          setMissing(false);
        }
        setSaving(false);
      })();
    }, SAVE_DEBOUNCE_MS);
  }, [parsed, projectPath]);

  const onToggle = useCallback((lineIndex: number) => {
    setParsed((prev) => (prev ? toggleAtLine(prev, lineIndex) : prev));
  }, []);

  const onRemove = useCallback((lineIndex: number) => {
    setParsed((prev) => (prev ? removeAtLine(prev, lineIndex) : prev));
  }, []);

  const onAdd = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const text = draft.trim();
      if (!text) return;
      setParsed((prev) => {
        const next = prev ?? { items: [], lines: [] };
        return appendTodo(next, text);
      });
      // Re-parse on next tick so the new item appears in the list.
      window.setTimeout(() => {
        setParsed((prev) => (prev ? parseTodoMarkdown(prev.lines.join("\n")) : prev));
      }, 0);
      setDraft("");
    },
    [draft],
  );

  const visibleItems = useMemo(() => {
    if (!parsed) return [];
    const q = filter.trim().toLowerCase();
    return parsed.items.filter((item) => {
      if (!showDone && item.done) return false;
      if (!q) return true;
      return (
        item.text.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.includes(q))
      );
    });
  }, [parsed, filter, showDone]);

  const allTags = useMemo(() => {
    if (!parsed) return [] as string[];
    const set = new Set<string>();
    for (const item of parsed.items) {
      for (const tag of item.tags) set.add(tag);
    }
    return Array.from(set).sort();
  }, [parsed]);

  const counts = useMemo(() => {
    if (!parsed) return { total: 0, done: 0, remaining: 0 };
    const total = parsed.items.length;
    const done = parsed.items.filter((i) => i.done).length;
    return { total, done, remaining: total - done };
  }, [parsed]);

  if (!bridgeAvailable) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-gray-10">
        The todo dashboard requires the OpenWork desktop app.
      </div>
    );
  }

  if (!projectPath) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-gray-10">
        No project path. Open this view via the command palette while a workspace is active.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-dls-surface">
      <div className="border-b border-dls-border/70 px-6 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-lg font-semibold text-gray-12">Todos</h1>
          <div className="text-[11px] text-gray-10">
            {counts.remaining} open · {counts.done} done
            {saving ? " · saving…" : null}
            {missing ? " · TODO.md will be created on first save" : null}
          </div>
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-gray-10" title={todoPath ?? ""}>
          {todoPath ?? projectPath}
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-7 bg-red-3/30 px-3 py-2 text-[12px] text-red-11">
            {error}
          </div>
        ) : null}
        {saveError ? (
          <div className="mt-2 rounded-md border border-red-7 bg-red-3/30 px-3 py-2 text-[12px] text-red-11">
            Save failed: {saveError}
          </div>
        ) : null}

        <form onSubmit={onAdd} className="mt-3 flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a todo… (Enter to add)"
            className="flex-1 rounded-md border border-dls-border bg-dls-surface px-3 py-1.5 text-[13px] text-gray-12 placeholder:text-gray-9 focus:border-dls-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-md border border-dls-border bg-dls-accent/10 px-3 py-1.5 text-[12px] font-medium text-dls-text transition-colors hover:bg-dls-accent/20 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-36 rounded-md border border-dls-border bg-dls-surface px-2 py-1 text-[12px] text-gray-12 placeholder:text-gray-9 focus:border-dls-accent focus:outline-none"
          />
          <label className="flex items-center gap-1.5 text-[12px] text-gray-11">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Show done
          </label>
          {allTags.length > 0 ? (
            <div className="ml-auto flex flex-wrap gap-1">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setFilter((current) => (current === tag ? "" : tag))}
                  className={`rounded-full border px-2 py-[2px] text-[10px] transition-colors ${
                    filter === tag
                      ? "border-dls-accent bg-dls-accent/15 text-dls-text"
                      : "border-dls-border text-gray-11 hover:bg-dls-hover"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {loading && !parsed ? (
          <div className="text-[13px] text-gray-10">Loading…</div>
        ) : null}
        {!loading && parsed && parsed.items.length === 0 ? (
          <div className="text-[13px] text-gray-10">
            No todos yet. Add one above, or open this project's chat and ask the agent to add some.
          </div>
        ) : null}
        <ul className="space-y-1">
          {visibleItems.map((item) => (
            <li
              key={item.lineIndex}
              className="group flex items-start gap-2 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-dls-border hover:bg-dls-hover/40"
              style={{ paddingLeft: `${8 + item.indent * 2}px` }}
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggle(item.lineIndex)}
                className="mt-1 h-4 w-4 cursor-pointer accent-[var(--dls-accent)]"
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[13px] ${
                    item.done ? "text-gray-9 line-through" : "text-gray-12"
                  }`}
                >
                  {item.text}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.lineIndex)}
                className="invisible shrink-0 rounded-md border border-dls-border px-2 py-[2px] text-[10px] text-gray-11 transition-colors hover:bg-dls-hover group-hover:visible"
                title="Remove this todo"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
