import { redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { getDashboardSummary, getProject, listProjects } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";
import type { DashboardSummary, ProjectDetail, ProjectSummary } from "@/lib/types";

const emptySummary: DashboardSummary = {
  total_projects: 0,
  active_stages: 0,
  overdue_stages: 0,
  completed_stages: 0
};

type DashboardSearchParams =
  | Promise<{
      project?: string | string[] | undefined;
      panel?: string | string[] | undefined;
      new?: string | string[] | undefined;
      upload?: string | string[] | undefined;
    }>
  | {
      project?: string | string[] | undefined;
      panel?: string | string[] | undefined;
      new?: string | string[] | undefined;
      upload?: string | string[] | undefined;
    }
  | undefined;

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? undefined : value;
}

function resolvePanelTab(value: string | string[] | undefined) {
  const resolved = getSingleValue(value);
  if (resolved === "pipeline" || resolved === "documents") {
    return resolved;
  }

  return "overview";
}

async function loadDashboard(selectedProjectId: string | null) {
  const { accessToken, department, viewer } = await getServerAuth();

  if (!accessToken) {
    redirect("/login");
  }

  let summary = emptySummary;
  let projects: ProjectSummary[] = [];
  let error: string | null = null;

  try {
    [summary, projects] = await Promise.all([getDashboardSummary(accessToken), listProjects(accessToken)]);
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : "Unable to load the dashboard right now.";
  }

  let selectedProject: ProjectDetail | null = null;
  let selectedProjectError: string | null = null;

  if (selectedProjectId) {
    if (error) {
      selectedProjectError = error;
    } else {
      try {
        selectedProject = await getProject(selectedProjectId, accessToken);
      } catch (caughtError) {
        selectedProjectError =
          caughtError instanceof Error ? caughtError.message : "Unable to load this project right now.";
      }
    }
  }

  return {
    department,
    viewer,
    summary,
    projects,
    error,
    selectedProject,
    selectedProjectError
  };
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: DashboardSearchParams;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const selectedProjectId = getSingleValue(resolvedSearchParams?.project) ?? null;
  const initialPanelTab = resolvePanelTab(resolvedSearchParams?.panel);
  const initialNewProjectOpen = getSingleValue(resolvedSearchParams?.new) === "1";
  const uploadFailed = getSingleValue(resolvedSearchParams?.upload) === "failed";

  const { department, viewer, summary, projects, error, selectedProject, selectedProjectError } =
    await loadDashboard(selectedProjectId);

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">{error}</p> : null}

      <ProjectWorkspace
        projects={projects}
        summary={summary}
        viewerDepartment={department ?? null}
        viewer={viewer ?? null}
        selectedProject={selectedProject}
        selectedProjectId={selectedProjectId}
        selectedProjectError={selectedProjectError}
        initialPanelTab={initialPanelTab}
        initialNewProjectOpen={initialNewProjectOpen}
        uploadFailed={uploadFailed}
      />
    </div>
  );
}
