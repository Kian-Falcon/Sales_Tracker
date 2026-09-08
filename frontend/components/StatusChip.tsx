import { cn } from "@/lib/utils";
import type { StageStatus } from "@/lib/types";

const statusStyles: Record<StageStatus, string> = {
  pending: "bg-surface-muted text-ink/70",
  active: "bg-danger/12 text-danger",
  overdue: "bg-danger/15 text-danger",
  done: "bg-success/15 text-success"
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

