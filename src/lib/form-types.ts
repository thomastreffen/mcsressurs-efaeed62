// Form field types for the builder and renderer

export type FormFieldType =
  | "section_header"
  | "checkbox_yes_no"
  | "checkbox_list"
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "time"
  | "email"
  | "phone"
  | "dropdown"
  | "radio"
  | "signature"
  | "photo_upload"
  | "file_upload"
  | "address"
  // Smart / auto-populated fields
  | "smart_project_name"
  | "smart_customer_name"
  | "smart_project_number"
  | "smart_address"
  | "smart_date";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[]; // for checkbox_list, dropdown, radio
  order: number;
  // Checklist-specific options
  require_photo_on_deviation?: boolean;
  enable_risk_grading?: boolean;
  // Comment settings
  allow_comment?: boolean; // default true for most types
  // Layout
  width?: "full" | "half"; // half = 50% width side by side
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

// Field type categories for palette
export interface FieldCategory {
  label: string;
  types: FormFieldType[];
}

export const FIELD_CATEGORIES: FieldCategory[] = [
  {
    label: "Grunnleggende",
    types: ["text", "textarea", "number", "email", "phone", "date", "time", "address"],
  },
  {
    label: "Valg",
    types: ["checkbox_yes_no", "checkbox_list", "dropdown", "radio"],
  },
  {
    label: "Medier & Signatur",
    types: ["photo_upload", "file_upload", "signature"],
  },
  {
    label: "Layout",
    types: ["section_header"],
  },
  {
    label: "Smarte felt (auto)",
    types: ["smart_project_name", "smart_customer_name", "smart_project_number", "smart_address", "smart_date"],
  },
];

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  section_header: "Seksjonstittel",
  checkbox_yes_no: "Ja/Nei",
  checkbox_list: "Sjekkliste",
  text: "Tekst (kort)",
  textarea: "Tekst (lang)",
  number: "Tall",
  date: "Dato",
  time: "Tidspunkt",
  email: "E-post",
  phone: "Telefon",
  dropdown: "Nedtrekksliste",
  radio: "Radioknapper",
  signature: "Signatur",
  photo_upload: "Bildeopplasting",
  file_upload: "Filopplasting",
  address: "Adresse",
  smart_project_name: "Prosjektnavn",
  smart_customer_name: "Kundenavn",
  smart_project_number: "Prosjektnr.",
  smart_address: "Prosjektadresse",
  smart_date: "Dagens dato",
};

/** Whether a field type supports comments by default */
export function fieldSupportsComment(type: FormFieldType): boolean {
  return type !== "section_header" && type !== "signature" && !type.startsWith("smart_");
}

/** Whether a field is auto-populated from project context */
export function isSmartField(type: FormFieldType): boolean {
  return type.startsWith("smart_");
}
