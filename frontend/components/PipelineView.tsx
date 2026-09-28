"use client";

import { useEffect, useState, useTransition } from "react";

import { StageRow } from "@/components/StageRow";
import { useToast } from "@/components/ToastProvider";
import { markProjectFreshCostingNotRequired } from "@/lib/api";
import type { Department, ProjectDetail, Stage } from "@/lib/types";
import { titleCasePhase } from "@/lib/utils";

function sortStages(stages: Stage[]) {
  return [...stages].sort((left, right) => left.sort_order - right.sort_order);
}

function PhaseDivider({
  phase
}: {
  phase: Stage["phase"];
}) {
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/60">
        {titleCasePhase(phase)}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
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
  const [costingRulePending, startTransition] = useTransition();
  const [costingRuleError, setCostingRuleError] = useState<string | null>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    setProject(initialProject);
    setCostingRuleError(null);
  }, [initialProject]);

  const handleProjectUpdate = (updatedProject: ProjectDetail) => {
    setProject(updatedProject);
    onProjectChange?.(updatedProject);
  };

  const orderedStages = sortStages(project.stages);
  const canManageCostingRequirement = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const hasOpenCostingStages = orderedStages.some((stage) => stage.phase === "costing" && stage.status !== "done");

  const handleMarkFreshCostingNotRequired = () => {
    if (!canManageCostingRequirement || !project.requires_fresh_costing) {
      return;
    }

    setCostingRuleError(null);
    onProjectSyncStateChange?.(project.id, "Skipping unfinished fresh costing stages...");

    startTransition(() => {
      void (async () => {
        try {
          const updatedProject = await markProjectFreshCostingNotRequired(project.id);
          handleProjectUpdate(updatedProject);
          pushToast({
            tone: "success",
            title: "Fresh costing skipped",
            description: hasOpenCostingStages
              ? "The remaining costing steps were skipped and the workflow moved to the next applicable stage."
              : "This project is now marked as not requiring a fresh costing SOP."
          });
        } catch (error) {
          setCostingRuleError(
            error instanceof Error ? error.message : "Unable to mark fresh costing as not required right now."
          );
        } finally {
          onProjectSyncStateChange?.(project.id, null);
        }
      })();
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-border bg-white px-5 py-4 shadow-panel">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Pipeline</p>
            <h2 className="text-lg font-semibold text-ink">Stage-by-stage workflow</h2>
            <p className="text-sm text-ink/60">
              Every stage is shown individually in sequence, without milestone bundling or progress markers.
            </p>
          </div>
          <div className="rounded-full border border-border bg-surface-muted/45 px-3 py-2 text-xs font-medium text-ink/60">
            {viewerDepartment ? `${viewerDepartment} view` : "Shared workflow view"}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-border bg-white px-5 py-4 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Fresh costing SOP</p>
            {project.requires_fresh_costing ? (
              <>
                <h3 className="text-base font-semibold text-ink">This project currently requires the costing phase.</h3>
                <p className="max-w-2xl text-sm text-ink/60">
                  If this is a singular project that does not need a fresh costing SOP from R&D, Sales or Admin can
                  mark it not required here and the workflow will continue from the next applicable stage.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-ink">Fresh costing is not required for this project.</h3>
                <p className="max-w-2xl text-sm text-ink/60">
                  Remaining costing-only handoffs are skipped for this project, and the pipeline continues from the
                  next applicable stage.
                </p>
              </>
            )}
          </div>

          {canManageCostingRequirement && project.requires_fresh_costing ? (
            <button
              type="button"
              onClick={handleMarkFreshCostingNotRequired}
              disabled={costingRulePending}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {costingRulePending ? "Updating..." : "Mark not required"}
            </button>
          ) : (
            <div className="rounded-full border border-border bg-surface-muted/45 px-3 py-2 text-xs font-medium text-ink/60">
              {project.requires_fresh_costing ? "Sales/Admin only" : "Marked not required"}
            </div>
          )}
        </div>

        {costingRuleError ? (
          <p className="mt-4 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">
            {costingRuleError}
          </p>
        ) : null}
      </section>

      {orderedStages.length ? (
        <div className="space-y-4">
          {orderedStages.map((stage, index) => {
            const previousStage = orderedStages[index - 1];
            const showPhaseDivider = index === 0 || previousStage.phase !== stage.phase;

            return (
              <div key={stage.id} className="space-y-3">
                {showPhaseDivider ? <PhaseDivider phase={stage.phase} /> : null}
                <StageRow
                  project={project}
                  stage={stage}
                  viewerDepartment={viewerDepartment}
                  viewerName={viewerName}
                  onProjectChange={handleProjectUpdate}
                  onProjectSyncStateChange={onProjectSyncStateChange}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[28px] border border-border bg-white px-5 py-6 text-sm text-ink/60 shadow-panel">
          No stages are available yet for this project.
        </div>
      )}
    </div>
  );
}
