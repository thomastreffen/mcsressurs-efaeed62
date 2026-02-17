import { type Attachment } from "@/lib/mock-data";
import { FileText, Download, X } from "lucide-react";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentListProps {
  attachments: Attachment[];
  onRemove?: (name: string) => void;
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vedlegg</p>
      {attachments.map((att) => (
        <div
          key={att.name}
          className="flex items-center gap-2 rounded-md border bg-secondary/40 px-2.5 py-2 text-sm"
        >
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 font-medium">{att.name}</span>
          {att.size && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatFileSize(att.size)}
            </span>
          )}
          <a
            href={att.url}
            download={att.name}
            className="text-primary hover:text-primary/80 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(att.name)}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
