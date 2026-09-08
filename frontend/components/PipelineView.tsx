"use client";

import { useEffect, useState } from "react";

import { StageRow } from "@/components/StageRow";
import type { Department, ProjectDetail } from "@/lib/types";
import { phaseOrder, titleCasePhase } from "@/lib/utils";

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

  return (
    <div className="space-y-8">
      {phaseOrder.map((phase) => {
        const stages = project.stages.filter((stage) => stage.phase === phase);
        if (!stages.length) {
          return null;
        }

        return (
          <section key={phase} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">{titleCasePhase(phase)}</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">
                {stages.length} stages
              </span>
            </div>
            <div className="grid gap-4">
              {stages.map((stage) => (
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
          </section>
        );
      })}
    </div>
  );
}
