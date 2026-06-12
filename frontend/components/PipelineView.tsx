import type { Department, ProjectDetail } from "@/lib/types";
import { phaseOrder, titleCasePhase } from "@/lib/utils";
import { StageRow } from "@/components/StageRow";

export function PipelineView({
  project,
  viewerDepartment
}: {
  project: ProjectDetail;
  viewerDepartment?: Department;
}) {
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
                <StageRow key={stage.id} stage={stage} viewerDepartment={viewerDepartment} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
