import { cn } from "@/lib/utils";
import type { StageStatus } from "@/lib/types";

const statusStyles: Record<StageStatus, string> = {
  pending: "bg-slate-200 text-slate-700",
  active: "bg-pine/15 text-pine",
  overdue: "bg-ember/15 text-ember",
  done: "bg-gold/20 text-ink"
};

const statusLabels: Record<StageStatus, string> = {
  pending: "Pending",
  active: "In Progress",
  overdue: "Overdue",
  done: "Completed"
};

export function StatusChip({ status }: { status: StageStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
        statusStyles[status]
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
