import { useState } from "react";
import { Copy, Download, FileWarning } from "lucide-react";
import { cn } from "../../lib/utils";
import { executionWorkspacesApi } from "../../api/execution-workspaces";
import { MarkdownBody } from "../MarkdownBody";

const LINE_LIMIT = 10_000;

interface FileViewerProps {
  content: string;
  language: string;
  filePath: string;
  binary: boolean;
  workspaceId: string;
  className?: string;
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy file content"
      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeView({ content }: { content: string }) {
  const allLines = content.split("\n");
  const truncated = allLines.length > LINE_LIMIT;
  const lines = truncated ? allLines.slice(0, LINE_LIMIT) : allLines;
  const gutterWidth = String(lines.length).length;

  return (
    <div className="overflow-x-auto font-mono text-xs leading-relaxed">
      {truncated && (
        <div className="border-b border-border bg-yellow-500/10 px-4 py-1.5 text-xs text-yellow-600 dark:text-yellow-400">
          File truncated at 10,000 lines
        </div>
      )}
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <td
                className="select-none pr-4 text-right text-muted-foreground"
                style={{ width: `${gutterWidth + 2}ch`, minWidth: `${gutterWidth + 2}ch` }}
              >
                {i + 1}
              </td>
              <td className="whitespace-pre">{line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FileViewer({
  content,
  language,
  filePath,
  binary,
  workspaceId,
  className,
}: FileViewerProps) {
  const downloadHref = executionWorkspacesApi.downloadUrl(workspaceId, filePath);

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-md border border-border", className)}>
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
        <span className="truncate font-mono text-xs text-muted-foreground">{filePath}</span>
        <div className="flex shrink-0 items-center gap-1 pl-2">
          {!binary && <CopyButton content={content} />}
          <a
            href={downloadHref}
            download
            title="Download file"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      </div>

      <div className="min-h-0 overflow-auto">
        {binary ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <FileWarning className="h-8 w-8" />
            <p className="text-sm">Binary file — cannot display</p>
            <a
              href={downloadHref}
              download
              className="text-xs underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Download to view
            </a>
          </div>
        ) : language === "markdown" ? (
          <div className="px-6 py-4">
            <MarkdownBody>{content}</MarkdownBody>
          </div>
        ) : (
          <CodeView content={content} />
        )}
      </div>
    </div>
  );
}
