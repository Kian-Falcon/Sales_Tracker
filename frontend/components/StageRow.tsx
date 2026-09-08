"use client";

import { useEffect, useRef, useState } from "react";

import { CommentThread } from "@/components/CommentThread";
import { StatusChip } from "@/components/StatusChip";
import { useToast } from "@/components/ToastProvider";
import {
  useCompleteStageMutation,
  useRequestStageDueDateChangeMutation,
  useReviewStageDueDateRequestMutation,
  useSetDueDateMutation
} from "@/hooks/useStage";
import type {
  Department,
  DueDateRequestStatus,
  ProjectDetail,
  Stage,
  StageDueDateRequest
} from "@/lib/types";
import { formatDate, formatDateTime, formatPendingDuration, titleCasePhase } from "@/lib/utils";

function shouldResetOverdueStatus(currentStatus: Stage["status"], dueDate: string | null) {
  if (currentStatus !== "overdue" || !dueDate) {
    return false;
  }

  const nextDueDate = new Date(dueDate);
  nextDueDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return nextDueDate.getTime() >= today.getTime();
}

function shouldAutoCollapseStage(status: Stage["status"]) {
  return status === "active" || status === "overdue" || status === "done";
}

function buildReviewedRequest({
  request,
  action,
  note,
  reviewerName
}: {
  request: StageDueDateRequest;
  action: "approve" | "reject";
  note?: string;
  reviewerName?: string | null;
}): StageDueDateRequest {
  const reviewedAt = new Date().toISOString();

  return {
    ...request,
    status: action === "approve" ? "approved" : "rejected",
    review_note: note ?? null,
    reviewer_name: reviewerName?.trim() || "Sales/Admin",
    reviewed_at: reviewedAt,
    updated_at: reviewedAt
  };
}

export function StageRow({
  project,
  stage,
  viewerDepartment,
  viewerName,
  onProjectChange,
  onProjectSyncStateChange
}: {
  project: ProjectDetail;
  stage: Stage;
  viewerDepartment?: Department;
  viewerName?: string | null;
  onProjectChange?: (project: ProjectDetail) => void;
  onProjectSyncStateChange?: (projectId: string, label: string | null) => void;
}) {
  const completeStage = useCompleteStageMutation();
  const setDueDate = useSetDueDateMutation();
  const requestDueDateChange = useRequestStageDueDateChangeMutation();
  const reviewDueDateRequest = useReviewStageDueDateRequestMutation();
  const { pushToast } = useToast();
  const [localStage, setLocalStage] = useState(stage);
  const [dueDate, setDueDate_] = useState(stage.due_date ?? "");
  const [requestedDueDate, setRequestedDueDate] = useState(stage.due_date ?? "");
  const [requestReason, setRequestReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [dueDateError, setDueDateError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [activityNotice, setActivityNotice] = useState<string | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!shouldAutoCollapseStage(stage.status));
  const previousStageStatusRef = useRef(stage.status);
  const canComplete = viewerDepartment === localStage.responsible_dept || viewerDepartment === "Admin";
  const canMarkStageComplete = canComplete && ["active", "overdue"].includes(localStage.status);
  const canDirectSchedule = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const canRequestDueDateChange =
    Boolean(viewerDepartment) &&
    viewerDepartment !== "Sales" &&
    viewerDepartment !== "Admin" &&
    viewerDepartment === localStage.responsible_dept &&
    ["active", "overdue"].includes(localStage.status);
  const pendingRequests = localStage.due_date_requests.filter((request) => request.status === "pending");
  const hasPendingRequest = pendingRequests.length > 0;
  const canReviewRequests = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const canComment = ["active", "overdue"].includes(localStage.status);
  const isCompletedStage = localStage.status === "done";
  const isCollapsibleStage = shouldAutoCollapseStage(localStage.status);
  const isCollapsedStage = isCollapsibleStage && !expanded;
  const pendingDurationLabel = formatPendingDuration(
    localStage.activated_at,
    isCompletedStage ? localStage.completed_at : undefined
  );
  const commentCount = localStage.comments.length;
  const dueDateRequestCount = localStage.due_date_requests.length;

  useEffect(() => {
    const previousStatus = previousStageStatusRef.current;
    setLocalStage(stage);
    setDueDate_(stage.due_date ?? "");
    setRequestedDueDate(stage.due_date ?? "");
    if (!shouldAutoCollapseStage(stage.status)) {
      setExpanded(true);
    } else if (!shouldAutoCollapseStage(previousStatus)) {
      setExpanded(false);
    }
    previousStageStatusRef.current = stage.status;
  }, [stage]);

  const syncStageFromProject = (updatedProject: ProjectDetail) => {
    const updatedStage = updatedProject.stages.find((entry) => entry.id === stage.id);
    if (updatedStage) {
      const previousStatus = previousStageStatusRef.current;
      setLocalStage(updatedStage);
      setDueDate_(updatedStage.due_date ?? "");
      setRequestedDueDate(updatedStage.due_date ?? "");
      if (!shouldAutoCollapseStage(updatedStage.status)) {
        setExpanded(true);
      } else if (!shouldAutoCollapseStage(previousStatus)) {
        setExpanded(false);
      }
      previousStageStatusRef.current = updatedStage.status;
    }
    onProjectChange?.(updatedProject);
  };

  const handleSetDueDate = async () => {
    if (!dueDate || dueDate === localStage.due_date || hasPendingRequest) {
      return;
    }

    const previousStage = localStage;
    const nextStatus = shouldResetOverdueStatus(localStage.status, dueDate) ? "active" : localStage.status;

    setDueDateError(null);
    setActivityNotice("Updating due date...");
    onProjectSyncStateChange?.(project.id, "Updating due date...");
    setLocalStage((current) => ({
      ...current,
      due_date: dueDate,
      status: nextStatus
    }));
    setRequestedDueDate(dueDate);

    try {
      const updatedProject = await setDueDate.mutateAsync({ stageId: localStage.id, dueDate });
      syncStageFromProject(updatedProject);
      pushToast({
        tone: "success",
        title: "Due date saved",
        description: `${localStage.name} now reflects the updated due date.`
      });
    } catch (error) {
      setLocalStage(previousStage);
      setDueDate_(previousStage.due_date ?? "");
      setRequestedDueDate(previousStage.due_date ?? "");
      setDueDateError(error instanceof Error ? error.message : "Unable to save the due date right now.");
    } finally {
      setActivityNotice(null);
      onProjectSyncStateChange?.(project.id, null);
    }
  };

  const handleCompleteStage = async () => {
    if (!canMarkStageComplete || isCompletedStage) {
      return;
    }

    const previousStage = localStage;
    const previousExpanded = expanded;
    const completedAt = new Date().toISOString();

    setCompletionError(null);
    setActivityNotice("Completing stage and activating the next handoff...");
    onProjectSyncStateChange?.(project.id, "Completing stage...");
    setExpanded(false);
    setLocalStage((current) => ({
      ...current,
      status: "done",
      completed_at: completedAt
    }));

    try {
      const updatedProject = await completeStage.mutateAsync(localStage.id);
      syncStageFromProject(updatedProject);
      pushToast({
        tone: "success",
        title: "Stage completed",
        description: `${localStage.name} was marked complete.`
      });
    } catch (error) {
      setExpanded(previousExpanded);
      setLocalStage(previousStage);
      setCompletionError(error instanceof Error ? error.message : "Unable to complete this stage right now.");
    } finally {
      setActivityNotice(null);
      onProjectSyncStateChange?.(project.id, null);
    }
  };

  const handleRequestDueDateChange = async () => {
    const trimmedReason = requestReason.trim();

    if (!requestedDueDate || requestedDueDate === localStage.due_date || !trimmedReason || hasPendingRequest) {
      return;
    }

    const previousStage = localStage;
    const optimisticRequest: StageDueDateRequest = {
      id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      stage_id: localStage.id,
      requested_by: "current-user",
      requested_by_department: viewerDepartment ?? localStage.responsible_dept,
      requestor_name: viewerName?.trim() || "You",
      current_due_date: localStage.due_date,
      requested_due_date: requestedDueDate,
      reason: trimmedReason,
      status: "pending",
      reviewed_by: null,
      reviewer_name: null,
      review_note: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setRequestError(null);
    setActivityNotice("Submitting due-date request...");
    onProjectSyncStateChange?.(project.id, "Submitting due-date request...");
    setLocalStage((current) => ({
      ...current,
      due_date_requests: [optimisticRequest, ...current.due_date_requests]
    }));
    setRequestReason("");

    try {
      const updatedProject = await requestDueDateChange.mutateAsync({
        stageId: localStage.id,
        requestedDueDate,
        reason: trimmedReason
      });
      syncStageFromProject(updatedProject);
      pushToast({
        tone: "success",
        title: "Request sent",
        description: "Sales and Admin can now review the due-date request."
      });
    } catch (error) {
      setLocalStage(previousStage);
      setRequestReason(trimmedReason);
      setRequestError(error instanceof Error ? error.message : "Unable to send the due-date request right now.");
    } finally {
      setActivityNotice(null);
      onProjectSyncStateChange?.(project.id, null);
    }
  };

  const handleReviewDueDateRequest = async (request: StageDueDateRequest, action: "approve" | "reject") => {
    const reviewNote = reviewNotes[request.id]?.trim() || undefined;
    const previousStage = localStage;
    const nextDueDate = action === "approve" ? request.requested_due_date : localStage.due_date;
    const nextStatus =
      action === "approve" && shouldResetOverdueStatus(localStage.status, request.requested_due_date)
        ? "active"
        : localStage.status;

    setReviewError(null);
    setReviewingRequestId(request.id);
    setActivityNotice(action === "approve" ? "Approving due-date request..." : "Rejecting due-date request...");
    onProjectSyncStateChange?.(
      project.id,
      action === "approve" ? "Approving due-date request..." : "Rejecting due-date request..."
    );
    setLocalStage((current) => ({
      ...current,
      due_date: nextDueDate,
      status: nextStatus,
      due_date_requests: current.due_date_requests.map((entry) =>
        entry.id === request.id
          ? buildReviewedRequest({
              request: entry,
              action,
              note: reviewNote,
              reviewerName: viewerName
            })
          : entry
      )
    }));

    if (action === "approve") {
      setDueDate_(request.requested_due_date);
      setRequestedDueDate(request.requested_due_date);
    }

    try {
      const updatedProject = await reviewDueDateRequest.mutateAsync({
        stageId: localStage.id,
        requestId: request.id,
        action,
        note: reviewNote
      });
      syncStageFromProject(updatedProject);
      pushToast({
        tone: "success",
        title: action === "approve" ? "Request approved" : "Request rejected",
        description:
          action === "approve"
            ? "The stage due date was updated immediately."
            : "The requesting team can now submit another due-date request if needed."
      });
    } catch (error) {
      setLocalStage(previousStage);
      setDueDate_(previousStage.due_date ?? "");
      setRequestedDueDate(previousStage.due_date ?? "");
      setReviewError(error instanceof Error ? error.message : "Unable to review this request right now.");
    } finally {
      setReviewingRequestId(null);
      setActivityNotice(null);
      onProjectSyncStateChange?.(project.id, null);
    }
  };

  return (
    <section
      className={`space-y-4 rounded-[28px] border border-border bg-white shadow-panel transition-all ${
        isCollapsedStage ? "p-4" : "p-5"
      }`}
    >
      <div
        className={`flex flex-col gap-4 ${
          isCollapsedStage ? "xl:flex-row xl:items-center xl:justify-between" : "md:flex-row md:items-start md:justify-between"
        }`}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StatusChip status={localStage.status} />
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">
              {titleCasePhase(localStage.phase)}
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ink">{localStage.name}</h3>
            <p className="text-sm text-ink/60">Responsible department: {localStage.responsible_dept}</p>
          </div>
          {isCollapsedStage ? (
            <>
              <div className="flex flex-wrap gap-2">
                <CollapsedMetric label="Activated" value={formatDate(localStage.activated_at)} />
                <CollapsedMetric label="Due" value={formatDate(localStage.due_date)} />
                {isCompletedStage ? (
                  <CollapsedMetric label="Completed" value={formatDate(localStage.completed_at)} />
                ) : null}
                <CollapsedMetric label={isCompletedStage ? "Turnaround" : "Pending"} value={pendingDurationLabel || "-"} />
              </div>
              <p className="text-xs text-ink/50">
                {commentCount} comment{commentCount === 1 ? "" : "s"} and {dueDateRequestCount} due-date request
                {dueDateRequestCount === 1 ? "" : "s"} recorded for this stage.
              </p>
            </>
          ) : null}
        </div>

        <div
          className={`flex items-start gap-3 ${
            isCollapsedStage ? "flex-wrap xl:items-center xl:justify-end" : "flex-col md:items-end"
          }`}
        >
          <div className="text-sm text-ink/60">
            {isCompletedStage ? `Completed: ${formatDate(localStage.completed_at)}` : `Due: ${formatDate(localStage.due_date)}`}
          </div>
          {isCollapsibleStage ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink transition hover:border-accent hover:text-accent"
            >
              {expanded ? "Hide details" : "View details"}
            </button>
          ) : null}
          {!isCollapsedStage && canDirectSchedule ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate_(event.target.value)}
                className="rounded-full border border-border bg-surface-muted/50 px-3 py-1.5 text-xs outline-none transition focus:border-accent"
              />
              <button
                type="button"
                disabled={setDueDate.isPending || !dueDate || dueDate === localStage.due_date || hasPendingRequest}
                onClick={() => void handleSetDueDate()}
                className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {setDueDate.isPending ? "Saving..." : localStage.due_date ? "Update due date" : "Set due date"}
              </button>
            </div>
          ) : null}
          {!isCollapsedStage && canDirectSchedule && hasPendingRequest ? (
            <p className="text-xs text-ink/60">There is a pending due-date request waiting for Sales/Admin review below.</p>
          ) : null}
          {!isCollapsedStage && !canDirectSchedule ? (
            <p className="text-xs text-ink/45">
              Only Sales or Admin can set due dates directly. Your team can request a change below.
            </p>
          ) : null}
          {!isCompletedStage && canMarkStageComplete ? (
            <button
              type="button"
              disabled={completeStage.isPending || !canMarkStageComplete}
              onClick={() => void handleCompleteStage()}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {completeStage.isPending ? "Saving..." : "Mark Complete"}
            </button>
          ) : null}
        </div>
      </div>

      {activityNotice ? (
        <div className="rounded-2xl border border-accent/15 bg-accent/5 px-4 py-3 text-sm text-accent">
          {activityNotice}
        </div>
      ) : null}

      {completionError ? (
        <div className="rounded-2xl border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger">
          {completionError}
        </div>
      ) : null}

      {!isCollapsedStage ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StageMeta label="Activated" value={formatDateTime(localStage.activated_at)} />
            <StageMeta label="Due date" value={formatDate(localStage.due_date)} />
            <StageMeta label="Completed" value={formatDateTime(localStage.completed_at)} />
            <StageMeta label={isCompletedStage ? "Turnaround" : "Pending"} value={pendingDurationLabel || "-"} />
          </div>

          {canRequestDueDateChange || canReviewRequests || localStage.due_date_requests.length > 0 ? (
            <div className="space-y-4 rounded-3xl bg-surface-muted/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Due-date requests</h4>
                  <p className="text-xs text-ink/50">
                    Non-Sales teams can request date changes here. Sales/Admin can approve or reject them.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">
                  {localStage.due_date_requests.length} total
                </span>
              </div>

              {canRequestDueDateChange ? (
                <div className="space-y-3 rounded-2xl border border-border bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                        Requested due date
                      </span>
                      <input
                        type="date"
                        value={requestedDueDate}
                        onChange={(event) => setRequestedDueDate(event.target.value)}
                        className="w-full rounded-2xl border border-border bg-surface-muted/50 px-3 py-2 text-sm outline-none transition focus:border-accent"
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
                        className="w-full rounded-2xl border border-border bg-surface-muted/50 px-3 py-2 text-sm outline-none transition focus:border-accent"
                        placeholder="Explain why the due date needs to change."
                      />
                    </label>
                  </div>

                  {dueDateError ? (
                    <p className="rounded-2xl border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger">
                      {dueDateError}
                    </p>
                  ) : null}

                  {requestError ? (
                    <p className="rounded-2xl border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger">
                      {requestError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={
                        requestDueDateChange.isPending ||
                        hasPendingRequest ||
                        !requestedDueDate ||
                        requestedDueDate === localStage.due_date ||
                        !requestReason.trim()
                      }
                      onClick={() => void handleRequestDueDateChange()}
                      className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {requestDueDateChange.isPending ? "Sending..." : "Request due-date change"}
                    </button>
                    {hasPendingRequest ? (
                      <span className="text-xs text-ink/60">A request is already pending for this stage.</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {localStage.due_date_requests.length ? (
                <div className="space-y-3">
                  {localStage.due_date_requests.map((request) => (
                    <article key={request.id} className="space-y-3 rounded-2xl border border-border bg-white p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <DueDateRequestStatusChip status={request.status} />
                            <span className="text-sm font-semibold text-ink">{request.requestor_name ?? "Unknown user"}</span>
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
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
                        <div className="rounded-2xl bg-surface-muted/60 px-3 py-3 text-sm text-ink/70">
                          <div>
                            Reviewed by {request.reviewer_name ?? "Sales/Admin"} on {formatDateTime(request.reviewed_at)}
                          </div>
                          {request.review_note ? <div className="mt-1 text-ink/80">Note: {request.review_note}</div> : null}
                        </div>
                      ) : null}

                      {canReviewRequests && request.status === "pending" ? (
                        <div className="space-y-3 rounded-2xl bg-surface-muted/60 p-3">
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
                            className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
                            placeholder="Optional note for the requesting team."
                          />
                          {reviewError && reviewingRequestId === request.id ? (
                            <p className="rounded-2xl border border-danger/15 bg-danger/5 px-4 py-3 text-sm text-danger">
                              {reviewError}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={reviewDueDateRequest.isPending}
                              onClick={() => void handleReviewDueDateRequest(request, "approve")}
                              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {reviewingRequestId === request.id && reviewDueDateRequest.isPending ? "Saving..." : "Approve request"}
                            </button>
                            <button
                              type="button"
                              disabled={reviewDueDateRequest.isPending}
                              onClick={() => void handleReviewDueDateRequest(request, "reject")}
                              className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {reviewingRequestId === request.id && reviewDueDateRequest.isPending ? "Saving..." : "Reject request"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-white/70 px-4 py-4 text-sm text-ink/55">
                  No due-date requests have been raised for this stage yet.
                </div>
              )}
            </div>
          ) : null}

          <CommentThread
            stageId={localStage.id}
            comments={localStage.comments}
            canComment={canComment}
            viewerName={viewerName}
            viewerDepartment={viewerDepartment ?? null}
          />
        </>
      ) : null}
    </section>
  );
}

function DueDateRequestStatusChip({
  status
}: {
  status: DueDateRequestStatus;
}) {
  const styles: Record<DueDateRequestStatus, string> = {
    pending: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    rejected: "bg-danger/15 text-danger"
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
    <div className="rounded-2xl border border-border bg-surface-muted/40 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

function CollapsedMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-border bg-surface-muted/45 px-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">{label}</span>
      <span className="ml-2 text-sm font-medium text-ink">{value}</span>
    </div>
  );
}
