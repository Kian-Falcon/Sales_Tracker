"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { StatusChip } from "@/components/StatusChip";
import { deleteProject as deleteProjectRequest } from "@/lib/api";
import type { Department, ProjectSummary, StageStatus } from "@/lib/types";
import { formatCurrency, formatDate, formatPendingDuration, formatPriority } from "@/lib/utils";

type ProjectStatusFilter = "all" | "active" | "overdue" | "done";

type ProjectTableProps = {
  projects: ProjectSummary[];
  canDeleteProjects?: boolean;
};

const DEFAULT_ROWS_PER_PAGE = 8;
const MIN_ROWS_PER_PAGE = 4;
const MAX_ROWS_PER_PAGE = 20;

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M4.5 7.5h15" />
      <path d="M9.5 7.5V5.75A1.75 1.75 0 0 1 11.25 4h1.5A1.75 1.75 0 0 1 14.5 5.75V7.5" />
      <path d="M7.5 7.5v10A2.5 2.5 0 0 0 10 20h4a2.5 2.5 0 0 0 2.5-2.5v-10" />
      <path d="M10 11.5v4.5" />
      <path d="M14 11.5v4.5" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M12 8.5v4.75" />
      <path d="M12 17h.01" />
      <path d="M10.02 4.86 3.9 15.46A2 2 0 0 0 5.63 18.5h12.74a2 2 0 0 0 1.73-3.04L13.98 4.86a2.29 2.29 0 0 0-3.96 0Z" />
    </svg>
  );
}

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

function getRowTone(project: ProjectSummary): {
  rowClassName: string;
  accentClassName: string;
} {
  if (!project.current_stage || !project.current_stage.due_date) {
    return {
      rowClassName: "bg-blue-50/35 hover:bg-blue-50/55",
      accentClassName: "border-l-4 border-l-blue-400"
    };
  }

  const dueDate = new Date(project.current_stage.due_date);
  dueDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = project.current_stage.status === "overdue" || diffDays < 0;

  if (isOverdue) {
    return {
      rowClassName: "bg-rose-50/65 hover:bg-rose-50",
      accentClassName: "border-l-4 border-l-ember"
    };
  }

  if (diffDays <= 2) {
    return {
      rowClassName: "bg-amber-50/70 hover:bg-amber-50",
      accentClassName: "border-l-4 border-l-gold"
    };
  }

  return {
    rowClassName: "bg-blue-50/35 hover:bg-blue-50/55",
    accentClassName: "border-l-4 border-l-blue-400"
  };
}

export function ProjectTable({ projects, canDeleteProjects = false }: ProjectTableProps) {
  const router = useRouter();
  const [projectRows, setProjectRows] = useState(projects);
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    setProjectRows(projects);
  }, [projects]);

  useEffect(() => {
    if (!deleteTarget) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletePending) {
        setDeleteTarget(null);
        setDeleteError(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletePending, deleteTarget]);

  const clients = Array.from(new Set(projectRows.map((project) => project.client))).sort((a, b) =>
    a.localeCompare(b)
  );
  const departments = Array.from(
    new Set(
      projectRows
        .map((project) => getDepartment(project))
        .filter((department): department is Department => Boolean(department))
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredProjects = projectRows.filter((project) => {
    const projectStatus = getProjectStatus(project);
    const currentDepartment = getDepartment(project);

    if (clientFilter !== "all" && project.client !== clientFilter) {
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
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    delayedOnly;

  const sliderMin = projectRows.length ? Math.min(MIN_ROWS_PER_PAGE, projectRows.length) : 1;
  const sliderMax = projectRows.length
    ? Math.max(sliderMin, Math.min(MAX_ROWS_PER_PAGE, projectRows.length))
    : sliderMin;

  useEffect(() => {
    setRowsPerPage((value) => clamp(value, sliderMin, sliderMax));
  }, [sliderMax, sliderMin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [clientFilter, delayedOnly, departmentFilter, statusFilter]);

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
  const emptyStateColSpan = canDeleteProjects ? 8 : 7;

  const handleDeleteProject = async () => {
    if (!deleteTarget) {
      return;
    }

    const projectToDelete = deleteTarget;
    setDeletePending(true);
    setDeleteError(null);

    try {
      await deleteProjectRequest(projectToDelete.id);
      setProjectRows((current) => current.filter((project) => project.id !== projectToDelete.id));
      setDeleteTarget(null);
      setActionNotice(`${projectToDelete.project_code} was deleted from the tracker.`);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete this project right now.");
    } finally {
      setDeletePending(false);
    }
  };

  const closeDeleteDialog = () => {
    if (deletePending) {
      return;
    }

    setDeleteTarget(null);
    setDeleteError(null);
  };

  return (
    <>
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

          {actionNotice ? (
            <p className="rounded-2xl border border-pine/15 bg-pine/10 px-4 py-3 text-sm text-pine">
              {actionNotice}
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Project / Client</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Department</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Current stage</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Progress / ETA</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Pending</th>
                <th className="sticky top-0 bg-sand/95 px-5 py-4 backdrop-blur">Created</th>
                {canDeleteProjects ? (
                  <th className="sticky top-0 bg-sand/95 px-5 py-4 text-right backdrop-blur">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {visibleProjects.length ? (
                visibleProjects.map((project) => {
                  const eta = getEta(project);
                  const rowTone = getRowTone(project);
                  const pendingLabel = project.current_stage
                    ? formatPendingDuration(project.current_stage.activated_at)
                    : "Completed";
                  const assignedDepartment = project.current_stage?.responsible_dept ?? "Completed";
                  const assignedPerson = project.assigned_person_name ?? "Unassigned";

                  return (
                    <tr
                      key={project.id}
                      className={`text-sm text-ink/75 transition-colors ${rowTone.rowClassName}`}
                    >
                      <td className={`px-5 py-4 font-semibold text-ink ${rowTone.accentClassName}`}>
                        {project.project_code}
                      </td>
                      <td className="px-5 py-4">
                        <Link className="font-medium text-pine hover:text-ink" href={`/projects/${project.id}`}>
                          {project.name}
                        </Link>
                        <div className="mt-1 text-xs text-ink/55">{project.client}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-[0.12em] ${
                              project.priority === "accelerated"
                                ? "bg-ember/10 text-ember"
                                : "bg-pine/10 text-pine"
                            }`}
                          >
                            {formatPriority(project.priority)}
                          </span>
                        </div>
                      </td>
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
                        <div className="space-y-2">
                          <StatusChip status={getRowStatus(project)} />
                          <div className={`text-sm font-semibold ${eta.tone}`}>{eta.label}</div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1.5">
                          {pendingLabel ? <div className="font-semibold text-ink">{pendingLabel}</div> : null}
                          <div className="text-xs text-ink/55">Assigned team: {assignedDepartment}</div>
                          <div className="text-xs text-ink/55">Assigned person: {assignedPerson}</div>
                          <div className="text-xs text-ink/55">
                            Total order value: {formatCurrency(project.total_order_value)}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">{formatDate(project.created_at)}</td>
                      {canDeleteProjects ? (
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(project);
                              setDeleteError(null);
                              setActionNotice(null);
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ember/20 bg-white/75 text-ember transition hover:border-ember hover:bg-ember hover:text-white"
                            aria-label={`Delete ${project.project_code}`}
                            title={`Delete ${project.project_code}`}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-5 py-8 text-sm text-ink/45" colSpan={emptyStateColSpan}>
                    {projectRows.length
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

      <DeleteProjectDialog
        project={deleteTarget}
        open={Boolean(deleteTarget)}
        pending={deletePending}
        error={deleteError}
        onClose={closeDeleteDialog}
        onConfirm={handleDeleteProject}
      />
    </>
  );
}

function DeleteProjectDialog({
  project,
  open,
  pending,
  error,
  onClose,
  onConfirm
}: {
  project: ProjectSummary | null;
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !project) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Close delete dialog"
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-[32px] border border-white/10 bg-[#171515] text-white shadow-2xl">
        <div className="border-b border-white/10 bg-gradient-to-r from-ember/20 via-white/5 to-transparent px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ember/15 text-ember">
              <WarningIcon className="h-6 w-6" />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Destructive action
              </p>
              <h3 className="text-2xl font-semibold text-white">Delete this project permanently?</h3>
              <p className="text-sm leading-6 text-white/65">
                This will remove <span className="font-semibold text-white">{project.project_code}</span> from the
                dashboard for every team.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-2">
            <ProjectInfoTile label="Project" value={project.name} />
            <ProjectInfoTile label="Code" value={project.project_code} />
            <ProjectInfoTile label="Client" value={project.client} />
            <ProjectInfoTile
              label="Current stage"
              value={project.current_stage?.name ?? "Completed workflow"}
            />
          </div>

          <div className="rounded-[24px] border border-ember/20 bg-ember/10 px-4 py-4 text-sm leading-7 text-white/80">
            Deleting this project will permanently remove its workflow stages, comments, uploaded documents, and
            linked stage/comment audit records. This action cannot be undone.
          </div>

          {error ? (
            <p className="rounded-2xl border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-white">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/35 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep project
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d45334] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Deleting project..." : "Delete permanently"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectInfoTile({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1 rounded-2xl border border-white/8 bg-black/10 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
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
