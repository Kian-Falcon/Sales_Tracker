import Link from "next/link";

import { PipelineView } from "@/components/PipelineView";
import { getProject } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";

async function loadProject(id: string) {
  try {
    const { accessToken, department } = await getServerAuth();
    const project = await getProject(id, accessToken);

    return {
      project,
      department,
      error: null
    };
  } catch (error) {
    return {
      project: null,
      department: null,
      error: error instanceof Error ? error.message : "Unable to load this project right now."
    };
  }
}

export default async function ProjectDetailPage({
  params
}: {
  params: { id: string };
}) {
  const { project, department, error } = await loadProject(params.id);

  if (!project || !department) {
    return (
      <div className="space-y-4 rounded-[32px] bg-white p-8 shadow-panel">
        <Link href="/dashboard" className="text-sm font-medium text-pine hover:text-ink">
          Back to dashboard
        </Link>
        <h1 className="text-3xl font-semibold text-ink">Couldn&apos;t load this project</h1>
        <p className="text-sm text-ink/60">{error ?? "Something went wrong while loading the project."}</p>
        <p className="text-xs uppercase tracking-[0.18em] text-ink/35">Project ID: {params.id}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="text-sm font-medium text-pine hover:text-ink">
        Back to dashboard
      </Link>

      <section className="rounded-[32px] bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink/70">
              {project.project_code}
            </span>
            <div>
              <h1 className="text-4xl font-semibold text-ink">{project.name}</h1>
              <p className="text-sm text-ink/60">
                {project.client}
                {project.brand ? ` - ${project.brand}` : ""}
              </p>
            </div>
          </div>

          <div className="text-sm text-ink/55">Created {formatDate(project.created_at)}</div>
        </div>
      </section>

      <PipelineView project={project} viewerDepartment={department} />
    </div>
  );
}
