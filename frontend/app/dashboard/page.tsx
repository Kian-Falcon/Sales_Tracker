import { redirect } from "next/navigation";

import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { getServerAuth } from "@/lib/supabase-server";

async function loadDashboard() {
  const { accessToken, department, viewer } = await getServerAuth();

  if (!accessToken) {
    redirect("/login");
  }

  return {
    department,
    viewer
  };
}

export default async function DashboardPage() {
  const { department, viewer } = await loadDashboard();

  return (
    <ProjectWorkspace
      viewerDepartment={department ?? null}
      viewer={viewer ?? null}
    />
  );
}
