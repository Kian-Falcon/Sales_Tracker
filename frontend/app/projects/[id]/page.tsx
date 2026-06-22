import Link from "next/link";

import { PipelineView } from "@/components/PipelineView";
import { ProjectDocumentsPanel } from "@/components/ProjectDocumentsPanel";
import { ProjectOverviewPanel } from "@/components/ProjectOverviewPanel";
import { getProject } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";

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
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: { upload?: string };
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

      {searchParams?.upload === "failed" ? (
        <p className="rounded-2xl bg-gold/20 px-4 py-3 text-sm text-ink">
          Project created successfully, but the BOQ upload did not finish. You can upload it from the documents panel
          below.
        </p>
      ) : null}

      <ProjectOverviewPanel project={project} viewerDepartment={department} />

      <ProjectDocumentsPanel
        projectId={project.id}
        documents={project.documents}
        viewerDepartment={department}
      />

      <PipelineView project={project} viewerDepartment={department} />
    </div>
  );
}
