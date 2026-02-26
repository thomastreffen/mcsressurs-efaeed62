// Form field types for the builder and renderer

export type FormFieldType =
  | "section_header"
  | "checkbox_yes_no"
  | "checkbox_list"
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "signature"
  | "photo_upload";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  description?: string;
  required?: boolean;
  options?: string[]; // for checkbox_list
  order: number;
  // Checklist-specific options
  require_photo_on_deviation?: boolean;
  enable_risk_grading?: boolean;
  // Comment settings
  allow_comment?: boolean; // default true for most types
}

export type ChecklistItemStatus = "ok" | "avvik" | "ikke_relevant";
export type RiskGrade = "lav" | "middels" | "hoy" | "kritisk";

export interface ChecklistItemAnswer {
  status: ChecklistItemStatus;
  comment?: string;
  risk_grade?: RiskGrade;
  photo_count?: number;
}

export interface FormRule {
  id: string;
  field_id: string;
  condition: "equals";
  value: string;
  action: "require_comment" | "create_task";
  action_config?: Record<string, any>;
}

export type FormInstanceStatus = "not_started" | "in_progress" | "completed" | "signed";

export const FORM_STATUS_CONFIG: Record<FormInstanceStatus, { label: string; color: string }> = {
  not_started: { label: "Ikke startet", color: "bg-muted text-muted-foreground" },
  in_progress: { label: "Pågår", color: "bg-info/10 text-info border border-info/20" },
  completed: { label: "Ferdig", color: "bg-success/10 text-success border border-success/20" },
  signed: { label: "Signert", color: "bg-primary/10 text-primary border border-primary/20" },
};

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  section_header: "Seksjonstittel",
  checkbox_yes_no: "Ja/Nei sjekk",
  checkbox_list: "Sjekkliste",
  text: "Tekst (kort)",
  textarea: "Tekst (lang)",
  number: "Tall",
  date: "Dato",
  signature: "Signatur",
  photo_upload: "Bildeopplasting",
};

/** Whether a field type supports comments by default */
export function fieldSupportsComment(type: FormFieldType): boolean {
  return type !== "section_header" && type !== "signature";
}
