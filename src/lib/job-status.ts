/**
 * Centralized job status definitions and workflow logic.
 */

export type JobStatus =
  | "requested"
  | "approved"
  | "time_change_proposed"
  | "rejected"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "ready_for_invoicing"
  | "invoiced";

export interface StatusConfig {
  label: string;
  className: string;
  borderClass: string;
  dotClass: string;
}

export const JOB_STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  requested: {
    label: "Forespurt",
    className: "bg-status-requested text-status-requested-foreground",
    borderClass: "border-l-status-requested",
    dotClass: "bg-status-requested",
  },
  approved: {
    label: "Godkjent",
    className: "bg-status-approved text-status-approved-foreground",
    borderClass: "border-l-status-approved",
    dotClass: "bg-status-approved",
  },
  time_change_proposed: {
    label: "Tidsendring foreslått",
    className: "bg-status-time-change-proposed text-status-time-change-proposed-foreground",
    borderClass: "border-l-status-time-change-proposed",
    dotClass: "bg-status-time-change-proposed",
  },
  rejected: {
    label: "Avslått",
    className: "bg-status-rejected text-status-rejected-foreground",
    borderClass: "border-l-status-rejected",
    dotClass: "bg-status-rejected",
  },
  scheduled: {
    label: "Planlagt",
    className: "bg-status-scheduled text-status-scheduled-foreground",
    borderClass: "border-l-status-scheduled",
    dotClass: "bg-status-scheduled",
  },
  in_progress: {
    label: "Pågår",
    className: "bg-status-in-progress text-status-in-progress-foreground",
    borderClass: "border-l-status-in-progress",
    dotClass: "bg-status-in-progress",
  },
  completed: {
    label: "Ferdig",
    className: "bg-status-completed text-status-completed-foreground",
    borderClass: "border-l-status-completed",
    dotClass: "bg-status-completed",
  },
  ready_for_invoicing: {
    label: "Klar for fakturering",
    className: "bg-status-ready-for-invoicing text-status-ready-for-invoicing-foreground",
    borderClass: "border-l-status-ready-for-invoicing",
    dotClass: "bg-status-ready-for-invoicing",
  },
  invoiced: {
    label: "Fakturert",
    className: "bg-status-invoiced text-status-invoiced-foreground",
    borderClass: "border-l-status-invoiced",
    dotClass: "bg-status-invoiced",
  },
};

export const ALL_STATUSES: JobStatus[] = [
  "requested",
  "approved",
  "time_change_proposed",
  "rejected",
  "scheduled",
  "in_progress",
  "completed",
  "ready_for_invoicing",
  "invoiced",
];

/** Which statuses a montør (technician) can set */
export const TECHNICIAN_ALLOWED_STATUSES: JobStatus[] = [
  "in_progress",
  "completed",
];

/** Which statuses admin can set (all except super_admin-restricted) */
export const ADMIN_ALLOWED_STATUSES: JobStatus[] = ALL_STATUSES;

/** System-set statuses (not user-settable directly) */
export const SYSTEM_STATUSES: JobStatus[] = ["requested", "approved"];

/** Check if a role can transition to a given status */
export function canSetStatus(
  role: "super_admin" | "admin" | "montør",
  targetStatus: JobStatus
): boolean {
  if (role === "super_admin" || role === "admin") return true;
  if (role === "montør") return TECHNICIAN_ALLOWED_STATUSES.includes(targetStatus);
  return false;
}

/** Get display number for a job */
export function getDisplayNumber(jobNumber: string | null, internalNumber: string | null): string {
  return jobNumber || internalNumber || "—";
}
