"use client";

import { useEffect, useState } from "react";

import { StageRow } from "@/components/StageRow";
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

  useEffect(() => {
    setProject(initialProject);
  }, [initialProject]);

  const handleProjectUpdate = (updatedProject: ProjectDetail) => {
    setProject(updatedProject);
    onProjectChange?.(updatedProject);
  };

  const orderedStages = sortStages(project.stages);

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
