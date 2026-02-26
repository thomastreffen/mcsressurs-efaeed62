import {
  Type,
  AlignLeft,
  Hash,
  Calendar,
  Clock,
  Mail,
  Phone,
  ChevronDown,
  CircleDot,
  CheckSquare,
  ListChecks,
  Camera,
  FileUp,
  PenTool,
  Heading,
  MapPin,
  Briefcase,
  User,
  FileText,
  CalendarCheck,
} from "lucide-react";
import type { FormFieldType } from "@/lib/form-types";
import { FIELD_CATEGORIES, FIELD_TYPE_LABELS } from "@/lib/form-types";

const FIELD_ICONS: Record<FormFieldType, React.ElementType> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  date: Calendar,
  time: Clock,
  email: Mail,
  phone: Phone,
  address: MapPin,
  dropdown: ChevronDown,
  radio: CircleDot,
  checkbox_yes_no: CheckSquare,
  checkbox_list: ListChecks,
  photo_upload: Camera,
  file_upload: FileUp,
  signature: PenTool,
  section_header: Heading,
  smart_project_name: Briefcase,
  smart_customer_name: User,
  smart_project_number: FileText,
  smart_address: MapPin,
  smart_date: CalendarCheck,
};

export { FIELD_ICONS };

interface FormFieldPaletteProps {
  onAddField: (type: FormFieldType) => void;
}

export function FormFieldPalette({ onAddField }: FormFieldPaletteProps) {
  const handleDragStart = (e: React.DragEvent, type: FormFieldType) => {
    e.dataTransfer.setData("field-type", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="space-y-5">
      {FIELD_CATEGORIES.map((cat) => (
        <div key={cat.label}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {cat.label}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {cat.types.map((type) => {
              const Icon = FIELD_ICONS[type];
              return (
                <button
                  key={type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, type)}
                  onClick={() => onAddField(type)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all cursor-grab active:cursor-grabbing active:scale-95 select-none"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{FIELD_TYPE_LABELS[type]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
