import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  Search,
  Upload,
  Folder,
  FileText,
  Image,
  File,
  ExternalLink,
  Loader2,
  Link2,
  Unlink,
  ChevronRight,
  ArrowUpDown,
  RefreshCw,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SharePointFolder {
  id: string;
  name: string;
  webUrl: string;
  siteId: string;
  driveId: string;
  lastModified?: string;
}

interface SharePointItem {
  id: string;
  name: string;
  isFolder: boolean;
  size: number;
  mimeType: string | null;
  webUrl: string;
  lastModified: string;
  lastModifiedBy: string | null;
  childCount: number;
}

interface SharePointConnection {
  projectCode: string | null;
  siteId: string | null;
  driveId: string | null;
  folderId: string | null;
  folderWebUrl: string | null;
  connectedAt: string | null;
}

interface SharePointExplorerProps {
  jobId: string;
  companyId: string | null;
  connection: SharePointConnection;
  onConnectionChange: () => void;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(item: SharePointItem) {
  if (item.isFolder) return <Folder className="h-4 w-4 text-primary shrink-0" />;
  const mime = item.mimeType || "";
  const ext = item.name.split(".").pop()?.toLowerCase() || "";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
    return <Image className="h-4 w-4 text-green-600 shrink-0" />;
  if (mime.includes("pdf") || ext === "pdf")
    return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  if (mime.includes("word") || ["doc", "docx"].includes(ext))
    return <FileText className="h-4 w-4 text-blue-600 shrink-0" />;
  if (mime.includes("excel") || mime.includes("spreadsheet") || ["xls", "xlsx"].includes(ext))
    return <FileText className="h-4 w-4 text-green-700 shrink-0" />;
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function SharePointExplorer({ jobId, companyId, connection, onConnectionChange }: SharePointExplorerProps) {
  const { user } = useAuth();

  // Connect state
  const [projectCode, setProjectCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SharePointFolder[]>([]);
  const [connecting, setConnecting] = useState(false);

  // Explorer state
  const [items, setItems] = useState<SharePointItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "size">("newest");
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const isConnected = !!connection.folderId;

  // Load files when connected
  const loadFiles = useCallback(async (folderId?: string, query?: string) => {
    if (!connection.driveId) return;
    const targetFolder = folderId || connection.folderId;
    if (!targetFolder) return;

    setLoadingItems(true);
    try {
      const sortMap = { newest: "lastModified", name: "name", size: "size" };
      const { data, error } = await supabase.functions.invoke("sharepoint-list", {
        body: {
          drive_id: connection.driveId,
          folder_id: targetFolder,
          query: query || undefined,
          sort: sortMap[sortBy],
        },
      });

      if (error || data?.error) {
        toast.error("Kunne ikke hente filer", { description: data?.error || error?.message });
        return;
      }

      setItems(data.items || []);
    } catch (err: any) {
      toast.error("Feil ved filhenting", { description: err.message });
    } finally {
      setLoadingItems(false);
    }
  }, [connection.driveId, connection.folderId, sortBy]);

  useEffect(() => {
    if (isConnected) {
      setCurrentFolderId(connection.folderId);
      setBreadcrumb([{ id: connection.folderId!, name: connection.projectCode || "Rot" }]);
      loadFiles();
    }
  }, [isConnected, connection.folderId]);

  // Search for SharePoint folders
  const handleSearch = async () => {
    if (!projectCode.trim()) return;
    setSearching(true);
    setSearchResults([]);

    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-connect", {
        body: { action: "search", project_code: projectCode.trim() },
      });

      if (error || data?.error) {
        toast.error("Søk feilet", { description: data?.error || error?.message });
        return;
      }

      setSearchResults(data.folders || []);
      if ((data.folders || []).length === 0) {
        toast.info("Ingen mapper funnet", { description: `Fant ingen mapper med koden "${projectCode}"` });
      }
    } catch (err: any) {
      toast.error("Søk feilet", { description: err.message });
    } finally {
      setSearching(false);
    }
  };

  // Connect to a folder
  const handleConnect = async (folder: SharePointFolder) => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-connect", {
        body: {
          action: "connect",
          job_id: jobId,
          project_code: projectCode.trim(),
          folder_id: folder.id,
          site_id: folder.siteId,
          drive_id: folder.driveId,
          web_url: folder.webUrl,
        },
      });

      if (error || data?.error) {
        toast.error("Kobling feilet", { description: data?.error || error?.message });
        return;
      }

      toast.success("SharePoint-mappe koblet!");
      setSearchResults([]);
      setProjectCode("");
      onConnectionChange();
    } catch (err: any) {
      toast.error("Kobling feilet", { description: err.message });
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      await supabase.functions.invoke("sharepoint-connect", {
        body: { action: "disconnect", job_id: jobId },
      });
      toast.success("SharePoint-kobling fjernet");
      onConnectionChange();
    } catch (err: any) {
      toast.error("Kunne ikke fjerne kobling", { description: err.message });
    }
  };

  // Navigate into folder
  const navigateToFolder = (item: SharePointItem) => {
    if (!item.isFolder) return;
    setBreadcrumb(prev => [...prev, { id: item.id, name: item.name }]);
    setCurrentFolderId(item.id);
    loadFiles(item.id);
  };

  // Navigate via breadcrumb
  const navigateToBreadcrumb = (index: number) => {
    const target = breadcrumb[index];
    setBreadcrumb(prev => prev.slice(0, index + 1));
    setCurrentFolderId(target.id);
    loadFiles(target.id);
  };

  // Upload file
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !connection.driveId) return;

    setUploading(true);
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`For stor fil: ${file.name}`, { description: "Maks 50 MB" });
        continue;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("drive_id", connection.driveId);
        formData.append("folder_id", currentFolderId || connection.folderId!);
        formData.append("job_id", jobId);
        if (companyId) formData.append("company_id", companyId);

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const session = (await supabase.auth.getSession()).data.session;

        const res = await fetch(`${supabaseUrl}/functions/v1/sharepoint-upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          toast.error(`Opplasting feilet: ${file.name}`, { description: data.error });
          continue;
        }

        toast.success(`${file.name} lastet opp til SharePoint`);
      } catch (err: any) {
        toast.error(`Feil: ${file.name}`, { description: err.message });
      }
    }

    if (uploadRef.current) uploadRef.current.value = "";
    setUploading(false);
    loadFiles(currentFolderId || undefined);
  };

  // Preview a file
  const handlePreview = async (item: SharePointItem) => {
    if (item.isFolder) {
      navigateToFolder(item);
      return;
    }

    setLoadingPreview(true);
    setPreviewName(item.name);

    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-preview-url", {
        body: { drive_id: connection.driveId, item_id: item.id },
      });

      if (error || data?.error) {
        // Fallback to webUrl
        window.open(item.webUrl, "_blank");
        setPreviewName(null);
        return;
      }

      if (data.type === "web" || data.type === "image") {
        window.open(data.previewUrl, "_blank");
        setPreviewName(null);
      } else {
        setPreviewUrl(data.previewUrl);
      }
    } catch {
      window.open(item.webUrl, "_blank");
      setPreviewName(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Search within files
  const handleFileSearch = useCallback(() => {
    loadFiles(currentFolderId || undefined, searchQuery || undefined);
  }, [searchQuery, currentFolderId, loadFiles]);

  // ── NOT CONNECTED: Show connection UI ──
  if (!isConnected) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center space-y-3">
          <Link2 className="h-8 w-8 text-muted-foreground mx-auto" />
          <div>
            <h4 className="text-sm font-semibold">Koble til SharePoint</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Koble denne jobben til en prosjektmappe i SharePoint for å se og laste opp filer direkte.
            </p>
          </div>

          <div className="flex items-center gap-2 max-w-md mx-auto">
            <Input
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
              placeholder="Prosjektkode (f.eks. J12345)"
              className="text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={searching || !projectCode.trim()}
              className="gap-1.5 shrink-0"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Søk
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-w-md mx-auto text-left">
              <p className="text-xs font-medium text-muted-foreground">Velg mappe:</p>
              {searchResults.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => handleConnect(folder)}
                  disabled={connecting}
                  className="w-full flex items-center gap-2 rounded-lg border border-border/40 p-3 hover:bg-accent/10 transition-colors text-left"
                >
                  <Folder className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{folder.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{folder.webUrl}</p>
                  </div>
                  {connecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── CONNECTED: Show file explorer ──
  const filteredItems = searchQuery
    ? items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  return (
    <div className="space-y-3">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs border-green-200 text-green-700 dark:border-green-800 dark:text-green-400">
            <Link2 className="h-3 w-3" />
            SharePoint: {connection.projectCode || "Koblet"}
          </Badge>
          {connection.folderWebUrl && (
            <a
              href={connection.folderWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Åpne i SharePoint
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => loadFiles(currentFolderId || undefined)}
            disabled={loadingItems}
          >
            <RefreshCw className={`h-3 w-3 ${loadingItems ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Last opp
          </Button>
          <input
            ref={uploadRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
            onClick={handleDisconnect}
          >
            <Unlink className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Toolbar: Search + Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFileSearch()}
            placeholder="Søk i filer..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest" className="text-xs">Nyeste</SelectItem>
            <SelectItem value="name" className="text-xs">Navn</SelectItem>
            <SelectItem value="size" className="text-xs">Størrelse</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumb.map((bc, i) => (
              <BreadcrumbItem key={bc.id}>
                {i > 0 && <BreadcrumbSeparator><ChevronRight className="h-3 w-3" /></BreadcrumbSeparator>}
                <BreadcrumbLink
                  onClick={() => navigateToBreadcrumb(i)}
                  className="cursor-pointer text-xs"
                >
                  {bc.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {/* File list */}
      {loadingItems ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Ingen filer funnet</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5 text-xs"
            onClick={() => uploadRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Last opp fil
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Folders first, then files */}
          {filteredItems
            .sort((a, b) => {
              if (a.isFolder && !b.isFolder) return -1;
              if (!a.isFolder && b.isFolder) return 1;
              return 0;
            })
            .map((item) => (
              <button
                key={item.id}
                onClick={() => handlePreview(item)}
                className="w-full flex items-center gap-2.5 rounded-lg border border-border/40 px-3 py-2.5 hover:bg-accent/10 transition-colors text-left group"
              >
                {getFileIcon(item)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {!item.isFolder && item.size > 0 && <span>{formatSize(item.size)}</span>}
                    {item.isFolder && item.childCount > 0 && <span>{item.childCount} elementer</span>}
                    <span>{format(new Date(item.lastModified), "d. MMM yyyy HH:mm", { locale: nb })}</span>
                    {item.lastModifiedBy && <span>· {item.lastModifiedBy}</span>}
                  </div>
                </div>
                {!item.isFolder && (
                  <a
                    href={item.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-primary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {item.isFolder && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
              </button>
            ))}
        </div>
      )}

      {/* Inline preview */}
      {previewUrl && (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-secondary/20">
            <p className="text-xs font-medium truncate">{previewName}</p>
            <button onClick={() => { setPreviewUrl(null); setPreviewName(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <iframe
            src={previewUrl}
            className="w-full h-[500px] border-0"
            title={previewName || "Preview"}
          />
        </div>
      )}

      {loadingPreview && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Laster forhåndsvisning...
        </div>
      )}
    </div>
  );
}
