import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CaseEmailViewer } from "@/components/cases/CaseEmailViewer";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, Paperclip, Image, PenTool, FileText, File, ExternalLink, Tag, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface JobEmailTabProps {
  jobId: string;
  linkField: "linked_work_order_id" | "linked_project_id";
}

const CATEGORIES = [
  { value: "image", label: "Bilder", icon: Image },
  { value: "drawing", label: "Tegninger", icon: PenTool },
  { value: "fdv", label: "FDV", icon: FileText },
  { value: "other", label: "Annet", icon: File },
];

const CATEGORY_MAP: Record<string, string> = {
  image: "Bilder",
  drawing: "Tegninger",
  fdv: "FDV",
  offer: "Tilbud",
  contract: "Kontrakt",
  other: "Annet",
};

interface AttachmentDoc {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number | null;
  category: string;
  ai_category: string | null;
  ai_confidence: number | null;
  source_type: string;
  storage_bucket: string;
  created_at: string;
}

export function JobEmailTab({ jobId, linkField }: JobEmailTabProps) {
  const [items, setItems] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<AttachmentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    // Find cases linked to this job/project
    const { data: cases } = await supabase
      .from("cases")
      .select("id")
      .eq(linkField, jobId);

    if (!cases || cases.length === 0) {
      setItems([]);
      setAttachments([]);
      setLoading(false);
      return;
    }

    const caseIds = cases.map((c: any) => c.id);

    // Fetch email items and email-sourced attachments in parallel
    const [emailsRes, attachmentsRes] = await Promise.all([
      supabase
        .from("case_items")
        .select("*")
        .in("case_id", caseIds)
        .eq("type", "email")
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("id, file_name, file_path, mime_type, file_size, category, ai_category, ai_confidence, source_type, storage_bucket, created_at")
        .eq("source_type", "email")
        .eq("entity_id", jobId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    setItems((emailsRes.data as any[]) || []);
    setAttachments((attachmentsRes.data as AttachmentDoc[]) || []);
    setLoading(false);
  }, [jobId, linkField]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCategoryChange = async (docId: string, newCategory: string) => {
    const { error } = await supabase
      .from("documents")
      .update({ category: newCategory })
      .eq("id", docId);
    if (error) {
      toast.error("Kunne ikke oppdatere kategori");
    } else {
      setAttachments(prev => prev.map(d => d.id === docId ? { ...d, category: newCategory } : d));
      toast.success("Kategori oppdatert");
    }
  };

  const openAttachment = async (doc: AttachmentDoc) => {
    if (doc.storage_bucket === "email-attachments") {
      const { data } = await supabase.storage
        .from("email-attachments")
        .createSignedUrl(doc.file_path, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  };

  const filteredAttachments = activeFilter === "all"
    ? attachments
    : attachments.filter(a => a.category === activeFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0 && attachments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Mail className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Ingen e-poster koblet</p>
        <p className="text-xs mt-1">Koble en sak fra Postkontoret for å se e-poster her</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Email Attachments Section */}
      {attachments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" />
              Vedlegg fra e-post
              <Badge variant="secondary" className="text-[10px] h-5">
                {attachments.length}
              </Badge>
            </h3>
          </div>

          {/* Category filter chips */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveFilter("all")}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              Alle ({attachments.length})
            </button>
            {CATEGORIES.map(cat => {
              const count = attachments.filter(a => a.category === cat.value).length;
              if (count === 0) return null;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.value}
                  onClick={() => setActiveFilter(cat.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                    activeFilter === cat.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Attachment list */}
          <div className="space-y-1">
            {filteredAttachments.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-2 rounded-lg border border-border/40 p-2.5 hover:bg-accent/10 transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    {doc.ai_category && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-violet-200 text-violet-600 dark:border-violet-800 dark:text-violet-400">
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {doc.file_size ? formatSize(doc.file_size) : ""}
                  </p>
                </div>

                {/* Category selector */}
                <Select
                  value={doc.category}
                  onValueChange={(v) => handleCategoryChange(doc.id, v)}
                >
                  <SelectTrigger className="h-7 w-24 text-[11px] rounded-lg">
                    <Tag className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="offer" className="text-xs">Tilbud</SelectItem>
                    <SelectItem value="contract" className="text-xs">Kontrakt</SelectItem>
                  </SelectContent>
                </Select>

                <button
                  onClick={() => openAttachment(doc)}
                  className="text-primary hover:text-primary/80 shrink-0"
                  title="Åpne"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email thread viewer */}
      {items.length > 0 && (
        <CaseEmailViewer
          items={items}
          documents={attachments.map(a => ({ id: a.id, file_name: a.file_name }))}
        />
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
