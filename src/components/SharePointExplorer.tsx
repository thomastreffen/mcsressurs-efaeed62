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
  AlertTriangle,
  Copy,
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

interface StructuredError {
  message: string;
  requestId: string | null;
  graphStatus: number | null;
  graphErrorCode: string | null;
  step: string | null;
}

interface ResolveSiteForm {
  siteHostname: string;
  sitePath: string;
  basePath: string;
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

/** Parse structured error from edge function response */
function parseError(data: any): StructuredError {
  return {
    message: data?.error || "Ukjent feil",
    requestId: data?.request_id || null,
    graphStatus: data?.graph_status || null,
    graphErrorCode: data?.graph_error_code || null,
    step: data?.step || null,
  };
}

function showErrorToast(err: StructuredError) {
  const details = [
    err.graphStatus && `HTTP ${err.graphStatus}`,
    err.graphErrorCode,
    err.step && `Steg: ${err.step}`,
  ].filter(Boolean).join(" · ");

  toast.error(err.message, {
    description: details || undefined,
    duration: 8000,
    action: err.requestId ? {
      label: "Kopier ref",
      onClick: () => {
        navigator.clipboard.writeText(err.requestId!);
        toast.info("Referanse kopiert til utklippstavlen");
      },
    } : undefined,
  });
}

function InlineError({ error, onDismiss }: { error: StructuredError; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">{error.message}</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
            {error.graphStatus && <span>HTTP {error.graphStatus}</span>}
            {error.graphErrorCode && <span>· {error.graphErrorCode}</span>}
            {error.step && <span>· Steg: {error.step}</span>}
          </div>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error.requestId && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(error.requestId!);
            toast.info("Referanse kopiert");
          }}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
          Kopier feilreferanse: {error.requestId.substring(0, 8)}…
        </button>
      )}
    </div>
  );
}

export function SharePointExplorer({ jobId, companyId, connection, onConnectionChange }: SharePointExplorerProps) {
  const { user } = useAuth();

  // Connect state
  const [projectCode, setProjectCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SharePointFolder[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [searchError, setSearchError] = useState<StructuredError | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [setupForm, setSetupForm] = useState<ResolveSiteForm>({ siteHostname: "mcselektrotavler.sharepoint.com", sitePath: "/sites/BCDokumentarkiv", basePath: "" });
  const [resolving, setResolving] = useState(false);

  // Explorer state
  const [items, setItems] = useState<SharePointItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "name" | "size">("newest");
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [listError, setListError] = useState<StructuredError | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const isConnected = !!connection.folderId;

  // Load files using job_id (server looks up drive/folder)
  const loadFiles = useCallback(async (folderId?: string, query?: string) => {
    if (!connection.folderId) return;

    setLoadingItems(true);
    setListError(null);
    try {
      const sortMap = { newest: "lastModified", name: "name", size: "size" };
      const { data, error } = await supabase.functions.invoke("sharepoint-list", {
        body: {
          job_id: jobId,
          folder_id: folderId && folderId !== connection.folderId ? folderId : undefined,
          query: query || undefined,
          sort: sortMap[sortBy],
        },
      });

      if (error) {
        const parsed = parseError({ error: "Nettverksfeil ved filhenting" });
        setListError(parsed);
        return;
      }

      if (data?.error) {
        const parsed = parseError(data);
        setListError(parsed);
        return;
      }

      setItems(data.items || []);
    } catch (err: any) {
      setListError(parseError({ error: err.message }));
    } finally {
      setLoadingItems(false);
    }
  }, [jobId, connection.folderId, sortBy]);

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
    setSearchError(null);

    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-connect", {
        body: { action: "search", project_code: projectCode.trim(), company_id: companyId },
      });

      // supabase.functions.invoke returns error for network / non-2xx
      // but data may still contain JSON body — prefer data if available
      const result = data ?? {};

      if (error && !data) {
        setSearchError(parseError({ error: typeof error === "string" ? error : (error?.message || "Nettverksfeil. Sjekk tilkoblingen.") }));
        return;
      }

      if (result.error && (!result.folders || result.folders.length === 0)) {
        const parsed = parseError(result);
        if (parsed.step === "config") {
          setShowSetup(true);
        }
        setSearchError(parsed);
        return;
      }

      setSearchResults(result.folders || []);
      if ((result.folders || []).length === 0) {
        setSearchError(parseError({
          error: `Ingen mapper funnet med koden "${projectCode}"`,
          graph_status: 404,
          graph_error_code: "itemNotFound",
          step: "search",
          request_id: result.request_id,
        }));
      }
    } catch (err: any) {
      setSearchError(parseError({ error: err?.message || "Uventet feil under søk" }));
    } finally {
      setSearching(false);
    }
  };

  // Resolve SharePoint site config
  const handleResolveSite = async () => {
    if (!setupForm.siteHostname || !setupForm.sitePath) {
      toast.error("Fyll inn SharePoint-adresse og site-sti");
      return;
    }
    setResolving(true);
    setSearchError(null);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-connect", {
        body: {
          action: "resolve_site",
          site_hostname: setupForm.siteHostname.trim(),
          site_path: setupForm.sitePath.trim().replace(/^\/+/, "/"),
          base_path: setupForm.basePath.trim(),
        },
      });

      const result = data ?? {};

      if ((error && !data) || result.error) {
        setSearchError(parseError(result.error ? result : { error: typeof error === "string" ? error : (error?.message || "Resolve feilet") }));
        return;
      }

      toast.success(`SharePoint konfigurert: ${result.site_name || "OK"}`, {
        description: `Drive: ${result.drive_name || result.drive_id}`,
      });
      setShowSetup(false);
      setSearchError(null);
    } catch (err: any) {
      setSearchError(parseError({ error: err?.message || "Uventet feil under oppslag" }));
    } finally {
      setResolving(false);
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

      const result = data ?? {};

      if ((error && !data) || result.error) {
        showErrorToast(parseError(result.error ? result : { error: typeof error === "string" ? error : (error?.message || "Kobling feilet") }));
        return;
      }

      toast.success("SharePoint-mappe koblet!");
      setSearchResults([]);
      setProjectCode("");
      setSearchError(null);
      onConnectionChange();
    } catch (err: any) {
      showErrorToast(parseError({ error: err?.message || "Uventet feil under kobling" }));
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-connect", {
        body: { action: "disconnect", job_id: jobId },
      });
      const result = data ?? {};
      if ((error && !data) || result.error) {
        showErrorToast(parseError(result.error ? result : { error: typeof error === "string" ? error : (error?.message || "Frakobling feilet") }));
        return;
      }
      toast.success("SharePoint-kobling fjernet");
      onConnectionChange();
    } catch (err: any) {
      showErrorToast(parseError({ error: err?.message || "Uventet feil under frakobling" }));
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

  // Upload file – now uses job_id, server looks up drive/folder
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`For stor fil: ${file.name}`, { description: "Maks 50 MB" });
        continue;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("job_id", jobId);
        // Only send subfolder if navigated deeper
        if (currentFolderId && currentFolderId !== connection.folderId) {
          formData.append("folder_id", currentFolderId);
        }

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
          showErrorToast(parseError(data));
          continue;
        }

        toast.success(`${file.name} lastet opp til SharePoint`);
      } catch (err: any) {
        showErrorToast(parseError({ error: err.message }));
      }
    }

    if (uploadRef.current) uploadRef.current.value = "";
    setUploading(false);
    loadFiles(currentFolderId || undefined);
  };

  // Preview a file – uses job_id
  const handlePreview = async (item: SharePointItem) => {
    if (item.isFolder) {
      navigateToFolder(item);
      return;
    }

    setLoadingPreview(true);
    setPreviewName(item.name);

    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-preview-url", {
        body: { job_id: jobId, item_id: item.id },
      });

      if (error || data?.error) {
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
              onChange={(e) => { setProjectCode(e.target.value); setSearchError(null); }}
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

          {/* Inline error under search */}
          {searchError && (
            <div className="max-w-md mx-auto">
              <InlineError error={searchError} onDismiss={() => setSearchError(null)} />
            </div>
          )}

          {/* Setup form when config is missing */}
          {showSetup && (
            <div className="max-w-md mx-auto text-left space-y-3 rounded-lg border border-border/40 bg-card p-4">
              <h5 className="text-sm font-semibold">Konfigurer SharePoint-tilkobling</h5>
              <p className="text-xs text-muted-foreground">
                Oppgi SharePoint-adressen for dokumentarkivet. Eksempel: for URL-en
                <code className="mx-1 text-[11px] bg-muted px-1 py-0.5 rounded">https://firma.sharepoint.com/sites/Dokumentarkiv</code>
              </p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">SharePoint-domene</label>
                  <Input
                    value={setupForm.siteHostname}
                    onChange={(e) => setSetupForm(f => ({ ...f, siteHostname: e.target.value }))}
                    placeholder="firma.sharepoint.com"
                    className="text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Site-sti</label>
                  <Input
                    value={setupForm.sitePath}
                    onChange={(e) => setSetupForm(f => ({ ...f, sitePath: e.target.value }))}
                    placeholder="/sites/Dokumentarkiv"
                    className="text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Rot-mappe (valgfritt)</label>
                  <Input
                    value={setupForm.basePath}
                    onChange={(e) => setSetupForm(f => ({ ...f, basePath: e.target.value }))}
                    placeholder="f.eks. Drift"
                    className="text-sm mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">Undermappen der prosjektmappene ligger</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleResolveSite} disabled={resolving} className="gap-1.5">
                  {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Koble til
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowSetup(false); setSearchError(null); }}>
                  Avbryt
                </Button>
              </div>
            </div>
          )}

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

      {/* List error */}
      {listError && (
        <InlineError error={listError} onDismiss={() => setListError(null)} />
      )}

      {/* File list */}
      {loadingItems ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !listError && filteredItems.length === 0 ? (
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
