import { redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { listProjects } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";
import type { ProjectSummary } from "@/lib/types";

async function loadDashboard() {
  const { accessToken, department, viewer } = await getServerAuth();

  if (!accessToken) {
    redirect("/login");
  }

  let projects: ProjectSummary[] = [];
  let error: string | null = null;

  try {
    projects = await listProjects(accessToken);
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : "Unable to load the dashboard right now.";
  }

  return {
    department,
    viewer,
    projects,
    error
  };
}

export default async function DashboardPage() {
  const { department, viewer, projects, error } = await loadDashboard();

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-ink">{error}</p> : null}

      <ProjectWorkspace
        projects={projects}
        viewerDepartment={department ?? null}
        viewer={viewer ?? null}
      />
    </div>
  );
}
