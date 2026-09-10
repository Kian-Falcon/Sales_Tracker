"use client";

import { useEffect, useState } from "react";

import { StageRow } from "@/components/StageRow";
import type { Department, ProjectDetail, Stage } from "@/lib/types";
import { formatDate, formatPendingDuration } from "@/lib/utils";

type MacroStageStatus = "pending" | "active" | "overdue" | "done";

type MacroStageDefinition = {
  key: string;
  title: string;
  handoff: string;
  summary: string;
  stageKeys: string[];
};

type MacroStageGroup = {
  definition: MacroStageDefinition;
  stages: Stage[];
  status: MacroStageStatus;
  completedSteps: number;
  totalSteps: number;
  progressPercent: number;
  liveStage: Stage | null;
  latestStage: Stage | null;
};

const MACRO_STAGE_DEFINITIONS: MacroStageDefinition[] = [
  {
    key: "costing",
    title: "Costing",
    handoff: "Sales -> R&D",
    summary: "Commercial costing handoff",
    stageKeys: [
      "costing_sop_logged",
      "costing_bom_prepared",
      "costing_shared_rd",
      "costing_revision_items",
      "costing_client_approved"
    ]
  },
  {
    key: "drawing",
    title: "Drawing",
    handoff: "Sales -> R&D",
    summary: "Drawing handoff and approvals",
    stageKeys: [
      "drawing_sop_logged",
      "drawings_prepared_rd",
      "drawings_shared_client",
      "drawing_revision_items",
      "drawings_client_approved"
    ]
  },
  {
    key: "sampling",
    title: "Sampling",
    handoff: "Sales -> R&D",
    summary: "Sampling handoff and revisions",
    stageKeys: [
      "sample_sop_logged",
      "sample_development_started",
      "sample_completed_rd",
      "samples_shared_client",
      "sample_revisions_requested",
      "revised_samples_started",
      "revised_samples_completed",
      "sample_client_approved"
    ]
  },
  {
    key: "order-sop",
    title: "Order SOP",
    handoff: "Sales -> Production",
    summary: "Commercial to production release",
    stageKeys: [
      "order_sop_logged_production",
      "bom_ordered_production",
      "raw_material_procurement_completed",
      "production_started",
      "production_completed",
      "qc_completed"
    ]
  },
  {
    key: "dispatch",
    title: "Dispatch",
    handoff: "Final stage",
    summary: "Final dispatch confirmation",
    stageKeys: ["dispatch_completed"]
  }
];

function sortStages(stages: Stage[]) {
  return [...stages].sort((left, right) => left.sort_order - right.sort_order);
}

function deriveMacroStageStatus(stages: Stage[], totalSteps: number): MacroStageStatus {
  if (stages.some((stage) => stage.status === "overdue")) {
    return "overdue";
  }

  if (stages.some((stage) => stage.status === "active")) {
    return "active";
  }

  const completedSteps = stages.filter((stage) => stage.status === "done").length;

  if (completedSteps >= totalSteps && totalSteps > 0) {
    return "done";
  }

  if (stages.length > 0) {
    return "active";
  }

  return "pending";
}

function deriveProgressPercent(stages: Stage[], totalSteps: number) {
  if (!totalSteps) {
    return 0;
  }

  const completedSteps = stages.filter((stage) => stage.status === "done").length;
  const hasLiveStage = stages.some((stage) => stage.status === "active" || stage.status === "overdue");
  const progressUnits = completedSteps + (hasLiveStage ? 0.5 : 0);

  return Math.min(100, Math.max(8, Math.round((progressUnits / totalSteps) * 100)));
}

function buildMacroStageGroups(project: ProjectDetail) {
  return MACRO_STAGE_DEFINITIONS.map<MacroStageGroup | null>((definition) => {
    const stages = sortStages(project.stages.filter((stage) => definition.stageKeys.includes(stage.stage_key)));

    if (!stages.length) {
      return null;
    }

    const completedSteps = stages.filter((stage) => stage.status === "done").length;
    const totalSteps = definition.stageKeys.length;
    const liveStage = stages.find((stage) => stage.status === "active" || stage.status === "overdue") ?? null;
    const latestStage = stages[stages.length - 1] ?? null;

    return {
      definition,
      stages,
      status: deriveMacroStageStatus(stages, totalSteps),
      completedSteps,
      totalSteps,
      progressPercent: deriveProgressPercent(stages, totalSteps),
      liveStage,
      latestStage
    };
  }).filter((group): group is MacroStageGroup => group !== null);
}

export function PipelineView({
  project: initialProject,
  viewerDepartment,
  viewerName,
  onProjectChange,
  onProjectSyncStateChange
}: {
  project: ProjectDetail;
  viewerDepartment?: Department;
  viewerName?: string | null;
  onProjectChange?: (project: ProjectDetail) => void;
  onProjectSyncStateChange?: (projectId: string, label: string | null) => void;
}) {
  const [project, setProject] = useState(initialProject);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  useEffect(() => {
    setExpandedGroups({});
  }, [initialProject.id]);

  const handleProjectUpdate = (updatedProject: ProjectDetail) => {
    setProject(updatedProject);
    onProjectChange?.(updatedProject);
  };

  const groups = buildMacroStageGroups(project);

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-border bg-white px-5 py-4 shadow-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Founder flow</p>
            <h2 className="text-lg font-semibold text-ink">Five milestone view</h2>
            <p className="text-sm text-ink/60">
              Internal checkpoints stay tucked away until someone opens a milestone, so the workflow reads more like a clean execution board.
            </p>
          </div>
          <div className="rounded-full border border-border bg-surface-muted/45 px-3 py-2 text-xs font-medium text-ink/60">
            {viewerDepartment ? `${viewerDepartment} view` : "Shared workflow view"}
          </div>
        </div>
      </section>

      {groups.length ? (
        groups.map((group) => {
          const expanded = expandedGroups[group.definition.key] ?? false;
          const summaryStage = group.liveStage ?? group.latestStage;
          const stageDuration = summaryStage
            ? formatPendingDuration(
                summaryStage.activated_at,
                summaryStage.status === "done" ? summaryStage.completed_at : undefined
              ) || "Under 1 hour"
            : "Not started";
          const statusDateLabel = group.liveStage ? "Due" : "Last completed";
          const statusDateValue = group.liveStage
            ? formatDate(group.liveStage.due_date)
            : formatDate(group.latestStage?.completed_at ?? group.latestStage?.due_date ?? null);
          const checkpointLabel = group.liveStage ? "Current checkpoint" : "Latest checkpoint";
          const ownerLabel = group.liveStage
            ? group.liveStage.responsible_dept
            : group.status === "done"
              ? "Completed"
              : group.definition.handoff;

          return (
            <section
              key={group.definition.key}
              className="rounded-[28px] border border-border bg-white px-5 py-5 shadow-panel"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/65">
                      {group.definition.title}
                    </span>
                    <span className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/55">
                      {group.definition.handoff}
                    </span>
                    <MacroStageStatusChip status={group.status} />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold text-ink">{group.definition.summary}</h3>
                    <p className="text-sm text-ink/60">
                      {summaryStage
                        ? `${summaryStage.name} is the latest revealed checkpoint in this milestone.`
                        : "This milestone will appear once its first checkpoint becomes active."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [group.definition.key]: !expanded
                    }))
                  }
                  aria-expanded={expanded}
                  className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent hover:text-white"
                >
                  {expanded ? "Hide checkpoints" : `Open ${group.stages.length} checkpoint${group.stages.length === 1 ? "" : "s"}`}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <FlowMetric
                  label="Progress"
                  value={`${group.completedSteps}/${group.totalSteps} completed`}
                  helper={`${group.stages.length} revealed so far`}
                />
                <FlowMetric
                  label={checkpointLabel}
                  value={summaryStage?.name ?? "Not started"}
                  helper={`Status: ${macroStageStatusLabel(group.status)}`}
                />
                <FlowMetric label="Current owner" value={ownerLabel} helper={`Elapsed: ${stageDuration}`} />
                <FlowMetric label={statusDateLabel} value={statusDateValue} helper={group.definition.title} />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                  <span>Milestone completion</span>
                  <span>{group.progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={`h-full rounded-full transition-all ${macroStageProgressClassName(group.status)}`}
                    style={{ width: `${group.progressPercent}%` }}
                  />
                </div>
              </div>

              {expanded ? (
                <div className="mt-5 space-y-4 border-t border-border pt-5">
                  {group.stages.map((stage) => (
                    <StageRow
                      key={stage.id}
                      project={project}
                      stage={stage}
                      viewerDepartment={viewerDepartment}
                      viewerName={viewerName}
                      onProjectChange={handleProjectUpdate}
                      onProjectSyncStateChange={onProjectSyncStateChange}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })
      ) : (
        <div className="rounded-[28px] border border-border bg-white px-5 py-6 text-sm text-ink/60 shadow-panel">
          No milestones have been activated yet for this project.
        </div>
      )}

      <section className="rounded-[24px] border border-dashed border-border bg-white/90 px-4 py-4 shadow-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/65">
                Complaint SOP
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/55">
                Small section
              </span>
            </div>
            <h3 className="text-base font-semibold text-ink">Post-dispatch follow-up stays separate</h3>
            <p className="text-sm text-ink/60">
              This compact block is reserved for complaint handling after delivery so the main execution flow stays clean during demos and daily tracking.
            </p>
          </div>
          <div className="rounded-full bg-surface-muted px-3 py-2 text-xs font-medium text-ink/55">Reserved for next iteration</div>
        </div>
      </section>
    </div>
  );
}

function MacroStageStatusChip({
  status
}: {
  status: MacroStageStatus;
}) {
  const styles: Record<MacroStageStatus, string> = {
    pending: "bg-surface-muted text-ink/60",
    active: "bg-danger/12 text-danger",
    overdue: "bg-danger/18 text-danger",
    done: "bg-success/15 text-success"
  };

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${styles[status]}`}>
      {macroStageStatusLabel(status)}
    </span>
  );
}

function FlowMetric({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-muted/35 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 text-sm font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink/50">{helper}</div>
    </div>
  );
}

function macroStageStatusLabel(status: MacroStageStatus) {
  switch (status) {
    case "done":
      return "Completed";
    case "overdue":
      return "Overdue";
    case "active":
      return "In Progress";
    default:
      return "Not Started";
  }
}

function macroStageProgressClassName(status: MacroStageStatus) {
  switch (status) {
    case "done":
      return "bg-success";
    case "overdue":
      return "bg-danger";
    case "active":
      return "bg-danger";
    default:
      return "bg-ink/20";
  }
}
