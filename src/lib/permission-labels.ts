/**
 * Human-readable Norwegian labels for permission keys.
 * UI-only mapping – does NOT affect backend logic or RLS.
 */

export interface PermissionMeta {
  label: string;
  description?: string;
  category: string;
}

export const PERMISSION_LABELS: Record<string, PermissionMeta> = {
  // Scope
  "scope.view.own": {
    label: "Kun prosjekter brukeren deltar på",
    description: "Brukeren ser kun prosjekter de er tildelt eller deltar i.",
    category: "Omfang",
  },
  "scope.view.company": {
    label: "Alle prosjekter i eget selskap",
    description: "Brukeren ser alle prosjekter i selskaper de er medlem av.",
    category: "Omfang",
  },
  "scope.view.all": {
    label: "Alle prosjekter i alle selskaper",
    description: "Brukeren ser alle prosjekter på tvers av selskaper.",
    category: "Omfang",
  },

  // Jobs
  "jobs.view": { label: "Se prosjekter", category: "Prosjekter" },
  "jobs.create": { label: "Opprette prosjekter", category: "Prosjekter" },
  "jobs.edit": { label: "Redigere prosjekter", category: "Prosjekter" },
  "jobs.delete": { label: "Flytte prosjekt til papirkurv", category: "Prosjekter" },
  "jobs.archive": { label: "Arkivere prosjekt", category: "Prosjekter" },
  "jobs.assign_users": { label: "Tildele montører og deltakere", category: "Prosjekter" },
  "jobs.view_pricing": { label: "Se kalkyle og priser", category: "Prosjekter" },

  // Offers
  "offers.view": { label: "Se tilbud", category: "Tilbud" },
  "offers.create": { label: "Opprette tilbud", category: "Tilbud" },
  "offers.edit": { label: "Redigere tilbud", category: "Tilbud" },
  "offers.delete": { label: "Flytte tilbud til papirkurv", category: "Tilbud" },
  "offers.archive": { label: "Arkivere tilbud", category: "Tilbud" },

  // Calc
  "calc.view": { label: "Se kalkyle", category: "Kalkyle" },
  "calc.edit": { label: "Redigere kalkyle", category: "Kalkyle" },

  // Docs
  "docs.view": { label: "Se dokumenter", category: "Dokumenter" },
  "docs.upload": { label: "Laste opp dokumenter", category: "Dokumenter" },
  "docs.delete": { label: "Slette dokumenter", category: "Dokumenter" },
  "docs.restrict_to_participants": {
    label: "Kun se dokumenter på egne prosjekter",
    description: "Hvis aktiv, kan brukeren ikke se dokumenter på prosjekter de ikke deltar i.",
    category: "Dokumenter",
  },

  // Comm
  "comm.view": { label: "Se kommunikasjon og notater", category: "Kommunikasjon" },
  "comm.create_note": { label: "Opprette interne notater", category: "Kommunikasjon" },
  "comm.delete_note": { label: "Slette notater", category: "Kommunikasjon" },
  "comm.restrict_to_participants": {
    label: "Kun se kommunikasjon på egne prosjekter",
    description: "Hvis aktiv, kan brukeren ikke se kommunikasjon på prosjekter de ikke deltar i.",
    category: "Kommunikasjon",
  },

  // Calendar
  "calendar.read_busy": { label: "Se opptatt/ledig i kalender", category: "Kalender" },
  "calendar.write_events": { label: "Opprette og endre kalenderavtaler", category: "Kalender" },
  "calendar.delete_events": { label: "Slette kalenderavtaler", category: "Kalender" },

  // Admin
  "admin.manage_companies": { label: "Administrere selskaper", category: "Administrasjon" },
  "admin.manage_departments": { label: "Administrere avdelinger", category: "Administrasjon" },
  "admin.manage_users": { label: "Administrere brukere", category: "Administrasjon" },
  "admin.manage_roles": { label: "Administrere roller", category: "Administrasjon" },
  "admin.manage_settings": { label: "Administrere systeminnstillinger", category: "Administrasjon" },

  // Leads
  "leads.view": { label: "Se leads", category: "Leads" },
  "leads.create": { label: "Opprette leads", category: "Leads" },
  "leads.edit": { label: "Redigere leads", category: "Leads" },
  "leads.transfer_owner": { label: "Overføre eierskap på leads", description: "Kan endre hvem som er ansvarlig eier av en lead.", category: "Leads" },
  "leads.manage_participants": { label: "Administrere deltakere på leads", description: "Kan legge til og fjerne deltakere på leads.", category: "Leads" },
  "leads.convert": { label: "Konvertere lead til prosjekt", description: "Kan konvertere et akseptert tilbud på en lead til et prosjekt.", category: "Leads" },
  "leads.email_draft": { label: "Opprette e-postutkast fra lead", description: "Kan opprette Outlook e-postutkast koblet til en lead.", category: "Leads" },
  "leads.create_meeting": { label: "Opprette møte/befaring fra lead", description: "Kan opprette Outlook kalenderhendelser fra en lead.", category: "Leads" },

  // Regulation
  "regulation.review": { label: "Godkjenne fagforespørsler", description: "Kan godkjenne eller avvise fagforespørsler som faglig ansvarlig.", category: "Fag" },
};

/** All permission keys excluding scope (scope is handled as a dropdown) */
export const PERMISSION_CATEGORIES: { category: string; description: string; keys: string[] }[] = [
  {
    category: "Prosjekter",
    description: "Tilgang til å se, opprette og administrere prosjekter.",
    keys: ["jobs.view", "jobs.create", "jobs.edit", "jobs.delete", "jobs.archive", "jobs.assign_users", "jobs.view_pricing"],
  },
  {
    category: "Tilbud",
    description: "Tilgang til å håndtere tilbud.",
    keys: ["offers.view", "offers.create", "offers.edit", "offers.delete", "offers.archive"],
  },
  {
    category: "Kalkyle",
    description: "Tilgang til kalkyler og prisberegninger.",
    keys: ["calc.view", "calc.edit"],
  },
  {
    category: "Dokumenter",
    description: "Tilgang til dokumenter knyttet til prosjekter.",
    keys: ["docs.view", "docs.upload", "docs.delete", "docs.restrict_to_participants"],
  },
  {
    category: "Kommunikasjon",
    description: "Tilgang til intern kommunikasjon og notater.",
    keys: ["comm.view", "comm.create_note", "comm.delete_note", "comm.restrict_to_participants"],
  },
  {
    category: "Kalender",
    description: "Tilgang til kalender og avtaler.",
    keys: ["calendar.read_busy", "calendar.write_events", "calendar.delete_events"],
  },
  {
    category: "Administrasjon",
    description: "Tilgang til systeminnstillinger og brukeradministrasjon.",
    keys: ["admin.manage_companies", "admin.manage_departments", "admin.manage_users", "admin.manage_roles", "admin.manage_settings"],
  },
  {
    category: "Leads",
    description: "Tilgang til leads og salgsprosess.",
    keys: ["leads.view", "leads.create", "leads.edit", "leads.transfer_owner", "leads.manage_participants", "leads.convert", "leads.email_draft", "leads.create_meeting"],
  },
  {
    category: "Fag",
    description: "Tilgang til fagmodul og forskriftsoppslag.",
    keys: ["regulation.review"],
  },
];

/** Scope options for the dropdown */
export const SCOPE_OPTIONS = [
  { key: "scope.view.own", label: "Kun prosjekter brukeren deltar på" },
  { key: "scope.view.company", label: "Alle prosjekter i eget selskap" },
  { key: "scope.view.all", label: "Alle prosjekter i alle selskaper" },
] as const;

/** Get a friendly label for a permission key */
export function getPermLabel(key: string): string {
  return PERMISSION_LABELS[key]?.label ?? key;
}

/** Get the description for a permission key */
export function getPermDescription(key: string): string | undefined {
  return PERMISSION_LABELS[key]?.description;
}
