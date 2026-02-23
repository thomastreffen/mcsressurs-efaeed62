import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Paperclip, X, FileText, Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".gif", ".webp"];

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[^\w\s.\-()]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 200);
}

function isAllowedFile(file: File): boolean {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);
}

export type FileUploadStatus = "pending" | "uploading" | "done" | "error";

export interface ManagedFile {
  file: File;
  status: FileUploadStatus;
  progress: number;
  error?: string;
}

interface FileUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  existingAttachments?: { name: string; url: string }[];
  onRemoveExisting?: (name: string) => void;
  /** Optional managed mode with upload status per file */
  managedFiles?: ManagedFile[];
  onRetry?: (index: number) => void;
}

export function FileUpload({
  files,
  onChange,
  existingAttachments,
  onRemoveExisting,
  managedFiles,
  onRetry,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const valid = newFiles.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`Filen er for stor. Maks ${MAX_FILE_SIZE_MB}MB.`, {
          description: `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`,
        });
        return false;
      }
      if (!isAllowedFile(f)) {
        toast.error(`Filtypen er ikke støttet`, {
          description: `${f.name} – Tillatte typer: PDF, Word, Excel, PNG, JPG`,
        });
        return false;
      }
      return true;
    });

    // Sanitize names by creating new File objects
    const sanitized = valid.map((f) => {
      const cleanName = sanitizeFileName(f.name);
      if (cleanName !== f.name) {
        return new File([f], cleanName, { type: f.type });
      }
      return f;
    });

    onChange([...files, ...sanitized]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const displayFiles: ManagedFile[] = managedFiles || files.map((f) => ({ file: f, status: "pending" as FileUploadStatus, progress: 0 }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Legg til filer
        </Button>
        <span className="text-xs text-muted-foreground">
          Maks {MAX_FILE_SIZE_MB} MB per fil · PDF, Word, Excel, bilder
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleAdd}
        className="hidden"
        accept={ALLOWED_EXTENSIONS.join(",")}
      />

      {(existingAttachments?.length || 0) > 0 && (
        <div className="space-y-1">
          {existingAttachments!.map((att) => (
            <div key={att.name} className="flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1.5 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{att.name}</span>
              {onRemoveExisting && (
                <button
                  type="button"
                  onClick={() => onRemoveExisting(att.name)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {displayFiles.length > 0 && (
        <div className="space-y-1.5">
          {displayFiles.map((mf, i) => (
            <div key={`${mf.file.name}-${i}`} className="rounded-md border border-border/60 bg-card px-2.5 py-2 text-sm space-y-1">
              <div className="flex items-center gap-2">
                {mf.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                {mf.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
                {mf.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                {mf.status === "pending" && <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}

                <span className="truncate flex-1">{mf.file.name}</span>

                <span className="text-xs text-muted-foreground shrink-0">
                  {mf.file.size < 1024 * 1024
                    ? `${(mf.file.size / 1024).toFixed(0)} KB`
                    : `${(mf.file.size / 1024 / 1024).toFixed(1)} MB`}
                </span>

                {mf.status === "error" && onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(i)}
                    className="text-primary hover:text-primary/80"
                    title="Prøv igjen"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}

                {(mf.status === "pending" || mf.status === "error") && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {mf.status === "uploading" && (
                <Progress value={mf.progress} className="h-1" />
              )}

              {mf.status === "error" && mf.error && (
                <p className="text-xs text-destructive">{mf.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
