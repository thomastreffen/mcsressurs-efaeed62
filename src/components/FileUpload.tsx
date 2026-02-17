import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X, FileText } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface FileUploadProps {
  files: File[];
  onChange: (files: File[]) => void;
  existingAttachments?: { name: string; url: string }[];
  onRemoveExisting?: (name: string) => void;
}

export function FileUpload({ files, onChange, existingAttachments, onRemoveExisting }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    const valid = newFiles.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} er for stor (maks 10 MB)`);
        return false;
      }
      return true;
    });
    onChange([...files, ...valid]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

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
        <span className="text-xs text-muted-foreground">Maks 10 MB per fil</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleAdd}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
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

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-md bg-accent px-2.5 py-1.5 text-sm">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
