"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { StatusChip } from "@/components/StatusChip";
import type { Department, ProjectSummary, StageStatus } from "@/lib/types";
import { formatDate, formatPendingDuration } from "@/lib/utils";

type ProjectStatusFilter = "all" | "active" | "overdue" | "done";

const DEFAULT_ROWS_PER_PAGE = 8;
const MIN_ROWS_PER_PAGE = 4;
const MAX_ROWS_PER_PAGE = 20;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPaginationItems(totalPages: number, currentPage: number): Array<number | "ellipsis"> {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const items: Array<number | "ellipsis"> = [];
  sortedPages.forEach((page, index) => {
    const previousPage = sortedPages[index - 1];
    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

function getProjectStatus(project: ProjectSummary): Exclude<ProjectStatusFilter, "all"> {
  if (project.current_stage?.status === "overdue") {
    return "overdue";
  }

  if (project.current_stage) {
    return "active";
  }

  return "done";
}

function getDepartment(project: ProjectSummary): Department | null {
  return project.current_stage?.responsible_dept ?? null;
}

function getEta(project: ProjectSummary): {
  label: string;
  tone: string;
} {
  if (!project.current_stage) {
    return {
      label: "--",
      tone: "text-ink/35"
    };
  }

  if (!project.current_stage.due_date) {
    return {
      label: "Not set",
      tone: "text-ink/45"
    };
  }

  const dueDate = new Date(project.current_stage.due_date);
  dueDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isLate = project.current_stage.status === "overdue" || diffDays < 0;

  if (isLate) {
    return {
      label: `${Math.abs(diffDays)}d late`,
      tone: "text-ember"
    };
  }

  if (diffDays === 0) {
    return {
      label: "Due today",
      tone: "text-gold"
    };
  }

  return {
    label: `${diffDays}d left`,
    tone: "text-pine"
  };
}

function getRowStatus(project: ProjectSummary): StageStatus {
  return project.current_stage?.status ?? "done";
}

export function ProjectTable({ projects }: { projects: ProjectSummary[] }) {
  const [clientFilter, setClientFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [currentPage, setCurrentPage] = useState(1);

  const clients = Array.from(new Set(projects.map((project) => project.client))).sort((a, b) =>
    a.localeCompare(b)
  );
  const brands = Array.from(
    new Set(
      projects
        .map((project) => project.brand)
        .filter((brand): brand is string => Boolean(brand))
    )
  ).sort((a, b) => a.localeCompare(b));
  const departments = Array.from(
    new Set(
      projects
        .map((project) => getDepartment(project))
        .filter((department): department is Department => Boolean(department))
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredProjects = projects.filter((project) => {
    const projectStatus = getProjectStatus(project);
    const currentDepartment = getDepartment(project);

    if (clientFilter !== "all" && project.client !== clientFilter) {
      return false;
    }

    if (brandFilter !== "all" && project.brand !== brandFilter) {
      return false;
    }

    if (statusFilter !== "all" && projectStatus !== statusFilter) {
      return false;
    }

    if (departmentFilter !== "all" && currentDepartment !== departmentFilter) {
      return false;
    }

    if (delayedOnly && project.current_stage?.status !== "overdue") {
      return false;
    }

    return true;
  });

  const hasActiveFilters =
    clientFilter !== "all" ||
    brandFilter !== "all" ||
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    delayedOnly;

  const sliderMin = projects.length ? Math.min(MIN_ROWS_PER_PAGE, projects.length) : 1;
  const sliderMax = projects.length
    ? Math.max(sliderMin, Math.min(MAX_ROWS_PER_PAGE, projects.length))
    : sliderMin;

  useEffect(() => {
    setRowsPerPage((value) => clamp(value, sliderMin, sliderMax));
  }, [sliderMax, sliderMin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [brandFilter, clientFilter, delayedOnly, departmentFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / rowsPerPage));

  useEffect(() => {
    setCurrentPage((page) => clamp(page, 1, totalPages));
  }, [totalPages]);

  const safeCurrentPage = clamp(currentPage, 1, totalPages);
  const pageStart = filteredProjects.length ? (safeCurrentPage - 1) * rowsPerPage : 0;
  const pageEnd = Math.min(pageStart + rowsPerPage, filteredProjects.length);
  const visibleProjects = filteredProjects.slice(pageStart, pageEnd);
  const paginationItems = buildPaginationItems(totalPages, safeCurrentPage);
  const visibleStartLabel = filteredProjects.length ? pageStart + 1 : 0;
  const visibleEndLabel = filteredProjects.length ? pageEnd : 0;

  return (
    <div className="overflow-hidden rounded-[32px] border border-ink/10 bg-white shadow-panel">
      <div className="space-y-4 border-b border-ink/10 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Project Monitor</h2>
            <p className="text-sm text-ink/55">
              Showing {visibleStartLabel}-{visibleEndLabel} of {filteredProjects.length}{" "}
              {hasActiveFilters ? "matching " : ""}
              projects
            </p>
          </div>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => {
                setClientFilter("all");
                setBrandFilter("all");
                setStatusFilter("all");
                setDepartmentFilter("all");
                setDelayedOnly(false);
              }}
              className="rounded-full border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <FilterField label="Client">
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
            >
              <option value="all">All clients</option>
              {clients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Brand">
            <select
              value={brandFilter}
              onChange={(event) => setBrandFilter(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
            >
              <option value="all">All brands</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Project status">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ProjectStatusFilter)}
              className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="done">Completed</option>
            </select>
          </FilterField>

          <FilterField label="Department">
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
            >
              <option value="all">All departments</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </FilterField>

          <label className="flex items-center justify-between rounded-2xl border border-ink/10 bg-sand/50 px-4 py-2.5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                Delayed stages
              </div>
              <div className="text-sm text-ink/70">Show overdue only</div>
            </div>
            <input
              type="checkbox"
              checked={delayedOnly}
              onChange={(event) => setDelayedOnly(event.target.checked)}
              className="h-4 w-4 accent-ember"
            />
          </label>
        </div>
      </div>

      <div className="max-h-[34rem] overflow-auto">
        <table className="min-w-full divide-y divide-ink/10">
          <thead className="bg-sand/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Code</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Project</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Client</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Department</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Current stage</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Status</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">ETA</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Pending</th>
              <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {visibleProjects.length ? (
              visibleProjects.map((project) => {
                const eta = getEta(project);

                return (
                <tr key={project.id} className="text-sm text-ink/75">
                  <td className="px-5 py-4 font-semibold text-ink">{project.project_code}</td>
                  <td className="px-5 py-4">
                    <Link className="font-medium text-pine hover:text-ink" href={`/projects/${project.id}`}>
                      {project.name}
                    </Link>
                    <div className="text-xs text-ink/45">{project.brand ?? "No brand set"}</div>
                  </td>
                  <td className="px-5 py-4">{project.client}</td>
                  <td className="px-5 py-4">{project.current_stage?.responsible_dept ?? "Completed"}</td>
                  <td className="px-5 py-4">
                    {project.current_stage ? (
                      <div className="space-y-1">
                        <div>{project.current_stage.name}</div>
                        <div className="text-xs text-ink/45">Due {formatDate(project.current_stage.due_date)}</div>
                      </div>
                    ) : (
                      <span className="text-ink/45">Completed workflow</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <StatusChip status={getRowStatus(project)} />
                  </td>
                  <td className={`px-5 py-4 text-sm font-semibold ${eta.tone}`}>{eta.label}</td>
                  <td className="px-5 py-4">
                    {project.current_stage
                      ? formatPendingDuration(project.current_stage.activated_at)
                      : "Completed"}
                  </td>
                  <td className="px-5 py-4">{formatDate(project.created_at)}</td>
                </tr>
              )})
            ) : (
              <tr>
                <td className="px-5 py-8 text-sm text-ink/45" colSpan={9}>
                  {projects.length
                    ? "No projects match the current filter combination."
                    : "No projects available yet. Create the first one from Sales to start the tracker."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 border-t border-ink/10 bg-white/90 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Rows per page</div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink/35">{sliderMin}</span>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={1}
              value={rowsPerPage}
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
              disabled={sliderMin === sliderMax}
              className="h-2 w-full cursor-pointer accent-pine md:w-48"
              aria-label="Rows per page"
            />
            <span className="text-xs text-ink/35">{sliderMax}</span>
            <span className="min-w-12 rounded-full border border-ink/10 bg-sand/60 px-3 py-1 text-center text-sm font-semibold text-ink">
              {rowsPerPage}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <p className="text-sm text-ink/55">
            Page {safeCurrentPage} of {totalPages}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => clamp(page - 1, 1, totalPages))}
              disabled={safeCurrentPage === 1}
              className="rounded-full border border-ink/10 px-3 py-2 text-sm font-medium text-ink transition hover:border-ink hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>

            {paginationItems.map((item, index) =>
              item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="px-1 text-sm text-ink/35">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrentPage(item)}
                  className={`min-w-10 rounded-full px-3 py-2 text-sm font-semibold transition ${
                    safeCurrentPage === item
                      ? "bg-ink text-white"
                      : "border border-ink/10 text-ink hover:border-ink hover:bg-sand/70"
                  }`}
                >
                  {item}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setCurrentPage((page) => clamp(page + 1, 1, totalPages))}
              disabled={safeCurrentPage === totalPages}
              className="rounded-full border border-ink/10 px-3 py-2 text-sm font-medium text-ink transition hover:border-ink hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</span>
      {children}
    </label>
  );
}
