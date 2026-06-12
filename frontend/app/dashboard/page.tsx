import Link from "next/link";

import { ExportButton } from "@/components/ExportButton";
import { ProjectTable } from "@/components/ProjectTable";
import { getDashboardSummary, listProjects } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";
import type { DashboardSummary, ProjectSummary } from "@/lib/types";

const emptySummary: DashboardSummary = {
  total_projects: 0,
  active_stages: 0,
  overdue_stages: 0,
  completed_stages: 0
};

async function loadDashboard() {
  try {
    const { accessToken, department } = await getServerAuth();
    const [summary, projects] = await Promise.all([
      getDashboardSummary(accessToken),
      listProjects(accessToken)
    ]);
    return {
      department,
      summary,
      projects,
      error: null
    };
  } catch (error) {
    return {
      department: undefined,
      summary: emptySummary,
      projects: [] as ProjectSummary[],
      error: error instanceof Error ? error.message : "Unable to load the dashboard right now."
    };
  }
}

export default async function DashboardPage() {
  const { summary, projects, error, department } = await loadDashboard();
  const overviewLabel = department ? `${department} overview` : "Workflow overview";

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 rounded-[32px] bg-ink px-6 py-8 text-white shadow-panel md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <span className="inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            {overviewLabel}
          </span>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold">Internal Workflow Tracker</h1>
            <p className="max-w-2xl text-sm leading-7 text-white/70">
              Monitor active projects, spot overdue stages early, and hand off responsibility cleanly across
              departments.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 md:w-auto md:items-end">
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <ExportButton />
            {department === "Admin" ? (
              <Link
                href="/settings/workflow"
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-gold hover:text-gold"
              >
                Workflow settings
              </Link>
            ) : null}
            <Link
              href="/projects/new"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold"
            >
              New Project
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Projects" value={summary.total_projects} accent="text-ink" />
        <SummaryCard label="Active stages" value={summary.active_stages} accent="text-pine" />
        <SummaryCard label="Overdue stages" value={summary.overdue_stages} accent="text-ember" />
        <SummaryCard label="Completed stages" value={summary.completed_stages} accent="text-gold" />
      </section>

      {error ? <p className="rounded-2xl bg-gold/20 px-4 py-3 text-sm text-ink">{error}</p> : null}

      <ProjectTable projects={projects} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <article className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">{label}</p>
      <p className={`mt-4 text-4xl font-semibold ${accent}`}>{value}</p>
    </article>
  );
}
