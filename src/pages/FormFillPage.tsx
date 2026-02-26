import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Lock,
  CheckCircle2,
  Save,
  PenTool,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { FormField, FormRule, FormInstanceStatus } from "@/lib/form-types";
import { FORM_STATUS_CONFIG } from "@/lib/form-types";

export default function FormFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [instance, setInstance] = useState<any>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [rules, setRules] = useState<FormRule[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [templateTitle, setTemplateTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [showSignDialog, setShowSignDialog] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchInstance = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("form_instances")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) {
      setLoading(false);
      return;
    }

    setInstance(data);
    setAnswers(((data as any).answers as Record<string, any>) || {});

    // Load version fields
    const { data: ver } = await supabase
      .from("form_template_versions")
      .select("fields, rules")
      .eq("id", (data as any).version_id)
      .single();

    if (ver) {
      setFields(((ver as any).fields || []) as FormField[]);
      setRules(((ver as any).rules || []) as FormRule[]);
    }

    // Load template title
    const { data: tpl } = await supabase
      .from("form_templates")
      .select("title")
      .eq("id", (data as any).template_id)
      .single();

    if (tpl) setTemplateTitle((tpl as any).title);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchInstance();
  }, [fetchInstance]);

  const isLocked = !!instance?.locked_at;
  const status = (instance?.status as FormInstanceStatus) || "not_started";

  const saveAnswers = useCallback(
    async (newAnswers: Record<string, any>) => {
      if (!id || isLocked) return;
      const newStatus = status === "not_started" ? "in_progress" : status;
      await supabase
        .from("form_instances")
        .update({ answers: newAnswers as any, status: newStatus })
        .eq("id", id);
    },
    [id, isLocked, status]
  );

  const handleAnswerChange = (fieldId: string, value: any) => {
    const updated = { ...answers, [fieldId]: value };
    setAnswers(updated);

    // Debounced autosave
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => saveAnswers(updated), 1500);
  };

  const handleComplete = async () => {
    if (!id) return;
    setSaving(true);
    await supabase
      .from("form_instances")
      .update({ answers: answers as any, status: "completed" })
      .eq("id", id);
    toast.success("Skjema markert som ferdig");
    fetchInstance();
    setSaving(false);
  };

  const handleSign = async () => {
    if (!id || !signerName.trim()) return;
    setSigning(true);

    // Insert signature
    const { error } = await supabase.from("form_signatures").insert({
      instance_id: id,
      signer_name: signerName,
      signer_role: isAdmin ? "admin" : "user",
      signature_data: `Signert av ${signerName} den ${new Date().toISOString()}`,
    });

    if (error) {
      toast.error("Kunne ikke signere", { description: error.message });
      setSigning(false);
      return;
    }

    // Lock and set status
    await supabase
      .from("form_instances")
      .update({
        status: "signed",
        locked_at: new Date().toISOString(),
        locked_by: user?.id,
      })
      .eq("id", id);

    toast.success("Skjema signert og låst");
    setShowSignDialog(false);
    fetchInstance();
    setSigning(false);
  };

  const handleUnlock = async () => {
    if (!id || !isAdmin) return;
    const reason = prompt("Begrunnelse for opplåsing:");
    if (!reason) return;

    await supabase
      .from("form_instances")
      .update({
        locked_at: null,
        locked_by: null,
        unlock_reason: reason,
        status: "completed",
      })
      .eq("id", id);

    toast.success("Skjema låst opp");
    fetchInstance();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold">Skjema ikke funnet</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Tilbake</Button>
        </div>
      </div>
    );
  }

  const statusCfg = FORM_STATUS_CONFIG[status];

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold">{templateTitle}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> Låst
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        {fields
          .sort((a, b) => a.order - b.order)
          .map((field) => {
            const value = answers[field.id];
            const needsComment = rules.some(
              (r) =>
                r.field_id === field.id &&
                r.action === "require_comment" &&
                r.value === "no" &&
                value === "no"
            );

            if (field.type === "section_header") {
              return (
                <div key={field.id} className="pt-4 pb-1 border-b border-border">
                  <h2 className="text-sm font-bold text-foreground">{field.label}</h2>
                  {field.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
                  )}
                </div>
              );
            }

            return (
              <div key={field.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <label className="text-sm font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </label>

                {field.type === "checkbox_yes_no" && (
                  <div className="flex gap-2">
                    {[
                      { val: "yes", label: "Ja" },
                      { val: "no", label: "Nei" },
                    ].map((opt) => (
                      <Button
                        key={opt.val}
                        variant={value === opt.val ? "default" : "outline"}
                        size="sm"
                        className="rounded-xl flex-1"
                        disabled={isLocked}
                        onClick={() => handleAnswerChange(field.id, opt.val)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                )}

                {field.type === "checkbox_list" && (
                  <div className="space-y-1.5">
                    {(field.options || []).map((opt, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Array.isArray(value) ? value.includes(opt) : false}
                          disabled={isLocked}
                          onChange={(e) => {
                            const current = Array.isArray(value) ? [...value] : [];
                            if (e.target.checked) {
                              handleAnswerChange(field.id, [...current, opt]);
                            } else {
                              handleAnswerChange(
                                field.id,
                                current.filter((v: string) => v !== opt)
                              );
                            }
                          }}
                          className="rounded"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {field.type === "text" && (
                  <Input
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl h-9"
                  />
                )}

                {field.type === "textarea" && (
                  <Textarea
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl"
                    rows={3}
                  />
                )}

                {field.type === "number" && (
                  <Input
                    type="number"
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl h-9"
                  />
                )}

                {field.type === "date" && (
                  <Input
                    type="date"
                    value={value || ""}
                    onChange={(e) => handleAnswerChange(field.id, e.target.value)}
                    disabled={isLocked}
                    className="rounded-xl h-9"
                  />
                )}

                {field.type === "signature" && (
                  <div className="rounded-lg border-2 border-dashed border-border bg-muted/10 p-4 text-center">
                    {value ? (
                      <p className="text-xs text-success flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Signert
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Signatur legges til ved fullføring</p>
                    )}
                  </div>
                )}

                {field.type === "photo_upload" && (
                  <div className="rounded-lg border-2 border-dashed border-border bg-muted/10 p-4 text-center">
                    <p className="text-xs text-muted-foreground">Bildeopplasting (kommer snart)</p>
                  </div>
                )}

                {/* Require comment rule */}
                {needsComment && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-medium text-destructive">
                      Kommentar påkrevd ved "Nei"
                    </label>
                    <Textarea
                      value={answers[`${field.id}_comment`] || ""}
                      onChange={(e) =>
                        handleAnswerChange(`${field.id}_comment`, e.target.value)
                      }
                      disabled={isLocked}
                      className="rounded-xl"
                      rows={2}
                      placeholder="Beskriv avvik..."
                    />
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Bottom action bar */}
      {!isLocked && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-4 flex items-center justify-between z-30">
          <p className="text-xs text-muted-foreground">Autolagring aktiv</p>
          <div className="flex items-center gap-2">
            {status !== "signed" && status !== "completed" && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={handleComplete}
                disabled={saving}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ferdigstill
              </Button>
            )}
            {(status === "completed" || status === "in_progress") && (
              <Button
                size="sm"
                className="rounded-xl gap-1.5"
                onClick={() => setShowSignDialog(true)}
              >
                <PenTool className="h-3.5 w-3.5" />
                Fullfør og signer
              </Button>
            )}
          </div>
        </div>
      )}

      {isLocked && isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-4 flex items-center justify-between z-30">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" /> Skjemaet er låst etter signering
          </p>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={handleUnlock}>
            Lås opp (admin)
          </Button>
        </div>
      )}

      {/* Sign dialog (inline, no modal) */}
      {showSignDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border shadow-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-base font-bold">Signer skjema</h2>
            <p className="text-sm text-muted-foreground">
              Skriv inn ditt fulle navn for å signere og låse skjemaet.
            </p>
            <Input
              placeholder="Ditt navn..."
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="rounded-xl"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setShowSignDialog(false)}
              >
                Avbryt
              </Button>
              <Button
                size="sm"
                className="rounded-xl gap-1.5"
                disabled={!signerName.trim() || signing}
                onClick={handleSign}
              >
                {signing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <PenTool className="h-3.5 w-3.5" />
                Signer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
