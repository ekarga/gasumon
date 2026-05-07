/** @jsxImportSource react */
import { useCallback, useEffect, useState } from "react";

import {
  dispatchOpenProject,
  isProjectsBridgeAvailable,
  listProjects,
  type ProjectFolder,
} from "./projects-bridge";

const PROJECTS_ROOT_KEY = "openwork.projects.root.v1";

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
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore persistence failures
  }
}

function formatRelative(mtime: number): string {
  const diff = Date.now() - mtime;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(mtime).toLocaleDateString();
}

export function ProjectsRoute() {
  const [bridgeAvailable] = useState(() => isProjectsBridgeAvailable());
  const [root, setRoot] = useState<string | null>(() => readPersisted(PROJECTS_ROOT_KEY));
  const [projects, setProjectsList] = useState<ProjectFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const refresh = useCallback(async () => {
    if (!bridgeAvailable) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects(root ?? undefined);
      if (!result.ok) {
        setError(result.error);
        setProjectsList([]);
        return;
      }
      if (result.root !== root) {
        setRoot(result.root);
        writePersisted(PROJECTS_ROOT_KEY, result.root);
      }
      setProjectsList(result.projects);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [bridgeAvailable, root]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onOpen = useCallback((folder: ProjectFolder) => {
    dispatchOpenProject({ folderPath: folder.path, name: folder.name });
  }, []);

  if (!bridgeAvailable) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-gray-10">
        The projects view requires the OpenWork desktop app — file system access is not
        available outside Electron.
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const visible = q
    ? projects.filter(
        (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
      )
    : projects;

  return (
    <div className="flex h-full flex-col bg-dls-surface">
      <div className="border-b border-dls-border/70 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-12">Projects</h1>
            <div className="text-[12px] text-gray-10" title={root ?? ""}>
              {root ?? "no root"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-md border border-dls-border px-3 py-1 text-[12px] text-dls-text transition-colors hover:bg-dls-hover disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter projects…"
          className="mt-3 w-full rounded-md border border-dls-border bg-dls-surface px-3 py-1.5 text-[13px] text-gray-12 placeholder:text-gray-9 focus:border-dls-accent focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {error ? (
          <div className="rounded-md border border-red-7 bg-red-3/40 px-3 py-2 text-[12px] text-red-11">
            {error}
          </div>
        ) : null}
        {!error && visible.length === 0 && !loading ? (
          <div className="text-[13px] text-gray-10">
            {projects.length === 0
              ? "No subdirectories found in this root."
              : "No projects match this filter."}
          </div>
        ) : null}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project) => (
            <li key={project.path}>
              <button
                type="button"
                onClick={() => onOpen(project)}
                className="group block w-full rounded-lg border border-dls-border bg-dls-surface px-4 py-3 text-left transition-colors hover:border-dls-accent hover:bg-dls-hover"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate font-medium text-gray-12">{project.name}</div>
                  <div className="shrink-0 text-[10px] text-gray-10">
                    {formatRelative(project.mtime)}
                  </div>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-gray-9" title={project.path}>
                  {project.path}
                </div>
                <div className="mt-2 text-[11px] text-gray-10 transition-colors group-hover:text-dls-accent">
                  Open as workspace →
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
