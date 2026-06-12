"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCompleteStageMutation, useSetDueDateMutation } from "@/hooks/useStage";
import type { Department, Stage } from "@/lib/types";
import {
  formatDate,
  formatDateTime,
  formatPendingDuration,
  titleCasePhase
} from "@/lib/utils";
import { CommentThread } from "@/components/CommentThread";
import { StatusChip } from "@/components/StatusChip";

export function StageRow({
  stage,
  viewerDepartment
}: {
  stage: Stage;
  viewerDepartment?: Department;
}) {
  const router = useRouter();
  const completeStage = useCompleteStageMutation();
  const setDueDate = useSetDueDateMutation();
  const [dueDate, setDueDate_] = useState(stage.due_date ?? "");
  const canComplete = viewerDepartment === stage.responsible_dept || viewerDepartment === "Admin";
  const canSetInitialDueDate =
    !stage.due_date &&
    (viewerDepartment === "Sales" ||
      viewerDepartment === "Admin" ||
      viewerDepartment === stage.responsible_dept);
  const canSchedule = viewerDepartment === "Admin" || canSetInitialDueDate;
  const canComment = ["active", "overdue"].includes(stage.status);

  return (
    <section className="space-y-4 rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusChip status={stage.status} />
            <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">
              {titleCasePhase(stage.phase)}
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink">{stage.name}</h3>
            <p className="text-sm text-ink/60">Responsible department: {stage.responsible_dept}</p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="text-sm text-ink/60">Due: {formatDate(stage.due_date)}</div>
          {canSchedule ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate_(event.target.value)}
                className="rounded-full border border-ink/10 bg-sand/50 px-3 py-1.5 text-xs outline-none transition focus:border-gold"
              />
              <button
                type="button"
                disabled={setDueDate.isPending || !dueDate || dueDate === stage.due_date}
                onClick={() =>
                  setDueDate.mutate(
                    { stageId: stage.id, dueDate },
                    { onSuccess: () => router.refresh() }
                  )
                }
                className="rounded-full border border-ink px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {setDueDate.isPending ? "Saving..." : stage.due_date ? "Update due date" : "Set due date"}
              </button>
            </div>
          ) : null}
          {!canSchedule && stage.due_date ? (
            <p className="text-xs text-ink/45">Dates lock after scheduling. Only Admin can override them.</p>
          ) : null}
          {canComplete ? (
            <button
              type="button"
              disabled={completeStage.isPending || !["active", "overdue"].includes(stage.status)}
              onClick={() => completeStage.mutate(stage.id, { onSuccess: () => router.refresh() })}
              className="rounded-full bg-pine px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-70"
            >
              {completeStage.isPending ? "Saving..." : "Mark Complete"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StageMeta label="Activated" value={formatDateTime(stage.activated_at)} />
        <StageMeta label="Due date" value={formatDate(stage.due_date)} />
        <StageMeta label="Completed" value={formatDateTime(stage.completed_at)} />
        <StageMeta
          label={stage.status === "done" ? "Turnaround" : "Pending"}
          value={formatPendingDuration(
            stage.activated_at,
            stage.status === "done" ? stage.completed_at : undefined
          )}
        />
      </div>

      <CommentThread stageId={stage.id} comments={stage.comments} canComment={canComment} />
    </section>
  );
}

function StageMeta({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-sand/40 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
