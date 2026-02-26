import { useState, useCallback } from "react";
import type { FormField, FormFieldType, FormRule } from "@/lib/form-types";
import { FIELD_TYPE_LABELS, fieldSupportsComment } from "@/lib/form-types";
import { FormCanvasField } from "./FormCanvasField";

interface FormCanvasProps {
  fields: FormField[];
  rules: FormRule[];
  templateTitle: string;
  onFieldsChange: (fields: FormField[]) => void;
  onRulesChange: (rules: FormRule[]) => void;
}

export function FormCanvas({ fields, rules, templateTitle, onFieldsChange, onRulesChange }: FormCanvasProps) {
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const addFieldAtIndex = useCallback((type: FormFieldType, insertAt: number) => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: FIELD_TYPE_LABELS[type],
      order: insertAt,
      required: type !== "section_header" && !type.startsWith("smart_"),
      allow_comment: fieldSupportsComment(type),
    };
    if (type === "checkbox_list" || type === "dropdown" || type === "radio") {
      newField.options = ["Alternativ 1", "Alternativ 2"];
    }
    const newFields = [...fields];
    newFields.splice(insertAt, 0, newField);
    onFieldsChange(newFields.map((f, i) => ({ ...f, order: i })));
  }, [fields, onFieldsChange]);

  const updateField = (id: string, updates: Partial<FormField>) => {
    onFieldsChange(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (id: string) => {
    onFieldsChange(fields.filter((f) => f.id !== id));
    onRulesChange(rules.filter((r) => r.field_id !== id));
  };

  const duplicateField = (idx: number) => {
    const source = fields[idx];
    const dup: FormField = { ...source, id: crypto.randomUUID(), label: `${source.label} (kopi)`, order: idx + 1 };
    const newFields = [...fields];
    newFields.splice(idx + 1, 0, dup);
    onFieldsChange(newFields.map((f, i) => ({ ...f, order: i })));
  };

  const moveField = (from: number, to: number) => {
    if (to < 0 || to >= fields.length) return;
    const newFields = [...fields];
    const [moved] = newFields.splice(from, 1);
    newFields.splice(to, 0, moved);
    onFieldsChange(newFields.map((f, i) => ({ ...f, order: i })));
  };

  // Drag handlers for reordering existing fields
  const handleFieldDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData("reorder-index", String(idx));
    setDraggingIdx(idx);
  };

  const handleFieldDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("field-type") ? "copy" : "move";
    setDragOverIdx(idx);
  };

  const handleFieldDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    setDraggingIdx(null);

    const newFieldType = e.dataTransfer.getData("field-type") as FormFieldType;
    if (newFieldType) {
      addFieldAtIndex(newFieldType, dropIdx);
      return;
    }

    const fromIdx = e.dataTransfer.getData("reorder-index");
    if (fromIdx !== "") {
      moveField(parseInt(fromIdx), dropIdx);
    }
  };

  // Drop zone for the whole canvas (when empty or dropping at bottom)
  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("field-type") ? "copy" : "move";
    setDragOverIdx(fields.length);
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIdx(null);
    setDraggingIdx(null);

    const newFieldType = e.dataTransfer.getData("field-type") as FormFieldType;
    if (newFieldType) {
      addFieldAtIndex(newFieldType, fields.length);
      return;
    }

    const fromIdx = e.dataTransfer.getData("reorder-index");
    if (fromIdx !== "") {
      moveField(parseInt(fromIdx), fields.length - 1);
    }
  };

  return (
    <div
      className="min-h-[500px] rounded-2xl border border-border bg-card shadow-sm"
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
      onDragLeave={() => setDragOverIdx(null)}
    >
      {/* Form title preview */}
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <h2 className="text-lg font-bold text-foreground">{templateTitle || "Nytt skjema"}</h2>
      </div>

      {/* Fields */}
      <div className="p-4 space-y-2">
        {fields.length === 0 ? (
          <div className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            dragOverIdx !== null ? "border-primary bg-primary/5" : "border-border bg-muted/10"
          }`}>
            <p className="text-sm text-muted-foreground font-medium mb-1">
              Dra felt hit for å bygge skjemaet
            </p>
            <p className="text-xs text-muted-foreground/60">
              Eller klikk på felttyper i panelet til venstre
            </p>
          </div>
        ) : (
          <>
            {fields.map((field, idx) => (
              <div key={field.id}>
                {/* Drop indicator line */}
                {dragOverIdx === idx && draggingIdx !== idx && (
                  <div className="h-0.5 bg-primary rounded-full mx-4 mb-1 transition-all" />
                )}
                <FormCanvasField
                  field={field}
                  index={idx}
                  totalFields={fields.length}
                  rules={rules}
                  onUpdate={updateField}
                  onRemove={removeField}
                  onDuplicate={duplicateField}
                  onMove={moveField}
                  onRulesChange={onRulesChange}
                  onDragStart={handleFieldDragStart}
                  onDragOver={handleFieldDragOver}
                  onDrop={handleFieldDrop}
                />
              </div>
            ))}

            {/* Bottom drop zone */}
            {dragOverIdx === fields.length && (
              <div className="h-0.5 bg-primary rounded-full mx-4 transition-all" />
            )}

            {/* Always show a small drop target at end */}
            <div
              className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                dragOverIdx === fields.length ? "border-primary bg-primary/5" : "border-transparent"
              }`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIdx(fields.length); }}
              onDrop={(e) => { e.stopPropagation(); handleCanvasDrop(e); }}
            >
              <p className="text-[10px] text-muted-foreground/40">Dra felt hit</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
