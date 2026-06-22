"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  useCompleteStageMutation,
  useRequestStageDueDateChangeMutation,
  useReviewStageDueDateRequestMutation,
  useSetDueDateMutation
} from "@/hooks/useStage";
import type { Department, DueDateRequestStatus, Stage } from "@/lib/types";
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
  const requestDueDateChange = useRequestStageDueDateChangeMutation();
  const reviewDueDateRequest = useReviewStageDueDateRequestMutation();
  const [dueDate, setDueDate_] = useState(stage.due_date ?? "");
  const [requestedDueDate, setRequestedDueDate] = useState(stage.due_date ?? "");
  const [requestReason, setRequestReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const canComplete = viewerDepartment === stage.responsible_dept || viewerDepartment === "Admin";
  const canMarkStageComplete = canComplete && ["active", "overdue"].includes(stage.status);
  const canDirectSchedule = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const canRequestDueDateChange =
    Boolean(viewerDepartment) &&
    viewerDepartment !== "Sales" &&
    viewerDepartment !== "Admin" &&
    viewerDepartment === stage.responsible_dept &&
    ["active", "overdue"].includes(stage.status);
  const pendingRequests = stage.due_date_requests.filter((request) => request.status === "pending");
  const hasPendingRequest = pendingRequests.length > 0;
  const canReviewRequests = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const canComment = ["active", "overdue"].includes(stage.status);
  const showCompletionAction = canMarkStageComplete || stage.status === "done";

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
          {canDirectSchedule ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate_(event.target.value)}
                className="rounded-full border border-ink/10 bg-sand/50 px-3 py-1.5 text-xs outline-none transition focus:border-gold"
              />
              <button
                type="button"
                disabled={setDueDate.isPending || !dueDate || dueDate === stage.due_date || hasPendingRequest}
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
          {canDirectSchedule && hasPendingRequest ? (
            <p className="text-xs text-ember">There is a pending due-date request waiting for Sales/Admin review below.</p>
          ) : null}
          {!canDirectSchedule ? (
            <p className="text-xs text-ink/45">
              Only Sales or Admin can set due dates directly. Your team can request a change below.
            </p>
          ) : null}
          {showCompletionAction ? (
            <button
              type="button"
              disabled={completeStage.isPending || stage.status === "done" || !canMarkStageComplete}
              onClick={() => completeStage.mutate(stage.id, { onSuccess: () => router.refresh() })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                stage.status === "done"
                  ? "border border-ink/10 bg-sand/60 text-ink/45"
                  : "bg-pine text-white hover:bg-ink disabled:cursor-not-allowed disabled:opacity-70"
              }`}
            >
              {completeStage.isPending ? "Saving..." : stage.status === "done" ? "Completed" : "Mark Complete"}
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

      {(canRequestDueDateChange || canReviewRequests || stage.due_date_requests.length > 0) ? (
        <div className="space-y-4 rounded-3xl bg-sand/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-ink">Due-date requests</h4>
              <p className="text-xs text-ink/50">
                Non-Sales teams can request date changes here. Sales/Admin can approve or reject them.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">
              {stage.due_date_requests.length} total
            </span>
          </div>

          {canRequestDueDateChange ? (
            <div className="space-y-3 rounded-2xl border border-ink/10 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                    Requested due date
                  </span>
                  <input
                    type="date"
                    value={requestedDueDate}
                    onChange={(event) => setRequestedDueDate(event.target.value)}
                    className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                    Reason for change
                  </span>
                  <textarea
                    value={requestReason}
                    onChange={(event) => setRequestReason(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
                    placeholder="Explain why the due date needs to change."
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={
                    requestDueDateChange.isPending ||
                    hasPendingRequest ||
                    !requestedDueDate ||
                    requestedDueDate === stage.due_date ||
                    !requestReason.trim()
                  }
                  onClick={() =>
                    requestDueDateChange.mutate(
                      {
                        stageId: stage.id,
                        requestedDueDate,
                        reason: requestReason.trim()
                      },
                      {
                        onSuccess: () => {
                          setRequestReason("");
                          router.refresh();
                        }
                      }
                    )
                  }
                  className="rounded-full border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {requestDueDateChange.isPending ? "Sending..." : "Request due-date change"}
                </button>
                {hasPendingRequest ? (
                  <span className="text-xs text-gold">A request is already pending for this stage.</span>
                ) : null}
                {requestDueDateChange.error ? (
                  <span className="text-xs text-ember">{requestDueDateChange.error.message}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {stage.due_date_requests.length ? (
            <div className="space-y-3">
              {stage.due_date_requests.map((request) => (
                <article key={request.id} className="space-y-3 rounded-2xl border border-ink/10 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <DueDateRequestStatusChip status={request.status} />
                        <span className="text-sm font-semibold text-ink">{request.requestor_name ?? "Unknown user"}</span>
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-pine">
                          {request.requested_by_department}
                        </span>
                      </div>
                      <p className="text-xs text-ink/50">Requested {formatDateTime(request.created_at)}</p>
                    </div>
                    <div className="grid gap-2 text-sm text-ink/70 md:text-right">
                      <div>Current: {formatDate(request.current_due_date)}</div>
                      <div className="font-semibold text-ink">Requested: {formatDate(request.requested_due_date)}</div>
                    </div>
                  </div>

                  <p className="text-sm leading-6 text-ink/80">{request.reason}</p>

                  {request.reviewed_at ? (
                    <div className="rounded-2xl bg-sand/60 px-3 py-3 text-sm text-ink/70">
                      <div>
                        Reviewed by {request.reviewer_name ?? "Sales/Admin"} on {formatDateTime(request.reviewed_at)}
                      </div>
                      {request.review_note ? <div className="mt-1 text-ink/80">Note: {request.review_note}</div> : null}
                    </div>
                  ) : null}

                  {canReviewRequests && request.status === "pending" ? (
                    <div className="space-y-3 rounded-2xl bg-sand/60 p-3">
                      <textarea
                        value={reviewNotes[request.id] ?? ""}
                        onChange={(event) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value
                          }))
                        }
                        rows={2}
                        maxLength={2000}
                        className="w-full rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gold"
                        placeholder="Optional note for the requesting team."
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={reviewDueDateRequest.isPending}
                          onClick={() =>
                            reviewDueDateRequest.mutate(
                              {
                                stageId: stage.id,
                                requestId: request.id,
                                action: "approve",
                                note: reviewNotes[request.id]?.trim() || undefined
                              },
                              { onSuccess: () => router.refresh() }
                            )
                          }
                          className="rounded-full bg-pine px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reviewDueDateRequest.isPending ? "Saving..." : "Approve request"}
                        </button>
                        <button
                          type="button"
                          disabled={reviewDueDateRequest.isPending}
                          onClick={() =>
                            reviewDueDateRequest.mutate(
                              {
                                stageId: stage.id,
                                requestId: request.id,
                                action: "reject",
                                note: reviewNotes[request.id]?.trim() || undefined
                              },
                              { onSuccess: () => router.refresh() }
                            )
                          }
                          className="rounded-full border border-ember px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {reviewDueDateRequest.isPending ? "Saving..." : "Reject request"}
                        </button>
                        {reviewDueDateRequest.error ? (
                          <span className="text-xs text-ember">{reviewDueDateRequest.error.message}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink/55">No due-date requests have been raised for this stage yet.</p>
          )}
        </div>
      ) : null}

      <CommentThread stageId={stage.id} comments={stage.comments} canComment={canComment} />
    </section>
  );
}

function DueDateRequestStatusChip({
  status
}: {
  status: DueDateRequestStatus;
}) {
  const styles: Record<DueDateRequestStatus, string> = {
    pending: "bg-gold/15 text-gold",
    approved: "bg-pine/15 text-pine",
    rejected: "bg-ember/15 text-ember"
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${styles[status]}`}>
      {status}
    </span>
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
