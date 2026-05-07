/** @jsxImportSource react */
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const VAULT_LINK_PROTOCOL = "vault:";

/**
 * Pre-process the markdown source to convert Obsidian-style wikilinks
 * (`[[name]]`, `[[name|alias]]`) into standard markdown links with a
 * synthetic `vault:` URL scheme. The custom <a> renderer below handles
 * clicks on those URLs by resolving against the vault tree.
 */
function preprocessWikilinks(text: string): string {
  return text.replace(/\[\[([^\]\n]+)\]\]/g, (_, raw) => {
    const inner = String(raw).trim();
    const [target, alias] = inner.split("|").map((part) => part.trim());
    if (!target) return "";
    const label = alias || target;
    return `[${label}](${VAULT_LINK_PROTOCOL}${encodeURIComponent(target)})`;
  });
}

type WikilinkResolver = (target: string) => string | null;

type VaultViewerProps = {
  filePath: string | null;
  content: string | null;
  loading: boolean;
  error: string | null;
  /** Returns the vault-relative path that a wikilink target resolves to, or null. */
  resolveWikilink: WikilinkResolver;
  /** Open a vault-relative path in this same viewer pane. */
  onOpenPath: (relPath: string) => void;
};

function MarkdownCodeBlock(props: { className?: string; children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-[14px] border border-dls-border/70 bg-gray-1/80 px-4 py-3 text-[12px] leading-6 text-gray-12">
      <code className={props.className}>{props.children}</code>
    </pre>
  );
}

function buildComponents(props: VaultViewerProps): Components {
  return {
    a({ href, children }) {
      if (typeof href === "string" && href.startsWith(VAULT_LINK_PROTOCOL)) {
        const rawTarget = decodeURIComponent(href.slice(VAULT_LINK_PROTOCOL.length));
        const resolved = props.resolveWikilink(rawTarget);
        const broken = resolved === null;
        return (
          <button
            type="button"
            onClick={() => {
              if (resolved) props.onOpenPath(resolved);
            }}
            className={`underline underline-offset-2 ${
              broken ? "text-red-10 cursor-help" : "text-dls-accent hover:text-[var(--dls-accent-hover)]"
            }`}
            title={broken ? `No file matches "${rawTarget}" in this vault` : resolved ?? undefined}
          >
            {children}
          </button>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 text-dls-accent hover:text-[var(--dls-accent-hover)]"
        >
          {children}
        </a>
      );
    },
    pre({ children }) {
      return (
        <pre className="my-4 overflow-x-auto rounded-[14px] border border-dls-border/70 bg-gray-1/80 px-4 py-3 text-[12px] leading-6 text-gray-12">
          {children}
        </pre>
      );
    },
    code({ className, children }) {
      const isBlock = Boolean(className?.includes("language-"));
      if (isBlock) {
        return <MarkdownCodeBlock className={className}>{children}</MarkdownCodeBlock>;
      }
      return (
        <code className="rounded-md bg-gray-2/70 px-1.5 py-0.5 font-mono text-[0.92em] text-gray-12">
          {children}
        </code>
      );
    },
    blockquote({ children }) {
      return (
        <blockquote className="my-4 border-l-4 border-dls-border pl-4 italic text-gray-11">
          {children}
        </blockquote>
      );
    },
    table({ children }) {
      return <table className="my-4 w-full border-collapse">{children}</table>;
    },
    th({ children }) {
      return <th className="border border-dls-border bg-dls-hover p-2 text-left">{children}</th>;
    },
    td({ children }) {
      return <td className="border border-dls-border p-2 align-top">{children}</td>;
    },
    hr() {
      return <hr className="my-6 h-px border-none bg-gray-4" />;
    },
  };
}

const markdownClassName = `markdown-content max-w-none text-gray-12
  [&_strong]:font-semibold
  [&_em]:italic
  [&_h1]:my-5 [&_h1]:text-2xl [&_h1]:font-semibold
  [&_h2]:my-4 [&_h2]:text-xl [&_h2]:font-semibold
  [&_h3]:my-3 [&_h3]:text-lg [&_h3]:font-semibold
  [&_p]:my-3 [&_p]:leading-relaxed
  [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6
  [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6
  [&_li]:my-1
`.trim();

function VaultViewerInner(props: VaultViewerProps) {
  const components = useMemo(() => buildComponents(props), [props]);
  const processed = useMemo(
    () => (props.content ? preprocessWikilinks(props.content) : ""),
    [props.content],
  );

  if (!props.filePath) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-gray-10">
        Select a file from the vault to read it.
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="px-6 py-4 text-[13px] text-red-10">
        Could not read <span className="font-mono">{props.filePath}</span>: {props.error}
      </div>
    );
  }

  if (props.loading || props.content === null) {
    return <div className="px-6 py-4 text-[13px] text-gray-10">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-dls-border/60 px-6 py-2 text-[11px] text-gray-10">
        <span className="font-mono">{props.filePath}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className={markdownClassName}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
            {processed}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export const VaultViewer = memo(VaultViewerInner);
VaultViewer.displayName = "VaultViewer";
