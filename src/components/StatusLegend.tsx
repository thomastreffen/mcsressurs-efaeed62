import { StatusDot } from "./StatusDot";

export function StatusLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <StatusDot status="accepted" /> Godtatt
      </span>
      <span className="flex items-center gap-1.5">
        <StatusDot status="pending" /> Ikke svart
      </span>
      <span className="flex items-center gap-1.5">
        <StatusDot status="declined" /> Avvist
      </span>
      <span className="flex items-center gap-1.5">
        <StatusDot status="change-request" /> Endringsforespørsel
      </span>
    </div>
  );
}
