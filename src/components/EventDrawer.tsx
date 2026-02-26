import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TechnicianMultiSelect } from "./TechnicianMultiSelect";
import { JobStatusBadge } from "./JobStatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import {
  AlertTriangle,
  ExternalLink,
  Clock,
  MapPin,
  User,
  Loader2,
  Save,
  CalendarPlus,
  Link2,
  Search,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { CalendarEvent } from "@/hooks/useCalendarEvents";
import type { JobStatus } from "@/lib/job-status";

/* ── Types ── */
interface ExistingJob {
  id: string;
  title: string;
  customer: string | null;
  start_time: string;
  end_time: string;
  status: string;
  internal_number: string | null;
}

interface ConflictInfo {
  techName: string;
  jobTitle: string;
  start: string;
  end: string;
}

interface EventDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, we're editing an existing event */
  editEvent?: CalendarEvent | null;
  /** Pre-fill date/time for new event (from calendar select) */
  preselectedStart?: Date | null;
  preselectedEnd?: Date | null;
  /** Pre-selected technician */
  preselectedTechId?: string | null;
  /** If creating from a project context */
  projectId?: string | null;
  projectTitle?: string | null;
  /** Callbacks */
  onSaved?: (eventId?: string) => void;
}

export function EventDrawer({
  open,
  onOpenChange,
  editEvent,
  preselectedStart,
  preselectedEnd,
  preselectedTechId,
  projectId,
  projectTitle,
  onSaved,
}: EventDrawerProps) {
  const navigate = useNavigate();
  const isEditing = !!editEvent;

  // Form state
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [techIds, setTechIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Existing job search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExistingJob[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Conflicts
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);

  // Populate form from props
  useEffect(() => {
    if (!open) return;

    if (editEvent) {
      setTitle(editEvent.title);
      setCustomer(editEvent.customer || "");
      setAddress(editEvent.address || "");
      setDescription(editEvent.description || "");
      setDate(format(editEvent.start, "yyyy-MM-dd"));
      setStartTime(format(editEvent.start, "HH:mm"));
      setEndTime(format(editEvent.end, "HH:mm"));
      setTechIds(editEvent.technicians.map((t) => t.id));
      setMode("new");
    } else {
      // New event
      setTitle(projectTitle || "");
      setCustomer("");
      setAddress("");
      setDescription("");
      if (preselectedStart) {
        setDate(format(preselectedStart, "yyyy-MM-dd"));
        setStartTime(format(preselectedStart, "HH:mm"));
      } else {
        setDate("");
        setStartTime("08:00");
      }
      if (preselectedEnd) {
        setEndTime(format(preselectedEnd, "HH:mm"));
      } else {
        setEndTime("16:00");
      }
      setTechIds(preselectedTechId ? [preselectedTechId] : []);
      setMode(projectId ? "existing" : "new");
      setSelectedJobId(projectId || null);
    }
    setConflicts([]);
    setSearchQuery("");
    setSearchResults([]);
  }, [open, editEvent, preselectedStart, preselectedEnd, preselectedTechId, projectId, projectTitle]);

  // Search existing jobs
  useEffect(() => {
    if (mode !== "existing" || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const { data } = await supabase
        .from("events")
        .select("id, title, customer, start_time, end_time, status, internal_number")
        .is("deleted_at", null)
        .or(`title.ilike.%${searchQuery}%,customer.ilike.%${searchQuery}%,internal_number.ilike.%${searchQuery}%`)
        .order("start_time", { ascending: false })
        .limit(10);
      setSearchResults(data || []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, mode]);

  // Conflict check
  const checkConflicts = useCallback(async (d: string, s: string, e: string, techs: string[], excludeId?: string) => {
    if (!d || techs.length === 0) { setConflicts([]); return; }
    try {
      const startISO = new Date(`${d}T${s}`).toISOString();
      const endISO = new Date(`${d}T${e}`).toISOString();

      let query = supabase
        .from("events")
        .select("id, title, start_time, end_time, event_technicians(technician_id, technicians(name))")
        .is("deleted_at", null)
        .lt("start_time", endISO)
        .gt("end_time", startISO);

      if (excludeId) query = query.neq("id", excludeId);

      const { data: overlaps } = await query;
      const found: ConflictInfo[] = [];
      for (const ev of overlaps || []) {
        for (const et of (ev as any).event_technicians || []) {
          if (techs.includes(et.technician_id)) {
            found.push({
              techName: et.technicians?.name || "Ukjent",
              jobTitle: (ev as any).title,
              start: format(new Date((ev as any).start_time), "HH:mm"),
              end: format(new Date((ev as any).end_time), "HH:mm"),
            });
          }
        }
      }
      setConflicts(found);
    } catch { setConflicts([]); }
  }, []);

  // Auto-check conflicts
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      checkConflicts(date, startTime, endTime, techIds, editEvent?.id);
    }, 500);
    return () => clearTimeout(timer);
  }, [date, startTime, endTime, techIds, open, editEvent, checkConflicts]);

  // Save: create or update
  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      if (isEditing && editEvent) {
        // Update existing event
        const startISO = new Date(`${date}T${startTime}`).toISOString();
        const endISO = new Date(`${date}T${endTime}`).toISOString();

        await supabase.from("events")
          .update({ start_time: startISO, end_time: endISO, title, customer, address, description })
          .eq("id", editEvent.id);

        // Sync technicians
        const { data: existing } = await supabase
          .from("event_technicians").select("id, technician_id").eq("event_id", editEvent.id);
        const existingIds = new Set((existing || []).map((e) => e.technician_id));
        const newIds = new Set(techIds);
        const toAdd = techIds.filter((id) => !existingIds.has(id));
        const toRemove = (existing || []).filter((e) => !newIds.has(e.technician_id));

        if (toRemove.length > 0) {
          await supabase.from("event_technicians").delete().in("id", toRemove.map((r) => r.id));
        }
        if (toAdd.length > 0) {
          await supabase.from("event_technicians").insert(
            toAdd.map((tid) => ({ event_id: editEvent.id, technician_id: tid }))
          );
        }
        if (toAdd.length > 0) {
          await supabase.functions.invoke("create-approval", { body: { job_id: editEvent.id } });
        }

        toast.success("Hendelse oppdatert", { description: "Tid og ressurser er lagret." });
        onSaved?.(editEvent.id);
      } else if (mode === "existing" && selectedJobId) {
        // Assign technicians to existing job
        if (date) {
          const startISO = new Date(`${date}T${startTime}`).toISOString();
          const endISO = new Date(`${date}T${endTime}`).toISOString();
          await supabase.from("events").update({ start_time: startISO, end_time: endISO }).eq("id", selectedJobId);
        }

        const { data: existing } = await supabase
          .from("event_technicians").select("technician_id").eq("event_id", selectedJobId);
        const existingIds = new Set((existing || []).map((e) => e.technician_id));
        const newTechs = techIds.filter((id) => !existingIds.has(id));

        if (newTechs.length > 0) {
          await supabase.from("event_technicians").insert(
            newTechs.map((tid) => ({ event_id: selectedJobId, technician_id: tid }))
          );
          await supabase.functions.invoke("create-approval", { body: { job_id: selectedJobId } });
        }

        toast.success("Montør(er) tildelt");
        onSaved?.(selectedJobId);
      } else {
        // Create new event
        if (!title.trim() || techIds.length === 0 || !date) {
          toast.error("Fyll inn tittel, dato og minst én montør");
          setSaving(false);
          return;
        }
        const startISO = new Date(`${date}T${startTime}`).toISOString();
        const endISO = new Date(`${date}T${endTime}`).toISOString();

        const { data: created, error } = await supabase.from("events").insert({
          title: title.trim(),
          customer: customer || null,
          address: address || null,
          description: description || null,
          start_time: startISO,
          end_time: endISO,
          technician_id: techIds[0],
          status: "requested" as any,
          created_by: userId || null,
        }).select("id").single();

        if (error || !created) {
          toast.error("Kunne ikke opprette hendelse", { description: error?.message });
          setSaving(false);
          return;
        }

        await supabase.from("event_technicians").insert(
          techIds.map((tid) => ({ event_id: created.id, technician_id: tid }))
        );
        await supabase.functions.invoke("create-approval", { body: { job_id: created.id } });

        toast.success("Hendelse opprettet og planlagt", {
          description: `${title} er tildelt ${techIds.length} montør(er).`,
        });
        onSaved?.(created.id);
      }

      // Don't auto-close per spec
    } catch (err: any) {
      toast.error("Feil ved lagring", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = isEditing && editEvent ? (
    date !== format(editEvent.start, "yyyy-MM-dd") ||
    startTime !== format(editEvent.start, "HH:mm") ||
    endTime !== format(editEvent.end, "HH:mm") ||
    title !== editEvent.title ||
    JSON.stringify(techIds.sort()) !== JSON.stringify(editEvent.technicians.map((t) => t.id).sort())
  ) : true;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] flex flex-col overflow-y-auto">
        <SheetHeader className="space-y-2">
          <SheetTitle className="flex items-center gap-2">
            {isEditing ? (
              <><Clock className="h-5 w-5 text-primary" />Rediger hendelse</>
            ) : (
              <><CalendarPlus className="h-5 w-5 text-primary" />{projectId ? "Planlegg ressurs" : "Ny hendelse"}</>
            )}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Endre tid, ressurser eller detaljer"
              : projectId
              ? `Tildel tid og montører til ${projectTitle || "prosjektet"}`
              : "Opprett ny hendelse eller knytt til eksisterende prosjekt"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 mt-4 space-y-5">
          {/* Mode tabs (only for new, non-project) */}
          {!isEditing && !projectId && (
            <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "existing")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="new" className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />Ny hendelse
                </TabsTrigger>
                <TabsTrigger value="existing" className="gap-1.5 text-xs">
                  <Link2 className="h-3.5 w-3.5" />Eksisterende prosjekt
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* Existing job search */}
          {mode === "existing" && !isEditing && !projectId && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Søk prosjekt (tittel, kunde, nr)..."
                  className="pl-9"
                />
              </div>
              {searchLoading && (
                <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              )}
              {searchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-border p-1">
                  {searchResults.map((job) => (
                    <button key={job.id} type="button"
                      onClick={() => {
                        setSelectedJobId(job.id);
                        setTitle(job.title);
                      }}
                      className={cn(
                        "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
                        selectedJobId === job.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                      )}>
                      <p className="font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.internal_number} · {job.customer || "Ingen kunde"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project info banner */}
          {projectId && !isEditing && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm font-medium">{projectTitle}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Velg tid og montører</p>
            </div>
          )}

          {/* Edit mode: job info */}
          {isEditing && editEvent && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {editEvent.customer && (
                <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{editEvent.customer}</span>
              )}
              {editEvent.address && (
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{editEvent.address}</span>
              )}
              <JobStatusBadge status={editEvent.status} />
            </div>
          )}

          {/* New event fields */}
          {mode === "new" && !isEditing && !projectId && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Tittel *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="F.eks. Kabellegging 3. etg" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Kunde</Label>
                  <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Kundenavn" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Adresse</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse" className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Beskrivelse</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detaljer..." className="mt-1 min-h-[60px] resize-none" rows={2} />
              </div>
            </div>
          )}

          {/* Edit mode: title & description editable */}
          {isEditing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Tittel</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}

          {/* Date & Time */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tidspunkt</Label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Dato</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Slutt</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Technicians */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ressurser</Label>
            <TechnicianMultiSelect selectedIds={techIds} onChange={setTechIds} />
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">Kalenderkonflikt</p>
              </div>
              {conflicts.map((c, i) => (
                <p key={i} className="text-xs text-amber-700/80 dark:text-amber-400/80 ml-6">
                  {c.techName}: «{c.jobTitle}» ({c.start}–{c.end})
                </p>
              ))}
              <p className="text-xs text-amber-600/70 dark:text-amber-500/70 ml-6">
                Du kan fortsatt lagre, men montøren er allerede booket.
              </p>
            </div>
          )}
        </div>

        <SheetFooter className="mt-4 flex-col gap-2 sm:flex-col">
          <div className="flex gap-2 w-full">
            {isEditing && editEvent && (
              <Button variant="outline" className="flex-1 gap-1.5"
                onClick={() => { onOpenChange(false); navigate(`/projects/${editEvent.id}`); }}>
                <ExternalLink className="h-3.5 w-3.5" />
                Åpne prosjekt
              </Button>
            )}
            <Button className="flex-1 gap-1.5" onClick={handleSave}
              disabled={saving || (isEditing && !hasChanges) || techIds.length === 0}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "Lagrer..." :
               isEditing ? (conflicts.length > 0 ? "Lagre likevel" : "Lagre endringer") :
               conflicts.length > 0 ? "Lagre likevel" : "Opprett og planlegg"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
