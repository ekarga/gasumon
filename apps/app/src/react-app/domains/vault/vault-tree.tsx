/** @jsxImportSource react */
import { useMemo, useState, type CSSProperties } from "react";

import type { VaultEntry } from "./vault-bridge";

type TreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  children: TreeNode[];
};

function buildTree(entries: VaultEntry[]): TreeNode {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  const dirIndex = new Map<string, TreeNode>();
  dirIndex.set("", root);

  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    const parentSegments = segments.slice(0, -1);
    const parentPath = parentSegments.join("/");
    let parent = dirIndex.get(parentPath);

    if (!parent) {
      // Walk up creating placeholder directories. The recursive walker on
      // the main side already emits dirs before their children, so this is
      // only a defensive fallback.
      let acc = "";
      let current = root;
      for (const segment of parentSegments) {
        acc = acc ? `${acc}/${segment}` : segment;
        let next = dirIndex.get(acc);
        if (!next) {
          next = { name: segment, path: acc, type: "dir", children: [] };
          current.children.push(next);
          dirIndex.set(acc, next);
        }
        current = next;
      }
      parent = current;
    }

    const node: TreeNode = {
      name: entry.name,
      path: entry.path,
      type: entry.type,
      children: [],
    };
    parent.children.push(node);
    if (node.type === "dir") {
      dirIndex.set(node.path, node);
    }
  }

  return root;
}

type VaultTreeProps = {
  entries: VaultEntry[];
  selectedPath: string | null;
  onSelect: (relPath: string) => void;
  loading: boolean;
  error: string | null;
  vaultRoot: string | null;
  onRefresh: () => void;
};

export function VaultTree(props: VaultTreeProps) {
  const root = useMemo(() => buildTree(props.entries), [props.entries]);

  return (
    <div className="flex h-full flex-col bg-dls-surface">
      <div className="flex items-center justify-between border-b border-dls-border/70 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-11">Vault</div>
          <div className="truncate text-[11px] text-gray-10" title={props.vaultRoot ?? ""}>
            {props.vaultRoot ?? "no vault"}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onRefresh}
          disabled={props.loading}
          className="ml-2 rounded-md border border-dls-border px-2 py-1 text-[11px] text-dls-text transition-colors hover:bg-dls-hover disabled:opacity-50"
        >
          {props.loading ? "..." : "Refresh"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {props.error ? (
          <div className="px-3 py-2 text-[12px] text-red-10">{props.error}</div>
        ) : null}
        {!props.error && props.entries.length === 0 && !props.loading ? (
          <div className="px-3 py-2 text-[12px] text-gray-10">
            Empty vault. Drop markdown files into the vault directory to see them here.
          </div>
        ) : null}
        <ul className="text-[12px]">
          {root.children.map((child) => (
            <TreeNodeView
              key={child.path}
              node={child}
              depth={0}
              selectedPath={props.selectedPath}
              onSelect={props.onSelect}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

type TreeNodeProps = {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (relPath: string) => void;
};

function TreeNodeView(props: TreeNodeProps) {
  const { node, depth, selectedPath, onSelect } = props;
  const [expanded, setExpanded] = useState(depth === 0);
  const indentStyle: CSSProperties = { paddingLeft: `${8 + depth * 14}px` };

  if (node.type === "dir") {
    return (
      <li>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-1 py-1 pr-2 text-left text-gray-12 transition-colors hover:bg-dls-hover"
          style={indentStyle}
        >
          <span className="inline-block w-3 text-gray-10">{expanded ? "▾" : "▸"}</span>
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {expanded ? (
          <ul>
            {node.children.map((child) => (
              <TreeNodeView
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const isSelected = selectedPath === node.path;
  const isMarkdown = node.name.toLowerCase().endsWith(".md");
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-1 py-1 pr-2 text-left transition-colors ${
          isSelected
            ? "bg-dls-accent/15 text-dls-text"
            : "text-gray-11 hover:bg-dls-hover hover:text-gray-12"
        }`}
        style={indentStyle}
      >
        <span className="inline-block w-3" aria-hidden />
        <span className="truncate">
          {isMarkdown ? <span className="text-gray-10">●</span> : <span className="text-gray-9">○</span>}{" "}
          {node.name}
        </span>
      </button>
    </li>
  );
}
