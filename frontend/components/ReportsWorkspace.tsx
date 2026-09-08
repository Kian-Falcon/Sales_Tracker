"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { MonthlyReportExportButton } from "@/components/MonthlyReportExportButton";
import type {
  Department,
  MonthlyAuditEvent,
  MonthlyDepartmentReportRow,
  MonthlyProjectReportRow,
  MonthlyReport,
} from "@/lib/types";
import { cn, formatCurrency, formatDate, formatDateTime, formatMonthLabel, formatPercent } from "@/lib/utils";

type DeltaDirection = "up" | "down" | "flat";
type DeltaTone = "success" | "danger" | "neutral";
type DepartmentMetric = "completion_rate" | "avg_delay_days" | "overdue_now";
type ProjectGroupBy = "none" | "department" | "status";
type ProjectSortKey = "delay" | "project" | "code" | "stage" | "status" | "progress" | "value" | "created";
type SortDirection = "asc" | "desc";
type AuditFilter = "all" | "status" | "due-date" | "comments";

type KpiCard = {
  key: string;
  label: string;
  value: string;
  currentValue: number;
  previousValue: number | null;
  betterWhen: "up" | "down";
  formatDelta: (value: number) => string;
};

const DEPARTMENT_ORDER: Array<Department | "Completed workflow"> = [
  "Sales",
  "R&D",
  "Production",
  "Procurement",
  "QC",
  "Dispatch",
  "Admin",
  "Completed workflow",
];

const STATUS_ORDER = ["Overdue", "Active", "Completed", "Pending"] as const;

function getDefaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildKpiCards(report: MonthlyReport, previousReport: MonthlyReport | null): KpiCard[] {
  const previousOverview = previousReport?.overview ?? null;

  return [
    {
      key: "projects_in_scope",
      label: "Projects In Scope",
      value: String(report.overview.projects_in_scope),
      currentValue: report.overview.projects_in_scope,
      previousValue: previousOverview?.projects_in_scope ?? null,
      betterWhen: "up",
      formatDelta: (value) => `${Math.abs(value)}`,
    },
    {
      key: "projects_created",
      label: "Created This Month",
      value: String(report.overview.projects_created),
      currentValue: report.overview.projects_created,
      previousValue: previousOverview?.projects_created ?? null,
      betterWhen: "up",
      formatDelta: (value) => `${Math.abs(value)}`,
    },
    {
      key: "stages_completed",
      label: "Stages Completed",
      value: String(report.overview.stages_completed),
      currentValue: report.overview.stages_completed,
      previousValue: previousOverview?.stages_completed ?? null,
      betterWhen: "up",
      formatDelta: (value) => `${Math.abs(value)}`,
    },
    {
      key: "overdue_events",
      label: "Overdue Events",
      value: String(report.overview.overdue_events),
      currentValue: report.overview.overdue_events,
      previousValue: previousOverview?.overdue_events ?? null,
      betterWhen: "down",
      formatDelta: (value) => `${Math.abs(value)}`,
    },
    {
      key: "active_projects",
      label: "Active Projects",
      value: String(report.overview.active_projects),
      currentValue: report.overview.active_projects,
      previousValue: previousOverview?.active_projects ?? null,
      betterWhen: "up",
      formatDelta: (value) => `${Math.abs(value)}`,
    },
    {
      key: "overdue_projects",
      label: "Overdue Projects",
      value: String(report.overview.overdue_projects),
      currentValue: report.overview.overdue_projects,
      previousValue: previousOverview?.overdue_projects ?? null,
      betterWhen: "down",
      formatDelta: (value) => `${Math.abs(value)}`,
    },
    {
      key: "comments_logged",
      label: "Comments Logged",
      value: String(report.overview.comments_logged),
      currentValue: report.overview.comments_logged,
      previousValue: previousOverview?.comments_logged ?? null,
      betterWhen: "up",
      formatDelta: (value) => `${Math.abs(value)}`,
    },
    {
      key: "total_pipeline_value",
      label: "Pipeline Value",
      value: formatCurrency(report.overview.total_pipeline_value),
      currentValue: report.overview.total_pipeline_value,
      previousValue: previousOverview?.total_pipeline_value ?? null,
      betterWhen: "up",
      formatDelta: (value) => formatCurrency(Math.abs(value)),
    },
  ];
}

function getDeltaMeta(currentValue: number, previousValue: number | null, betterWhen: "up" | "down") {
  if (previousValue === null) {
    return {
      direction: "flat" as DeltaDirection,
      tone: "neutral" as DeltaTone,
      text: "No previous month",
    };
  }

  const diff = currentValue - previousValue;
  if (diff === 0) {
    return {
      direction: "flat" as DeltaDirection,
      tone: "neutral" as DeltaTone,
      text: "No change vs last month",
    };
  }

  const direction: DeltaDirection = diff > 0 ? "up" : "down";
  const tone: DeltaTone =
    betterWhen === "up" ? (diff > 0 ? "success" : "danger") : diff > 0 ? "danger" : "success";

  return {
    direction,
    tone,
    text: "",
  };
}

function getDepartmentMetricConfig(metric: DepartmentMetric) {
  if (metric === "avg_delay_days") {
    return {
      label: "Avg delay",
      toneClass: "bg-danger",
      value: (row: MonthlyDepartmentReportRow) => row.avg_delay_days ?? 0,
      format: (value: number) => `${value.toFixed(1)}d`,
      helper: "Sorted by longest average delay first.",
    };
  }

  if (metric === "overdue_now") {
    return {
      label: "Overdue now",
      toneClass: "bg-danger",
      value: (row: MonthlyDepartmentReportRow) => row.overdue_now,
      format: (value: number) => `${value}`,
      helper: "Sorted by current overdue load first.",
    };
  }

  return {
    label: "Completion rate",
    toneClass: "bg-accent",
    value: (row: MonthlyDepartmentReportRow) => row.completion_rate,
    format: (value: number) => formatPercent(value),
    helper: "Sorted by highest completion rate first.",
  };
}

function getProjectSortDefaultDirection(key: ProjectSortKey): SortDirection {
  return key === "code" || key === "project" || key === "stage" || key === "status" ? "asc" : "desc";
}

function getProjectStatusRank(project: MonthlyProjectReportRow) {
  const index = STATUS_ORDER.indexOf(project.status_label as (typeof STATUS_ORDER)[number]);
  return index === -1 ? STATUS_ORDER.length : index;
}

function getProjectDepartmentLabel(project: MonthlyProjectReportRow) {
  return project.current_stage_department ?? "Completed workflow";
}

function compareProjects(
  left: MonthlyProjectReportRow,
  right: MonthlyProjectReportRow,
  sort: { key: ProjectSortKey; direction: SortDirection }
) {
  const direction = sort.direction === "asc" ? 1 : -1;
  const compareStrings = (a: string, b: string) => a.localeCompare(b) * direction;
  const compareNumbers = (a: number, b: number) => (a - b) * direction;

  let result = 0;

  if (sort.key === "project") {
    result = compareStrings(left.project_name, right.project_name);
  } else if (sort.key === "code") {
    result = compareStrings(left.project_code, right.project_code);
  } else if (sort.key === "stage") {
    result = compareStrings(left.current_stage_name ?? "Completed workflow", right.current_stage_name ?? "Completed workflow");
  } else if (sort.key === "status") {
    result = compareNumbers(getProjectStatusRank(left), getProjectStatusRank(right));
  } else if (sort.key === "progress") {
    result = compareNumbers(left.completion_rate, right.completion_rate);
  } else if (sort.key === "value") {
    result = compareNumbers(left.total_order_value ?? -1, right.total_order_value ?? -1);
  } else if (sort.key === "created") {
    result = compareNumbers(new Date(left.created_at).getTime(), new Date(right.created_at).getTime());
  } else {
    result = compareNumbers(left.current_delay_days ?? -1, right.current_delay_days ?? -1);
  }

  if (result !== 0) {
    return result;
  }

  const leftUrgency = left.current_delay_days ?? -1;
  const rightUrgency = right.current_delay_days ?? -1;
  if (leftUrgency !== rightUrgency) {
    return rightUrgency - leftUrgency;
  }

  if (left.status_label !== right.status_label) {
    return getProjectStatusRank(left) - getProjectStatusRank(right);
  }

  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function classifyAuditEvent(event: MonthlyAuditEvent) {
  const normalized = event.event_type.toLowerCase();
  return {
    status: normalized.includes("status"),
    dueDate: normalized.includes("due date"),
    comments: normalized.includes("comment"),
  };
}

function buildTrendChartGeometry(trends: MonthlyReport["trends"]) {
  const width = 760;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 44, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...trends.flatMap((trend) => [trend.projects_created, trend.stages_completed, trend.overdue_events])
  );
  const stepX = trends.length > 1 ? innerWidth / (trends.length - 1) : innerWidth;

  const points = trends.map((trend, index) => {
    const x = padding.left + (trends.length === 1 ? innerWidth / 2 : stepX * index);
    const toY = (value: number) => padding.top + innerHeight - (value / maxValue) * innerHeight;

    return {
      ...trend,
      index,
      x,
      bars: {
        y: toY(trend.projects_created),
        height: (trend.projects_created / maxValue) * innerHeight,
      },
      completedY: toY(trend.stages_completed),
      overdueY: toY(trend.overdue_events),
    };
  });

  const buildPath = (selector: (point: (typeof points)[number]) => number) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${selector(point)}`)
      .join(" ");

  return {
    width,
    height,
    padding,
    innerHeight,
    maxValue,
    points,
    completedPath: buildPath((point) => point.completedY),
    overduePath: buildPath((point) => point.overdueY),
  };
}

function DeltaArrow({ direction, tone }: { direction: DeltaDirection; tone: DeltaTone }) {
  const className =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink/45";

  if (direction === "flat") {
    return <span className={cn("inline-block h-2 w-2 rounded-full bg-current", className)} aria-hidden="true" />;
  }

  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("h-3 w-3 shrink-0", className, direction === "down" && "rotate-180")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M6 10V2" />
      <path d="m2.5 5.5 3.5-3.5 3.5 3.5" />
    </svg>
  );
}

function ChartLegendSwatch({ className }: { className: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", className)} aria-hidden="true" />;
}

function SortCaret({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("h-3 w-3 transition", active ? "text-accent" : "text-ink/25", direction === "desc" && "rotate-180")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M6 9V3" />
      <path d="m3.5 5.5 2.5-2.5 2.5 2.5" />
    </svg>
  );
}

function GroupChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn("h-4 w-4 transition", collapsed ? "-rotate-90" : "rotate-0")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m2.5 4.5 3.5 3 3.5-3" />
    </svg>
  );
}

function SummaryCard({ card }: { card: KpiCard }) {
  const delta = getDeltaMeta(card.currentValue, card.previousValue, card.betterWhen);
  const diff = card.previousValue === null ? 0 : card.currentValue - card.previousValue;
  const deltaText =
    card.previousValue === null
      ? delta.text
      : diff === 0
        ? delta.text
        : `${card.formatDelta(diff)} vs last month`;

  const toneClass =
    delta.tone === "success" ? "text-success" : delta.tone === "danger" ? "text-danger" : "text-ink/45";

  return (
    <article className="rounded-[28px] border border-border bg-white p-5 shadow-panel">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">{card.label}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold text-ink">{card.value}</p>
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", toneClass)}>
          <DeltaArrow direction={delta.direction} tone={delta.tone} />
          {deltaText}
        </span>
      </div>
    </article>
  );
}

function TrendCompositeChart({ report }: { report: MonthlyReport }) {
  const geometry = buildTrendChartGeometry(report.trends);
  const [activeIndex, setActiveIndex] = useState(report.trends.length ? report.trends.length - 1 : 0);
  const activePoint = geometry.points[activeIndex] ?? null;
  const tooltipAlignment =
    activePoint && activePoint.index === 0
      ? "left-4 translate-x-0"
      : activePoint && activePoint.index === geometry.points.length - 1
        ? "right-4 translate-x-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <div className="rounded-[28px] border border-border bg-surface-muted/25 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Trend Watch</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">{formatMonthLabel(report.month)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-ink/55">
          <span className="inline-flex items-center gap-2">
            <ChartLegendSwatch className="bg-accent" />
            Stages completed
          </span>
          <span className="inline-flex items-center gap-2">
            <ChartLegendSwatch className="bg-danger" />
            Overdue events
          </span>
          <span className="inline-flex items-center gap-2">
            <ChartLegendSwatch className="bg-ink/25" />
            Projects created
          </span>
        </div>
      </div>

      <div className="relative mt-6 rounded-[24px] border border-border bg-white px-3 py-4">
        {activePoint ? (
          <div className={cn("pointer-events-none absolute top-4 z-10 w-64", tooltipAlignment)}>
            <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-panel">
              <p className="text-sm font-semibold text-ink">{activePoint.label}</p>
              <p className="mt-1 text-xs text-ink/45">
                {formatDate(activePoint.period_start)} to {formatDate(activePoint.period_end)}
              </p>
              <div className="mt-3 grid gap-2 text-sm text-ink/70">
                <div className="flex items-center justify-between gap-3">
                  <span>Projects created</span>
                  <span className="font-semibold text-ink">{activePoint.projects_created}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Stages completed</span>
                  <span className="font-semibold text-ink">{activePoint.stages_completed}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Overdue events</span>
                  <span className="font-semibold text-ink">{activePoint.overdue_events}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Comments logged</span>
                  <span className="font-semibold text-ink">{activePoint.comments_logged}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="h-[20rem] w-full" role="img" aria-label="Monthly trend chart">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => {
            const y = geometry.padding.top + geometry.innerHeight - geometry.innerHeight * step;
            const label = Math.round(geometry.maxValue * step);
            return (
              <g key={step}>
                <line
                  x1={geometry.padding.left}
                  x2={geometry.width - geometry.padding.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(24,24,27,0.08)"
                  strokeWidth="1"
                />
                <text x={12} y={y + 4} fontSize="11" fill="rgba(24,24,27,0.55)">
                  {label}
                </text>
              </g>
            );
          })}

          {geometry.points.map((point) => (
            <g key={point.label}>
              <rect
                x={point.x - 22}
                y={point.bars.y}
                width={44}
                height={point.bars.height}
                rx={12}
                fill="rgba(24,24,27,0.18)"
              />
            </g>
          ))}

          <path d={geometry.completedPath} fill="none" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" />
          <path d={geometry.overduePath} fill="none" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" />

          {geometry.points.map((point) => (
            <g key={`${point.label}-markers`}>
              <circle cx={point.x} cy={point.completedY} r={5} fill="#2563EB" />
              <circle cx={point.x} cy={point.overdueY} r={5} fill="#DC2626" />
              <rect
                x={point.x - 34}
                y={geometry.padding.top}
                width={68}
                height={geometry.innerHeight}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(point.index)}
                onFocus={() => setActiveIndex(point.index)}
              />
              <text
                x={point.x}
                y={geometry.height - 12}
                textAnchor="middle"
                fontSize="11"
                fill="rgba(24,24,27,0.55)"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function SnapshotSummary({ report }: { report: MonthlyReport }) {
  return (
    <div className="rounded-[28px] border border-border bg-white p-5 shadow-panel">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Current Snapshot</p>
      <h2 className="mt-1 text-2xl font-semibold text-ink">This month at a glance</h2>
      <p className="mt-4 text-sm leading-7 text-ink/65">
        {report.overview.projects_in_scope} projects touched this month. {report.overview.completed_projects} are
        completed, {report.overview.overdue_projects} are overdue now, and {report.overview.comments_logged} stage
        comments were logged.
      </p>
      <p className="mt-3 text-sm leading-7 text-ink/65">
        {report.overview.stages_completed} stages were completed this month, with a current pipeline value of{" "}
        <span className="font-semibold text-ink">{formatCurrency(report.overview.total_pipeline_value)}</span>. Report
        generated {formatDateTime(report.generated_at)}.
      </p>
    </div>
  );
}

function DepartmentComparison({
  rows,
  metric,
  onMetricChange,
}: {
  rows: MonthlyDepartmentReportRow[];
  metric: DepartmentMetric;
  onMetricChange: (metric: DepartmentMetric) => void;
}) {
  const metricConfig = getDepartmentMetricConfig(metric);
  const sortedRows = [...rows].sort((left, right) => metricConfig.value(right) - metricConfig.value(left));
  const maxValue = Math.max(1, ...sortedRows.map((row) => metricConfig.value(row)));

  return (
    <div className="space-y-5 border-b border-border px-5 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Department Summary</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">Department pulse</h2>
          <p className="mt-2 text-sm text-ink/55">{metricConfig.helper}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "completion_rate" as DepartmentMetric, label: "Completion rate" },
            { key: "avg_delay_days" as DepartmentMetric, label: "Avg delay" },
            { key: "overdue_now" as DepartmentMetric, label: "Overdue now" },
          ].map((option) => {
            const active = metric === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onMetricChange(option.key)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-accent text-white"
                    : "border border-border bg-surface-muted/45 text-ink hover:border-accent hover:bg-white"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-[24px] border border-border bg-surface-muted/25 p-4">
        {sortedRows.length ? (
          sortedRows.map((row) => {
            const value = metricConfig.value(row);
            const width = value <= 0 ? "0%" : `${Math.max(10, (value / maxValue) * 100)}%`;
            return (
              <div key={row.department} className="grid gap-2 md:grid-cols-[11rem_1fr_auto] md:items-center">
                <div className="text-sm font-semibold text-ink">{row.department}</div>
                <div className="h-3 rounded-full bg-surface-muted">
                  <div className={cn("h-full rounded-full", metricConfig.toneClass)} style={{ width }} />
                </div>
                <div className="text-sm font-semibold text-ink">{metricConfig.format(value)}</div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-ink/45">No department activity matched this month.</p>
        )}
      </div>
    </div>
  );
}

function DepartmentTable({ rows, metric }: { rows: MonthlyDepartmentReportRow[]; metric: DepartmentMetric }) {
  const metricConfig = getDepartmentMetricConfig(metric);
  const sortedRows = [...rows].sort((left, right) => metricConfig.value(right) - metricConfig.value(left));

  return (
    <div className="overflow-auto">
      <table className="min-w-full divide-y divide-ink/10">
        <thead className="bg-surface-muted/60">
          <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Department</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Total stages</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Completed</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Completed in month</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Active now</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Overdue now</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Pending now</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Completion rate</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Avg completion</th>
            <th className="sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur">Avg delay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {sortedRows.length ? (
            sortedRows.map((row) => (
              <tr key={row.department} className="text-sm text-ink/75 transition hover:bg-surface-muted/30">
                <td className="px-5 py-4 font-semibold text-ink">{row.department}</td>
                <td className="px-5 py-4">{row.total_stages}</td>
                <td className="px-5 py-4">{row.completed_total}</td>
                <td className="px-5 py-4">{row.completed_this_month}</td>
                <td className="px-5 py-4">{row.active_now}</td>
                <td className={cn("px-5 py-4", metric === "overdue_now" && row.overdue_now ? "font-semibold text-ink" : "")}>
                  {row.overdue_now}
                </td>
                <td className="px-5 py-4">{row.pending_now}</td>
                <td className={cn("px-5 py-4", metric === "completion_rate" ? "font-semibold text-ink" : "")}>
                  {formatPercent(row.completion_rate)}
                </td>
                <td className="px-5 py-4">{row.avg_completion_days !== null ? `${row.avg_completion_days}d` : "--"}</td>
                <td className={cn("px-5 py-4", metric === "avg_delay_days" ? "font-semibold text-ink" : "")}>
                  {row.avg_delay_days !== null ? `${row.avg_delay_days}d` : "--"}
                </td>
              </tr>
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
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: ProjectSortKey;
  activeSort: { key: ProjectSortKey; direction: SortDirection };
  onClick: (sortKey: ProjectSortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = activeSort.key === sortKey;

  return (
    <th className={cn("sticky top-0 bg-surface-muted/95 px-5 py-4 backdrop-blur", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-2 transition",
          align === "right" && "ml-auto",
          isActive ? "text-accent" : "text-ink/60 hover:text-ink"
        )}
      >
        {label}
        <SortCaret active={isActive} direction={activeSort.direction} />
      </button>
    </th>
  );
}

function ProjectGroupRow({
  label,
  count,
  overdueCount,
  collapsed,
  onToggle,
  colSpan,
}: {
  label: string;
  count: number;
  overdueCount: number;
  collapsed: boolean;
  onToggle: () => void;
  colSpan: number;
}) {
  return (
    <tr className="bg-surface-muted/45">
      <td colSpan={colSpan} className="px-5 py-3">
        <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
          <span className="inline-flex items-center gap-3">
            <GroupChevron collapsed={collapsed} />
            <span className="text-sm font-semibold text-ink">{label}</span>
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">
            {count} projects{overdueCount ? ` - ${overdueCount} overdue` : ""}
          </span>
        </button>
      </td>
    </tr>
  );
}

function ProjectRow({ project }: { project: MonthlyProjectReportRow }) {
  const statusTone =
    project.status_label === "Overdue"
      ? "bg-danger/10 text-danger"
      : project.status_label === "Completed"
        ? "bg-success/10 text-success"
        : "bg-surface-muted text-ink";

  return (
    <tr className="text-sm text-ink/75 transition hover:bg-surface-muted/30">
      <td className="px-5 py-4 font-semibold text-ink">{project.project_code}</td>
      <td className="px-5 py-4">
        <Link href={`/dashboard?project=${project.project_id}`} className="font-medium text-accent hover:text-ink">
          {project.project_name}
        </Link>
        <div className="mt-1 text-xs text-ink/45">{project.client}</div>
        <div className="mt-1 text-xs text-ink/45">Owner: {project.assigned_person_name ?? "Unassigned"}</div>
      </td>
      <td className="px-5 py-4">
        <div>{project.current_stage_name ?? "Completed workflow"}</div>
        <div className="mt-1 text-xs text-ink/45">
          {project.current_stage_department ?? "No active owner"}
          {project.current_stage_due_date ? ` - Due ${formatDate(project.current_stage_due_date)}` : ""}
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
          {formatPercent(project.completion_rate)} complete - {project.completed_this_month} done this month
        </div>
      </td>
      <td className="px-5 py-4">
        {project.current_delay_days !== null ? (
          <span className="font-semibold text-ink">{project.current_delay_days}d late</span>
        ) : (
          <span className="text-ink/45">On track</span>
        )}
      </td>
      <td className="px-5 py-4 text-right font-semibold text-ink">{formatCurrency(project.total_order_value)}</td>
      <td className="px-5 py-4 text-ink/55">{formatDate(project.created_at)}</td>
    </tr>
  );
}

function FragmentGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function ProjectTable({ projects }: { projects: MonthlyProjectReportRow[] }) {
  const [groupBy, setGroupBy] = useState<ProjectGroupBy>("none");
  const [sort, setSort] = useState<{ key: ProjectSortKey; direction: SortDirection }>({
    key: "delay",
    direction: "desc",
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const handleSortChange = (key: ProjectSortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: getProjectSortDefaultDirection(key) }
    );
  };

  const sortedProjects = [...projects].sort((left, right) => compareProjects(left, right, sort));

  const groups =
    groupBy === "none"
      ? [{ key: "all", label: "All projects", projects: sortedProjects }]
      : (() => {
          const map = new Map<string, MonthlyProjectReportRow[]>();
          sortedProjects.forEach((project) => {
            const label = groupBy === "department" ? getProjectDepartmentLabel(project) : project.status_label;
            map.set(label, [...(map.get(label) ?? []), project]);
          });

          const order =
            groupBy === "department"
              ? DEPARTMENT_ORDER.filter((label) => map.has(label))
              : STATUS_ORDER.filter((label) => map.has(label));

          return order.map((label) => ({
            key: label,
            label,
            projects: map.get(label) ?? [],
          }));
        })();

  return (
    <section className="rounded-[32px] border border-border bg-white shadow-panel">
      <div className="space-y-4 border-b border-border px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Project Summary</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Projects touched in this reporting window</h2>
            <p className="mt-2 text-sm text-ink/55">
              Sorted by most overdue first by default. Click any sortable column to change the order.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: "none" as ProjectGroupBy, label: "No grouping" },
              { key: "department" as ProjectGroupBy, label: "Group by department" },
              { key: "status" as ProjectGroupBy, label: "Group by status" },
            ].map((option) => {
              const active = groupBy === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setGroupBy(option.key)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "bg-accent text-white"
                      : "border border-border bg-surface-muted/45 text-ink hover:border-accent hover:bg-white"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-h-[42rem] overflow-auto">
        <table className="min-w-full divide-y divide-ink/10">
          <thead className="bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-[0.18em]">
            <tr>
              <SortableHeader label="Code" sortKey="code" activeSort={sort} onClick={handleSortChange} />
              <SortableHeader label="Project" sortKey="project" activeSort={sort} onClick={handleSortChange} />
              <SortableHeader label="Current stage" sortKey="stage" activeSort={sort} onClick={handleSortChange} />
              <SortableHeader label="Status" sortKey="status" activeSort={sort} onClick={handleSortChange} />
              <SortableHeader label="Progress" sortKey="progress" activeSort={sort} onClick={handleSortChange} />
              <SortableHeader label="Delay" sortKey="delay" activeSort={sort} onClick={handleSortChange} />
              <SortableHeader label="Value" sortKey="value" activeSort={sort} onClick={handleSortChange} align="right" />
              <SortableHeader label="Created" sortKey="created" activeSort={sort} onClick={handleSortChange} />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {sortedProjects.length ? (
              groups.map((group) => {
                const collapsed = Boolean(collapsedGroups[group.key]);
                return (
                  <FragmentGroup key={group.key}>
                    {groupBy !== "none" ? (
                      <ProjectGroupRow
                        label={group.label}
                        count={group.projects.length}
                        overdueCount={group.projects.filter((project) => project.status_label === "Overdue").length}
                        collapsed={collapsed}
                        onToggle={() =>
                          setCollapsedGroups((current) => ({
                            ...current,
                            [group.key]: !current[group.key],
                          }))
                        }
                        colSpan={8}
                      />
                    ) : null}

                    {!collapsed ? group.projects.map((project) => <ProjectRow key={project.project_id} project={project} />) : null}
                  </FragmentGroup>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-sm text-ink/45">
                  No project activity matched this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditEventCard({ event }: { event: MonthlyAuditEvent }) {
  return (
    <article className="rounded-[28px] border border-border bg-surface-muted/35 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
              {event.event_type}
            </span>
            <Link href={`/dashboard?project=${event.project_id}`} className="text-sm font-semibold text-accent hover:text-ink">
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

function AuditFeed({ events }: { events: MonthlyAuditEvent[] }) {
  const [filter, setFilter] = useState<AuditFilter>("all");

  const filteredEvents = events.filter((event) => {
    const classification = classifyAuditEvent(event);
    if (filter === "status") {
      return classification.status;
    }
    if (filter === "due-date") {
      return classification.dueDate;
    }
    if (filter === "comments") {
      return classification.comments;
    }
    return true;
  });

  const counts = {
    all: events.length,
    status: events.filter((event) => classifyAuditEvent(event).status).length,
    "due-date": events.filter((event) => classifyAuditEvent(event).dueDate).length,
    comments: events.filter((event) => classifyAuditEvent(event).comments).length,
  };

  return (
    <section className="rounded-[32px] border border-border bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Audit Feed</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">Recent stage and comment activity</h2>
          <p className="mt-2 text-sm text-ink/55">Filter the month&apos;s evidence trail without leaving the page.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: "all" as AuditFilter, label: "All" },
            { key: "status" as AuditFilter, label: "Status" },
            { key: "due-date" as AuditFilter, label: "Due date" },
            { key: "comments" as AuditFilter, label: "Comments" },
          ].map((option) => {
            const active = filter === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFilter(option.key)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-accent text-white"
                    : "border border-border bg-surface-muted/45 text-ink hover:border-accent hover:bg-white"
                )}
              >
                {option.label} {counts[option.key]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {filteredEvents.length ? (
          filteredEvents.map((event) => <AuditEventCard key={event.event_id} event={event} />)
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-ink/45">
            No audit activity matched this filter.
          </p>
        )}
      </div>
    </section>
  );
}

export function ReportsWorkspace({
  department,
  report,
  previousReport,
}: {
  department: Department;
  report: MonthlyReport;
  previousReport: MonthlyReport | null;
}) {
  const [departmentMetric, setDepartmentMetric] = useState<DepartmentMetric>("completion_rate");
  const kpiCards = buildKpiCards(report, previousReport);

  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="text-sm font-medium text-accent hover:text-ink">
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
                Review movement, overdue risk, department load, and the supporting audit trail for the selected month
                without reading every row by hand.
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
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
              >
                Apply
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <MonthlyReportExportButton month={report.month} />
              <Link
                href={`/reports?month=${getDefaultMonth()}`}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-accent hover:bg-accent/20"
              >
                Jump to current month
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <SummaryCard key={card.key} card={card} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.7fr]">
        <TrendCompositeChart report={report} />
        <SnapshotSummary report={report} />
      </section>

      <section className="rounded-[32px] border border-border bg-white shadow-panel">
        <DepartmentComparison rows={report.departments} metric={departmentMetric} onMetricChange={setDepartmentMetric} />
        <DepartmentTable rows={report.departments} metric={departmentMetric} />
      </section>

      <ProjectTable projects={report.projects} />

      <AuditFeed events={report.audit_events} />
    </div>
  );
}
