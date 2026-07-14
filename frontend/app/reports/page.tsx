import Link from "next/link";
import { redirect } from "next/navigation";

import { MonthlyReportExportButton } from "@/components/MonthlyReportExportButton";
import { getMonthlyReport } from "@/lib/api";
import { getServerAuth } from "@/lib/supabase-server";
import type { MonthlyAuditEvent, MonthlyDepartmentReportRow, MonthlyProjectReportRow, MonthlyReport } from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime, formatMonthLabel, formatPercent } from "@/lib/utils";

type SearchParamsInput =
  | Promise<{ month?: string | string[] | undefined }>
  | { month?: string | string[] | undefined }
  | undefined;

function getDefaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function resolveMonthInput(rawMonth: string | string[] | undefined) {
  if (Array.isArray(rawMonth)) {
    return rawMonth[0] ?? getDefaultMonth();
  }

  return rawMonth ?? getDefaultMonth();
}

async function loadMonthlyReport(month: string) {
  const { accessToken, department } = await getServerAuth();

  if (!accessToken) {
    redirect("/login");
  }

  if (department !== "Sales" && department !== "Admin") {
    return {
      department,
      report: null as MonthlyReport | null,
      error: "Only Sales or Admin can access the monthly audit and reporting workspace."
    };
  }

  try {
    const report = await getMonthlyReport(month, accessToken);
    return {
      department,
      report,
      error: null
    };
  } catch (error) {
    return {
      department,
      report: null as MonthlyReport | null,
      error: error instanceof Error ? error.message : "Unable to generate this monthly report right now."
    };
  }
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: SearchParamsInput;
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const selectedMonth = resolveMonthInput(resolvedSearchParams?.month);
  const { department, report, error } = await loadMonthlyReport(selectedMonth);

  if (!report) {
    return (
      <div className="space-y-8">
        <Link href="/dashboard" className="text-sm font-medium text-pine hover:text-ink">
          Back to dashboard
        </Link>

        <section className="rounded-[32px] border border-gold/40 bg-white p-8 shadow-panel">
          <h1 className="text-3xl font-semibold text-ink">Reports unavailable</h1>
          <p className="mt-3 text-sm text-ink/60">{error ?? "Unable to load the reporting workspace."}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="text-sm font-medium text-pine hover:text-ink">
        Back to dashboard
      </Link>

      <section className="rounded-[32px] bg-ink px-6 py-8 text-white shadow-panel">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <span className="inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              {department} reporting
            </span>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold">Audit & Monthly Reports</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/70">
                Generate one-click monthly reporting for Sales and Admin, including department load, project
                completion, overdue movement, and a live audit feed of stage and comment activity.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <form action="/reports" method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Month</span>
                <input
                  type="month"
                  name="month"
                  defaultValue={report.month}
                  className="bg-transparent text-sm font-medium text-white outline-none"
                />
              </label>
              <button
                type="submit"
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-gold"
              >
                Apply
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <MonthlyReportExportButton month={report.month} />
              <Link
                href={`/reports?month=${getDefaultMonth()}`}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-gold hover:text-gold"
              >
                Jump to current month
              </Link>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl bg-gold/20 px-4 py-3 text-sm text-ink">{error}</p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Projects In Scope" value={String(report.overview.projects_in_scope)} accent="text-ink" />
        <SummaryCard label="Created This Month" value={String(report.overview.projects_created)} accent="text-pine" />
        <SummaryCard label="Stages Completed" value={String(report.overview.stages_completed)} accent="text-gold" />
        <SummaryCard label="Overdue Events" value={String(report.overview.overdue_events)} accent="text-ember" />
        <SummaryCard label="Active Projects" value={String(report.overview.active_projects)} accent="text-pine" />
        <SummaryCard label="Overdue Projects" value={String(report.overview.overdue_projects)} accent="text-ember" />
        <SummaryCard label="Comments Logged" value={String(report.overview.comments_logged)} accent="text-ink" />
        <SummaryCard
          label="Pipeline Value"
          value={formatCurrency(report.overview.total_pipeline_value)}
          accent="text-ink"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[32px] border border-ink/10 bg-white p-5 shadow-panel">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Trend Watch</p>
              <h2 className="mt-1 text-2xl font-semibold text-ink">{formatMonthLabel(report.month)}</h2>
            </div>
            <p className="text-sm text-ink/55">
              {formatDate(report.period_start)} to {formatDate(report.period_end)}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {report.trends.map((trend) => (
              <TrendCard key={trend.label} trend={trend} />
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-ink/10 bg-white p-5 shadow-panel">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">What This Covers</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Current project snapshot</h2>
            <p className="mt-2 text-sm leading-7 text-ink/60">
              The project and department tables below show the current tracker state for every workflow that was
              created, updated, scheduled, completed, or commented on during the selected month.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <KeyMetric label="Completed projects now" value={String(report.overview.completed_projects)} />
            <KeyMetric label="Projects created in month" value={String(report.overview.projects_created)} />
            <KeyMetric label="Open overdue load" value={String(report.overview.overdue_projects)} />
            <KeyMetric label="Stage comments logged" value={String(report.overview.comments_logged)} />
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Department Summary</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">Department pulse</h2>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full divide-y divide-ink/10">
            <thead className="bg-sand/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Department</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Total stages</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Completed</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Completed in month</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Active now</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Overdue now</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Pending now</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Completion rate</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Avg completion</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Avg delay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {report.departments.length ? (
                report.departments.map((row) => (
                  <DepartmentRow key={row.department} row={row} />
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-sm text-ink/45">
                    No department activity matched this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[32px] border border-ink/10 bg-white shadow-panel">
        <div className="border-b border-ink/10 px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Project Summary</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">Projects touched in {formatMonthLabel(report.month)}</h2>
        </div>

        <div className="max-h-[36rem] overflow-auto">
          <table className="min-w-full divide-y divide-ink/10">
            <thead className="bg-sand/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Code</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Project</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Current stage</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Status</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Progress</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Delay</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Business context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {report.projects.length ? (
                report.projects.map((project) => <ProjectReportRow key={project.project_id} project={project} />)
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-sm text-ink/45">
                    No project activity matched this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[32px] border border-ink/10 bg-white p-5 shadow-panel">
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Audit Feed</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Recent stage and comment activity</h2>
          </div>
          <p className="text-sm text-ink/55">Latest {report.audit_events.length} events in the selected month</p>
        </div>

        <div className="space-y-3">
          {report.audit_events.length ? (
            report.audit_events.map((event) => <AuditEventCard key={event.event_id} event={event} />)
          ) : (
            <p className="rounded-2xl border border-dashed border-ink/10 px-4 py-5 text-sm text-ink/45">
              No audit activity was logged for this month.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  sublabel
}: {
  label: string;
  value: string;
  accent: string;
  sublabel?: string;
}) {
  return (
    <article className="rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">{label}</p>
      <p className={`mt-4 text-3xl font-semibold ${accent}`}>{value}</p>
      {sublabel ? <p className="mt-2 text-sm text-ink/50">{sublabel}</p> : null}
    </article>
  );
}

function TrendCard({
  trend
}: {
  trend: MonthlyReport["trends"][number];
}) {
  return (
    <article className="rounded-[28px] border border-ink/10 bg-sand/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{trend.label}</p>
          <p className="text-xs text-ink/45">
            {formatDate(trend.period_start)} to {formatDate(trend.period_end)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniMetric label="Projects created" value={String(trend.projects_created)} />
        <MiniMetric label="Stages completed" value={String(trend.stages_completed)} />
        <MiniMetric label="Overdue events" value={String(trend.overdue_events)} tone="text-ember" />
        <MiniMetric label="Comments" value={String(trend.comments_logged)} />
      </div>
    </article>
  );
}

function MiniMetric({
  label,
  value,
  tone = "text-ink"
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function KeyMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-ink/10 bg-sand/45 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function DepartmentRow({
  row
}: {
  row: MonthlyDepartmentReportRow;
}) {
  return (
    <tr className="text-sm text-ink/75 transition hover:bg-sand/30">
      <td className="px-5 py-4 font-semibold text-ink">{row.department}</td>
      <td className="px-5 py-4">{row.total_stages}</td>
      <td className="px-5 py-4">{row.completed_total}</td>
      <td className="px-5 py-4">{row.completed_this_month}</td>
      <td className="px-5 py-4">{row.active_now}</td>
      <td className="px-5 py-4 text-ember">{row.overdue_now}</td>
      <td className="px-5 py-4">{row.pending_now}</td>
      <td className="px-5 py-4 font-semibold text-pine">{formatPercent(row.completion_rate)}</td>
      <td className="px-5 py-4">{row.avg_completion_days !== null ? `${row.avg_completion_days}d` : "--"}</td>
      <td className="px-5 py-4">{row.avg_delay_days !== null ? `${row.avg_delay_days}d` : "--"}</td>
    </tr>
  );
}

function ProjectReportRow({
  project
}: {
  project: MonthlyProjectReportRow;
}) {
  const statusTone =
    project.status_label === "Overdue"
      ? "bg-ember/10 text-ember"
      : project.status_label === "Completed"
        ? "bg-pine/10 text-pine"
        : "bg-blue-100 text-blue-700";

  return (
    <tr className="text-sm text-ink/75 transition hover:bg-sand/30">
      <td className="px-5 py-4 font-semibold text-ink">{project.project_code}</td>
      <td className="px-5 py-4">
        <Link href={`/projects/${project.project_id}`} className="font-medium text-pine hover:text-ink">
          {project.project_name}
        </Link>
        <div className="mt-1 text-xs text-ink/45">{project.client}</div>
      </td>
      <td className="px-5 py-4">
        <div>{project.current_stage_name ?? "Completed workflow"}</div>
        <div className="mt-1 text-xs text-ink/45">
          {project.current_stage_department ?? "No active owner"}
          {project.current_stage_due_date ? ` • Due ${formatDate(project.current_stage_due_date)}` : ""}
        </div>
      </td>
      <td className="px-5 py-4">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${statusTone}`}>
          {project.status_label}
        </span>
      </td>
      <td className="px-5 py-4">
        <div className="font-semibold text-ink">
          {project.completed_stages}/{project.total_stages}
        </div>
        <div className="mt-1 text-xs text-ink/45">
          {formatPercent(project.completion_rate)} complete • {project.completed_this_month} done this month
        </div>
      </td>
      <td className="px-5 py-4">
        {project.current_delay_days !== null ? (
          <span className="font-semibold text-ember">{project.current_delay_days}d late</span>
        ) : (
          <span className="text-ink/45">On track</span>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="space-y-1 text-xs text-ink/55">
          <div>Assigned: {project.assigned_person_name ?? "Unassigned"}</div>
          <div>Value: {formatCurrency(project.total_order_value)}</div>
          <div>Created: {formatDate(project.created_at)}</div>
        </div>
      </td>
    </tr>
  );
}

function AuditEventCard({
  event
}: {
  event: MonthlyAuditEvent;
}) {
  return (
    <article className="rounded-[28px] border border-ink/10 bg-sand/35 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
              {event.event_type}
            </span>
            <Link href={`/projects/${event.project_id}`} className="text-sm font-semibold text-pine hover:text-ink">
              {event.project_code}
            </Link>
            <span className="text-sm text-ink/45">{event.project_name}</span>
          </div>

          <div className="text-sm font-medium text-ink">{event.stage_name ?? "Workflow activity"}</div>
          <p className="text-sm leading-7 text-ink/60">{event.details}</p>
        </div>

        <div className="min-w-[13rem] space-y-1 rounded-[22px] border border-white/80 bg-white/80 px-4 py-3 text-sm">
          <p className="font-semibold text-ink">{event.actor_name}</p>
          <p className="text-ink/55">{event.actor_email ?? "No email captured"}</p>
          <p className="text-xs uppercase tracking-[0.14em] text-ink/40">{formatDateTime(event.changed_at)}</p>
        </div>
      </div>
    </article>
  );
}
