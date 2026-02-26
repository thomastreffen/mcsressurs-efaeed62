import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  GripVertical,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Plus,
  Settings2,
} from "lucide-react";
import type { FormField, FormFieldType, FormRule } from "@/lib/form-types";
import { FIELD_TYPE_LABELS, fieldSupportsComment, isSmartField } from "@/lib/form-types";
import { FIELD_ICONS } from "./FormFieldPalette";

interface FormCanvasFieldProps {
  field: FormField;
  index: number;
  totalFields: number;
  rules: FormRule[];
  onUpdate: (id: string, updates: Partial<FormField>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  onRulesChange: (rules: FormRule[]) => void;
  onDragStart: (e: React.DragEvent, idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: (e: React.DragEvent, idx: number) => void;
}

export function FormCanvasField({
  field,
  index,
  totalFields,
  rules,
  onUpdate,
  onRemove,
  onDuplicate,
  onMove,
  onRulesChange,
  onDragStart,
  onDragOver,
  onDrop,
}: FormCanvasFieldProps) {
  const [showSettings, setShowSettings] = useState(false);
  const Icon = FIELD_ICONS[field.type];
  const smart = isSmartField(field.type);

  // Preview rendering for the canvas
  const renderFieldPreview = () => {
    switch (field.type) {
      case "section_header":
        return null; // label is the preview
      case "text":
      case "email":
      case "phone":
      case "number":
      case "date":
      case "time":
      case "address":
        return (
          <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            {field.placeholder || FIELD_TYPE_LABELS[field.type] + "..."}
          </div>
        );
      case "textarea":
        return (
          <div className="rounded-lg border border-border bg-background px-3 py-4 text-xs text-muted-foreground">
            {field.placeholder || "Skriv her..."}
          </div>
        );
      case "checkbox_yes_no":
        return (
          <div className="flex gap-2">
            <div className="rounded-lg border border-border bg-background px-4 py-1.5 text-xs">Ja</div>
            <div className="rounded-lg border border-border bg-background px-4 py-1.5 text-xs">Nei</div>
          </div>
        );
      case "checkbox_list":
        return (
          <div className="space-y-1">
            {(field.options || []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3.5 w-3.5 rounded border border-border" />
                {opt}
              </div>
            ))}
          </div>
        );
      case "dropdown":
        return (
          <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>Velg...</span>
            <ChevronDown className="h-3 w-3" />
          </div>
        );
      case "radio":
        return (
          <div className="space-y-1">
            {(field.options || []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3.5 w-3.5 rounded-full border border-border" />
                {opt}
              </div>
            ))}
          </div>
        );
      case "signature":
        return (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
            Signaturfelt
          </div>
        );
      case "photo_upload":
      case "file_upload":
        return (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/10 px-3 py-4 text-center text-xs text-muted-foreground">
            {field.type === "photo_upload" ? "📷 Last opp bilde" : "📎 Last opp fil"}
          </div>
        );
      default:
        if (smart) {
          return (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
              ⚡ Hentes automatisk fra prosjekt
            </div>
          );
        }
        return null;
    }
  };

  if (field.type === "section_header") {
    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={(e) => onDrop(e, index)}
        className="group relative rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-3">
          <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <Input
            value={field.label}
            onChange={(e) => onUpdate(field.id, { label: e.target.value })}
            className="border-none bg-transparent text-base font-bold p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40"
            placeholder="Seksjonstittel..."
          />
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => onDuplicate(index)} className="p-1 text-muted-foreground hover:text-foreground" title="Dupliser">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onRemove(field.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Slett">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {field.description !== undefined && (
          <Input
            value={field.description || ""}
            onChange={(e) => onUpdate(field.id, { description: e.target.value })}
            className="border-none bg-transparent text-xs text-muted-foreground p-0 h-auto mt-1 ml-7 focus-visible:ring-0 placeholder:text-muted-foreground/30"
            placeholder="Beskrivelse (valgfri)..."
          />
        )}
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      className="group relative rounded-xl border border-border bg-card p-4 cursor-grab active:cursor-grabbing hover:border-primary/20 transition-colors"
    >
      {/* Top bar: drag handle + type badge + actions */}
      <div className="flex items-start gap-2 mb-3">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {/* Label input */}
          <Input
            value={field.label}
            onChange={(e) => onUpdate(field.id, { label: e.target.value })}
            className="border-none bg-transparent text-sm font-semibold p-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40"
            placeholder="Feltnavn..."
          />
          <div className="flex items-center gap-1.5 mt-1">
            <Icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{FIELD_TYPE_LABELS[field.type]}</span>
            {field.required && (
              <span className="text-[10px] text-destructive font-medium">Påkrevd</span>
            )}
            {smart && (
              <span className="text-[10px] text-primary font-medium">Auto</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Flytt opp"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove(index, index + 1)}
            disabled={index === totalFields - 1}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Flytt ned"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-1 text-muted-foreground hover:text-foreground" title="Innstillinger">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDuplicate(index)} className="p-1 text-muted-foreground hover:text-foreground" title="Dupliser">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onRemove(field.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Slett">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Field preview */}
      <div className="ml-6">
        {renderFieldPreview()}
      </div>

      {/* Settings panel (expandable) */}
      {showSettings && (
        <div className="ml-6 mt-3 pt-3 border-t border-border space-y-3">
          {/* Description */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Beskrivelse / hjelpetekst</label>
            <Input
              value={field.description || ""}
              onChange={(e) => onUpdate(field.id, { description: e.target.value })}
              className="rounded-lg h-7 text-xs"
              placeholder="Valgfri beskrivelse..."
            />
          </div>

          {/* Placeholder */}
          {!smart && field.type !== "checkbox_list" && field.type !== "checkbox_yes_no" && field.type !== "radio" && field.type !== "dropdown" && (
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-medium">Plassholdertekst</label>
              <Input
                value={field.placeholder || ""}
                onChange={(e) => onUpdate(field.id, { placeholder: e.target.value })}
                className="rounded-lg h-7 text-xs"
                placeholder="Plassholder..."
              />
            </div>
          )}

          {/* Required toggle */}
          {!smart && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Påkrevd felt</span>
              <Switch
                checked={field.required !== false}
                onCheckedChange={(v) => onUpdate(field.id, { required: v })}
              />
            </label>
          )}

          {/* Comment toggle */}
          {fieldSupportsComment(field.type) && (
            <label className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {field.type === "photo_upload" ? "Tillat bildetekst" : "Tillat kommentar"}
              </span>
              <Switch
                checked={field.allow_comment !== false}
                onCheckedChange={(v) => onUpdate(field.id, { allow_comment: v })}
              />
            </label>
          )}

          {/* Dropdown / Radio options */}
          {(field.type === "dropdown" || field.type === "radio") && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-muted-foreground font-medium">Alternativer</label>
              {(field.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...(field.options || [])];
                      newOpts[i] = e.target.value;
                      onUpdate(field.id, { options: newOpts });
                    }}
                    className="rounded-lg h-7 text-xs flex-1"
                  />
                  <button
                    className="text-muted-foreground hover:text-destructive p-0.5"
                    onClick={() => onUpdate(field.id, { options: (field.options || []).filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg gap-1 text-[10px] h-6 px-2"
                onClick={() => onUpdate(field.id, { options: [...(field.options || []), `Alternativ ${(field.options || []).length + 1}`] })}
              >
                <Plus className="h-3 w-3" /> Legg til
              </Button>
            </div>
          )}

          {/* Checkbox list options */}
          {field.type === "checkbox_list" && (
            <div className="space-y-2">
              <label className="text-[10px] text-muted-foreground font-medium">Sjekkpunkter</label>
              {(field.options || []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...(field.options || [])];
                      newOpts[i] = e.target.value;
                      onUpdate(field.id, { options: newOpts });
                    }}
                    className="rounded-lg h-7 text-xs flex-1"
                  />
                  <button
                    className="text-muted-foreground hover:text-destructive p-0.5"
                    onClick={() => onUpdate(field.id, { options: (field.options || []).filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg gap-1 text-[10px] h-6 px-2"
                onClick={() => onUpdate(field.id, { options: [...(field.options || []), `Punkt ${(field.options || []).length + 1}`] })}
              >
                <Plus className="h-3 w-3" /> Legg til punkt
              </Button>

              <div className="border-t border-border pt-2 space-y-2">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Krev bilde ved Avvik</span>
                  <Switch
                    checked={!!field.require_photo_on_deviation}
                    onCheckedChange={(v) => onUpdate(field.id, { require_photo_on_deviation: v })}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Aktiver risiko-gradering</span>
                  <Switch
                    checked={!!field.enable_risk_grading}
                    onCheckedChange={(v) => onUpdate(field.id, { enable_risk_grading: v })}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Checkbox yes/no rules */}
          {field.type === "checkbox_yes_no" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rules.some((r) => r.field_id === field.id && r.action === "require_comment")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onRulesChange([
                        ...rules,
                        { id: crypto.randomUUID(), field_id: field.id, condition: "equals", value: "no", action: "require_comment" },
                      ]);
                    } else {
                      onRulesChange(rules.filter((r) => !(r.field_id === field.id && r.action === "require_comment")));
                    }
                  }}
                  className="rounded"
                />
                <span>Krev kommentar ved "Nei"</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
