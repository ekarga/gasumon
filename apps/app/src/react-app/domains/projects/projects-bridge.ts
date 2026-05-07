/**
 * Renderer-side wrapper for the `projects` namespace on the Electron preload
 * bridge. Lists top-level subdirectories of a chosen root (default ~/Desktop)
 * for use as workspace candidates.
 */

export type ProjectFolder = {
  name: string;
  path: string;
  mtime: number;
};

export type ListProjectsResult =
  | { ok: true; root: string; projects: ProjectFolder[] }
  | { ok: false; error: string };

type ProjectsBridge = {
  list(rootPath?: string): Promise<ListProjectsResult>;
};

function getBridge(): ProjectsBridge | null {
  if (typeof window === "undefined") return null;
  const electron = window.__OPENWORK_ELECTRON__;
  const raw = electron?.projects;
  if (!raw || !raw.list) return null;
  return {
    list: (rootPath?: string) => raw.list!(rootPath) as Promise<ListProjectsResult>,
  };
}

export function isProjectsBridgeAvailable(): boolean {
  return getBridge() !== null;
}

export async function listProjects(rootPath?: string): Promise<ListProjectsResult> {
  const bridge = getBridge();
  if (!bridge) {
    return { ok: false, error: "projects bridge not available (running outside Electron)" };
  }
  return bridge.list(rootPath);
}

/**
 * Custom event the projects view dispatches to ask session-route to either
 * open the existing workspace at `folderPath` or create one + an initial
 * session. session-route is the source of truth for workspace + session
 * orchestration; this event is the only contract between the two.
 */
export const PROJECTS_OPEN_EVENT = "openwork:projects:open-folder" as const;

export type ProjectsOpenEventDetail = {
  folderPath: string;
  name: string;
};

export function dispatchOpenProject(detail: ProjectsOpenEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROJECTS_OPEN_EVENT, { detail }));
}
