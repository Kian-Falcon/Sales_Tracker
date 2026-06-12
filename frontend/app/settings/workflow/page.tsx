import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkflowSettingsEditor } from "@/components/WorkflowSettingsEditor";
import { listWorkflowSettings } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";
import type { WorkflowStageSetting } from "@/lib/types";

async function loadWorkflowSettings() {
  const { accessToken, department } = await getServerAuth();

  if (!accessToken) {
    redirect("/login");
  }

  if (department !== "Admin") {
    return {
      department,
      settings: [] as WorkflowStageSetting[],
      error: "Only Admin can edit workflow settings."
    };
  }

  try {
    const settings = await listWorkflowSettings(accessToken);
    return {
      department,
      settings,
      error: null
    };
  } catch (error) {
    return {
      department,
      settings: [] as WorkflowStageSetting[],
      error: error instanceof Error ? error.message : "Unable to load workflow settings right now."
    };
  }
}

export default async function WorkflowSettingsPage() {
  const { settings, error } = await loadWorkflowSettings();

  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="text-sm font-medium text-pine hover:text-ink">
        Back to dashboard
      </Link>

      {error ? (
        <section className="rounded-[32px] border border-gold/40 bg-white p-8 shadow-panel">
          <h1 className="text-3xl font-semibold text-ink">Workflow settings unavailable</h1>
          <p className="mt-3 text-sm text-ink/60">{error}</p>
        </section>
      ) : (
        <WorkflowSettingsEditor initialSettings={settings} />
      )}
    </div>
  );
}
