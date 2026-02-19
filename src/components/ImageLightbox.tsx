import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, Download, Trash2 } from "lucide-react";
import type { Attachment } from "@/lib/mock-data";

interface ImageLightboxProps {
  images: Attachment[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (name: string) => void;
  canDelete?: boolean;
}

export function ImageLightbox({
  images,
  initialIndex,
  open,
  onOpenChange,
  onDelete,
  canDelete,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  const current = images[index];
  if (!current) return null;

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
        <DialogDescription className="sr-only">Bildevisning</DialogDescription>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 bg-gradient-to-b from-black/60 to-transparent">
          <p className="text-sm text-white/80 truncate max-w-[60%]">
            {current.name} ({index + 1}/{images.length})
          </p>
          <div className="flex items-center gap-1">
            <a href={current.url} download>
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10">
                <Download className="h-4 w-4" />
              </Button>
            </a>
            {canDelete && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="text-white/80 hover:text-destructive hover:bg-white/10"
                onClick={() => {
                  onDelete(current.name);
                  if (images.length <= 1) {
                    onOpenChange(false);
                  } else if (index >= images.length - 1) {
                    setIndex(index - 1);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Image */}
        <div className="flex items-center justify-center min-h-[60vh] max-h-[90vh] p-12">
          <img
            src={current.url}
            alt={current.name}
            className="max-w-full max-h-[80vh] object-contain rounded"
          />
        </div>

        {/* Navigation arrows */}
        {hasPrev && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
            onClick={() => setIndex(index - 1)}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        )}
        {hasNext && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/80 hover:text-white hover:bg-white/10 h-12 w-12"
            onClick={() => setIndex(index + 1)}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
