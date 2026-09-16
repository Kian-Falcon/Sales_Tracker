"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { ExportButton } from "@/components/ExportButton";
import { ProjectRecordPanel, type ProjectPanelTab } from "@/components/ProjectRecordPanel";
import { useToast } from "@/components/ToastProvider";
import { StatusChip } from "@/components/StatusChip";
import {
  createProject,
  deleteProject as deleteProjectRequest,
  getProject,
  getProjectWorkspace,
  getProjectWorkspaceMeta,
  updateProjectMetadata,
  uploadProjectDocument
} from "@/lib/api";
import type {
  Department,
  ProjectCreateInput,
  ProjectDetail,
  ProjectDocument,
  ProjectMetadataUpdateInput,
  ProjectPriority,
  ProjectSummary,
  ProjectWorkspaceMeta,
  ProjectWorkspacePage,
  StageStatus,
  ViewerDetails
} from "@/lib/types";
import {
  cn,
  formatCurrency,
  formatDate,
  formatPriority,
  titleCasePhase
} from "@/lib/utils";

type WorkspaceView = "grid" | "kanban" | "calendar";
type ProjectStatusFilter = "all" | "active" | "overdue" | "done";
type SortMode = "created-desc" | "created-asc" | "due-asc" | "priority" | "value-desc";
type RowDensity = "compact" | "comfortable" | "tall";
type WorkspacePreset = "all" | "active" | "my-team" | "overdue" | "recent" | "completed";
type ProjectUiState = { kind: "creating" | "syncing"; label: string };

const acceptedDocumentTypes = ".pdf,.csv,.xls,.xlsx,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg";
const dashboardPreferencesKey = "kf-workflow-dashboard-preferences";
const workspaceViews: WorkspaceView[] = ["grid", "kanban", "calendar"];
const sortModes: SortMode[] = ["created-desc", "created-asc", "due-asc", "priority", "value-desc"];
const rowDensities: RowDensity[] = ["compact", "comfortable", "tall"];
const gridProjectsPerPage = 100;
const rowDensityClasses: Record<RowDensity, string> = {
  compact: "py-2",
  comfortable: "py-3",
  tall: "py-4"
};

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
    .sort((left, right) => left - right);

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

function resolvePanelTab(value: string | null): ProjectPanelTab {
  if (value === "pipeline" || value === "documents") {
    return value;
  }

  return "overview";
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

function getProjectStatusLabel(status: ProjectStatusFilter) {
  if (status === "active") {
    return "Active";
  }

  if (status === "overdue") {
    return "Overdue";
  }

  if (status === "done") {
    return "Completed";
  }

  return "All";
}

function isRecentProject(project: ProjectSummary) {
  const createdAt = new Date(project.created_at).getTime();
  if (Number.isNaN(createdAt)) {
    return false;
  }

  return Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
}

function toProjectSummary(project: ProjectDetail): ProjectSummary {
  const currentStage = project.stages.find((stage) => stage.status === "active" || stage.status === "overdue") ?? null;

  return {
    id: project.id,
    project_code: project.project_code,
    name: project.name,
    client: project.client,
    brand: project.brand,
    assigned_person_name: project.assigned_person_name,
    priority: project.priority,
    estimated_tat_days: project.estimated_tat_days,
    total_order_value: project.total_order_value,
    dispatch_date: project.dispatch_date,
    number_of_stores: project.number_of_stores,
    completed_stages: project.stages.filter((stage) => stage.status === "done").length,
    total_stages: project.stages.length,
    created_at: project.created_at,
    is_archived: project.is_archived,
    current_stage: currentStage
      ? {
          id: currentStage.id,
          stage_key: currentStage.stage_key,
          name: currentStage.name,
          phase: currentStage.phase,
          responsible_dept: currentStage.responsible_dept,
          status: currentStage.status,
          sort_order: currentStage.sort_order,
          activated_at: currentStage.activated_at,
          due_date: currentStage.due_date
        }
      : null
  };
}

function applyProjectMetadataPatch(project: ProjectDetail, patch: ProjectMetadataUpdateInput): ProjectDetail {
  return {
    ...project,
    name: patch.name ?? project.name,
    client: patch.client ?? project.client,
    assigned_person_name:
      patch.assigned_person_name === undefined ? project.assigned_person_name : patch.assigned_person_name,
    priority: patch.priority ?? project.priority,
    estimated_tat_days: patch.estimated_tat_days === undefined ? project.estimated_tat_days : patch.estimated_tat_days,
    total_order_value: patch.total_order_value === undefined ? project.total_order_value : patch.total_order_value,
    dispatch_date: patch.dispatch_date === undefined ? project.dispatch_date : patch.dispatch_date,
    number_of_stores: patch.number_of_stores === undefined ? project.number_of_stores : patch.number_of_stores,
    special_request: patch.special_request === undefined ? project.special_request : patch.special_request
  };
}

function buildOptimisticProjectSummary(
  input: ProjectCreateInput,
  viewer: ViewerDetails | null,
  optimisticId: string
): ProjectSummary {
  const createdAt = new Date().toISOString();

  return {
    id: optimisticId,
    project_code: "Saving...",
    name: input.name,
    client: input.client,
    brand: null,
    assigned_person_name: input.assigned_person_name,
    priority: input.priority,
    estimated_tat_days: input.estimated_tat_days,
    total_order_value: input.total_order_value,
    dispatch_date: input.dispatch_date ?? null,
    number_of_stores: null,
    completed_stages: 0,
    total_stages: 0,
    created_at: createdAt,
    is_archived: false,
    current_stage: {
      id: `${optimisticId}-stage`,
      stage_key: null,
      name: "Creating workflow",
      phase: "costing",
      responsible_dept: viewer?.department ?? "Sales",
      status: "active",
      sort_order: 0,
      activated_at: createdAt,
      due_date: null
    }
  };
}

function getEta(project: ProjectSummary) {
  if (!project.current_stage) {
    return {
      label: "Completed",
      tone: "text-ink/60"
    };
  }

  if (!project.current_stage.due_date) {
    return {
      label: "Due date not set",
      tone: "text-ink/45"
    };
  }

  const dueDate = new Date(project.current_stage.due_date);
  dueDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (project.current_stage.status === "overdue" || diffDays < 0) {
    return {
      label: `${Math.abs(diffDays)}d late`,
      tone: "text-ink/60"
    };
  }

  if (diffDays === 0) {
    return {
      label: "Due today",
      tone: "text-ink/60"
    };
  }

  return {
    label: `${diffDays}d left`,
    tone: "text-ink/60"
  };
}

function getProgress(project: ProjectSummary) {
  if (!project.total_stages) {
    return 0;
  }

  const activeWeight = project.current_stage ? 0.5 : 0;
  const ratio = (project.completed_stages + activeWeight) / project.total_stages;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

function getProgressTone(status: StageStatus | null) {
  if (status === "overdue") {
    return "bg-danger";
  }

  if (status === "done" || status === null) {
    return "bg-success";
  }

  return "bg-ink/70";
}

function matchesSearch(project: ProjectSummary, query: string) {
  if (!query.trim()) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  const fields = [
    project.project_code,
    project.name,
    project.client,
    project.assigned_person_name ?? "",
    project.current_stage?.name ?? "",
    project.current_stage?.responsible_dept ?? "",
    formatPriority(project.priority)
  ];

  return fields.some((field) => field.toLowerCase().includes(normalized));
}

function sortProjects(projects: ProjectSummary[], mode: SortMode) {
  const copy = [...projects];

  copy.sort((left, right) => {
    if (mode === "created-asc") {
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    }

    if (mode === "created-desc") {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    }

    if (mode === "due-asc") {
      const leftDue = left.current_stage?.due_date ? new Date(left.current_stage.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.current_stage?.due_date ? new Date(right.current_stage.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    }

    if (mode === "value-desc") {
      return (right.total_order_value ?? -1) - (left.total_order_value ?? -1);
    }

    if (left.priority !== right.priority) {
      return left.priority === "accelerated" ? -1 : 1;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });

  return copy;
}

function buildCalendarDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = new Date(year, month, 0).getDate();
  const cells: Array<{ key: string; date: Date | null }> = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push({ key: `leading-${index}`, date: null });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({ key: `day-${day}`, date: new Date(year, month - 1, day) });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `trailing-${cells.length}`, date: null });
  }

  return cells;
}

function toMonthInputValue(dateValue = new Date()) {
  return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}`;
}

function toDateKey(dateValue: Date) {
  return `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, "0")}-${String(
    dateValue.getDate()
  ).padStart(2, "0")}`;
}

function getActiveWorkspacePreset({
  search,
  clientFilter,
  statusFilter,
  departmentFilter,
  overdueOnly,
  sortMode,
  viewerDepartment
}: {
  search: string;
  clientFilter: string;
  statusFilter: ProjectStatusFilter;
  departmentFilter: string;
  overdueOnly: boolean;
  sortMode: SortMode;
  viewerDepartment?: Department | null;
}): WorkspacePreset | null {
  if (search.trim()) {
    return null;
  }

  if (clientFilter !== "all") {
    return null;
  }

  if (
    viewerDepartment &&
    departmentFilter === viewerDepartment &&
    statusFilter === "all" &&
    !overdueOnly &&
    sortMode === "due-asc"
  ) {
    return "my-team";
  }

  if (departmentFilter !== "all") {
    return null;
  }

  if (statusFilter === "active" && !overdueOnly && sortMode === "due-asc") {
    return "active";
  }

  if ((statusFilter === "overdue" || overdueOnly) && sortMode === "due-asc") {
    return "overdue";
  }

  if (statusFilter === "done" && !overdueOnly && sortMode === "created-desc") {
    return "completed";
  }

  if (statusFilter === "all" && !overdueOnly && sortMode === "created-desc") {
    return "recent";
  }

  if (statusFilter === "all" && !overdueOnly && sortMode === "due-asc") {
    return "all";
  }

  return null;
}

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

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M8 4.5H4.5V8" />
      <path d="M20 8V4.5h-3.5" />
      <path d="M4.5 16v3.5H8" />
      <path d="M16.5 19.5H20V16" />
      <path d="m9 15 6-6" />
      <path d="M9 9h6v6" />
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

export function ProjectWorkspace({
  viewerDepartment,
  viewer
}: {
  viewerDepartment?: Department | null;
  viewer?: ViewerDetails | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryProjectId = searchParams.get("project");
  const queryUploadFailed = searchParams.get("upload") === "failed";
  const queryNewProjectOpen = searchParams.get("new") === "1";
  const queryPanelTab = queryUploadFailed ? "documents" : resolvePanelTab(searchParams.get("panel"));
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [workspaceMeta, setWorkspaceMeta] = useState<ProjectWorkspaceMeta | null>(null);
  const [workspacePage, setWorkspacePage] = useState<ProjectWorkspacePage | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>("grid");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("due-asc");
  const [rowDensity, setRowDensity] = useState<RowDensity>("comfortable");
  const [gridPage, setGridPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(toMonthInputValue);
  const [quickCreateOpen, setQuickCreateOpen] = useState(queryNewProjectOpen);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(queryProjectId);
  const [activePanelTab, setActivePanelTab] = useState<ProjectPanelTab>(queryPanelTab);
  const [projectDetailsById, setProjectDetailsById] = useState<Record<string, ProjectDetail>>({});
  const [projectDetailError, setProjectDetailError] = useState<string | null>(null);
  const [projectUiStates, setProjectUiStates] = useState<Record<string, ProjectUiState>>({});
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const [workspaceMetaRefreshKey, setWorkspaceMetaRefreshKey] = useState(0);
  const workspaceRequestIdRef = useRef(0);
  const workspaceMetaRequestIdRef = useRef(0);
  const deferredSearch = useDeferredValue(search.trim());
  const { pushToast } = useToast();

  useEffect(() => {
    setQuickCreateOpen(queryNewProjectOpen);
  }, [queryNewProjectOpen]);

  useEffect(() => {
    setActiveProjectId(queryProjectId);
  }, [queryProjectId]);

  useEffect(() => {
    setActivePanelTab(queryPanelTab);
  }, [queryPanelTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(dashboardPreferencesKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{
          view: WorkspaceView;
          sortMode: SortMode;
          rowDensity: RowDensity;
        }>;

        if (parsed.view && workspaceViews.includes(parsed.view)) {
          setView(parsed.view);
        }

        if (parsed.sortMode && sortModes.includes(parsed.sortMode)) {
          setSortMode(parsed.sortMode);
        }

        if (parsed.rowDensity && rowDensities.includes(parsed.rowDensity)) {
          setRowDensity(parsed.rowDensity);
        }
      }
    } catch {
      // Ignore malformed local workspace preferences and continue with defaults.
    } finally {
      setPreferencesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !preferencesHydrated) {
      return;
    }

    window.localStorage.setItem(
      dashboardPreferencesKey,
      JSON.stringify({
        view,
        sortMode,
        rowDensity
      })
    );
  }, [preferencesHydrated, rowDensity, sortMode, view]);

  useEffect(() => {
    setGridPage(1);
  }, [clientFilter, deferredSearch, departmentFilter, overdueOnly, sortMode, statusFilter, view]);

  useEffect(() => {
    if (!preferencesHydrated) {
      return;
    }

    let cancelled = false;
    const requestId = workspaceMetaRequestIdRef.current + 1;
    workspaceMetaRequestIdRef.current = requestId;

    void getProjectWorkspaceMeta()
      .then((response) => {
        if (cancelled || requestId !== workspaceMetaRequestIdRef.current) {
          return;
        }

        setWorkspaceMeta(response);
      })
      .catch((error) => {
        if (cancelled || requestId !== workspaceMetaRequestIdRef.current) {
          return;
        }
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [preferencesHydrated, workspaceMetaRefreshKey]);

  const workspaceQuery = useMemo(
    () => ({
      search: deferredSearch || undefined,
      client: clientFilter !== "all" ? clientFilter : undefined,
      status: statusFilter,
      department: departmentFilter !== "all" ? (departmentFilter as Department) : undefined,
      overdue_only: overdueOnly || undefined,
      sort: sortMode,
      page: view === "grid" ? gridPage : 1,
      page_size: gridProjectsPerPage,
      paginate: view === "grid"
    }),
    [clientFilter, deferredSearch, departmentFilter, gridPage, overdueOnly, sortMode, statusFilter, view]
  );

  useEffect(() => {
    if (!preferencesHydrated) {
      return;
    }

    let cancelled = false;
    const requestId = workspaceRequestIdRef.current + 1;
    workspaceRequestIdRef.current = requestId;
    setWorkspaceLoading(true);
    setWorkspaceError(null);

    void getProjectWorkspace(workspaceQuery)
      .then((response) => {
        if (cancelled || requestId !== workspaceRequestIdRef.current) {
          return;
        }

        setWorkspacePage(response);
        setProjects(response.items);
        if (view === "grid" && response.total_pages > 0 && response.page > response.total_pages) {
          setGridPage(response.total_pages);
        }
      })
      .catch((error) => {
        if (cancelled || requestId !== workspaceRequestIdRef.current) {
          return;
        }

        setWorkspaceError(error instanceof Error ? error.message : "Unable to load the dashboard right now.");
        setWorkspacePage(null);
        setProjects([]);
      })
      .finally(() => {
        if (cancelled || requestId !== workspaceRequestIdRef.current) {
          return;
        }

        setWorkspaceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [preferencesHydrated, view, workspaceQuery, workspaceRefreshKey]);

  const clients = workspaceMeta?.client_options ?? [];
  const departments = workspaceMeta?.department_options ?? [];
  const filteredProjects = projects;

  const kanbanBuckets = useMemo(() => {
    const buckets: Record<string, ProjectSummary[]> = {
      Costing: [],
      Drawing: [],
      Sampling: [],
      Production: [],
      Completed: []
    };

    filteredProjects.forEach((project) => {
      const bucket = project.current_stage ? titleCasePhase(project.current_stage.phase) : "Completed";
      buckets[bucket] = [...(buckets[bucket] ?? []), project];
    });

    return buckets;
  }, [filteredProjects]);

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const calendarProjectsByDate = useMemo(() => {
    const next = new Map<string, ProjectSummary[]>();

    filteredProjects.forEach((project) => {
      if (!project.current_stage?.due_date) {
        return;
      }

      const dateValue = new Date(project.current_stage.due_date);
      const monthValue = toMonthInputValue(dateValue);
      if (monthValue !== calendarMonth) {
        return;
      }

      const key = toDateKey(dateValue);
      next.set(key, [...(next.get(key) ?? []), project]);
    });

    return next;
  }, [calendarMonth, filteredProjects]);

  const hasActiveFilters =
    search.trim() ||
    clientFilter !== "all" ||
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    overdueOnly;

  const activePreset = useMemo(
    () =>
      getActiveWorkspacePreset({
        search,
        clientFilter,
        statusFilter,
        departmentFilter,
        overdueOnly,
        sortMode,
        viewerDepartment
      }),
    [clientFilter, departmentFilter, overdueOnly, search, sortMode, statusFilter, viewerDepartment]
  );

  const presetCounts = useMemo(
    () => ({
      all: workspaceMeta?.preset_counts.all ?? projects.length,
      active: workspaceMeta?.preset_counts.active ?? projects.filter((project) => getProjectStatus(project) === "active").length,
      myTeam:
        workspaceMeta?.preset_counts.my_team ??
        (viewerDepartment ? projects.filter((project) => getDepartment(project) === viewerDepartment).length : 0),
      overdue:
        workspaceMeta?.preset_counts.overdue ?? projects.filter((project) => getProjectStatus(project) === "overdue").length,
      recent: workspaceMeta?.preset_counts.recent ?? projects.filter((project) => isRecentProject(project)).length,
      completed:
        workspaceMeta?.preset_counts.completed ?? projects.filter((project) => getProjectStatus(project) === "done").length
    }),
    [projects, viewerDepartment, workspaceMeta]
  );

  const projectCounts = useMemo(
    () => ({
      total: workspaceMeta?.summary.total ?? projects.length,
      active: workspaceMeta?.summary.active ?? projects.filter((project) => getProjectStatus(project) === "active").length,
      overdue: workspaceMeta?.summary.overdue ?? projects.filter((project) => getProjectStatus(project) === "overdue").length,
      completed:
        workspaceMeta?.summary.completed ?? projects.filter((project) => getProjectStatus(project) === "done").length
    }),
    [projects, workspaceMeta]
  );

  const matchingProjectCount = workspacePage?.total_count ?? filteredProjects.length;
  const totalGridPages = workspacePage?.total_pages ?? 1;

  const activeProjectDetail = activeProjectId ? projectDetailsById[activeProjectId] ?? null : null;

  useEffect(() => {
    if (!activeProjectId) {
      setProjectDetailError(null);
      return;
    }

    if (activeProjectDetail) {
      setProjectDetailError(null);
      return;
    }

    let cancelled = false;
    setProjectDetailError(null);

    void getProject(activeProjectId)
      .then((project) => {
        if (cancelled) {
          return;
        }

        setProjectDetailsById((current) => ({
          ...current,
          [project.id]: project
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setProjectDetailError(error instanceof Error ? error.message : "Unable to load this project right now.");
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectDetail, activeProjectId]);

  const focusLabel = useMemo(() => {
    if (activePreset === "all") {
      return "All projects";
    }

    if (activePreset === "active") {
      return "Active projects";
    }

    if (activePreset === "my-team") {
      return "My team";
    }

    if (activePreset === "overdue") {
      return "Overdue focus";
    }

    if (activePreset === "recent") {
      return "Created this week";
    }

    if (activePreset === "completed") {
      return "Completed projects";
    }

    return hasActiveFilters ? "Custom filter set" : "All projects";
  }, [activePreset, hasActiveFilters]);

  const displayedProject = activeProjectDetail;
  const displayedProjectError = activeProjectId && !displayedProject ? projectDetailError : null;

  function refreshWorkspace(includeMeta = false) {
    setWorkspaceRefreshKey((current) => current + 1);
    if (includeMeta) {
      setWorkspaceMetaRefreshKey((current) => current + 1);
    }
  }

  function setProjectUiState(projectId: string, nextState: ProjectUiState | null) {
    setProjectUiStates((current) => {
      if (!nextState) {
        const next = { ...current };
        delete next[projectId];
        return next;
      }

      return {
        ...current,
        [projectId]: nextState
      };
    });
  }

  function storeProjectDetail(project: ProjectDetail) {
    setProjectDetailsById((current) => ({
      ...current,
      [project.id]: project
    }));
  }

  function removeProjectDetail(projectId: string) {
    setProjectDetailsById((current) => {
      if (!(projectId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[projectId];
      return next;
    });
  }

  function syncProjectLocally(updatedProject: ProjectDetail) {
    setProjects((current) => {
      const nextSummary = toProjectSummary(updatedProject);
      const hasMatch = current.some((entry) => entry.id === updatedProject.id);

      if (!hasMatch) {
        return [nextSummary, ...current];
      }

      return current.map((entry) => (entry.id === updatedProject.id ? nextSummary : entry));
    });
    storeProjectDetail(updatedProject);
  }

  function handleProjectChange(updatedProject: ProjectDetail) {
    syncProjectLocally(updatedProject);
    setProjectUiState(updatedProject.id, null);
    refreshWorkspace(true);
  }

  function handleProjectSyncStateChange(projectId: string, label: string | null) {
    setProjectUiState(projectId, label ? { kind: "syncing", label } : null);
  }

  function handleProjectDocumentUploaded(projectId: string, document: ProjectDocument) {
    setProjectDetailsById((current) => {
      const baseProject = current[projectId];
      if (!baseProject) {
        return current;
      }

      return {
        ...current,
        [projectId]: {
          ...baseProject,
          documents: [document, ...baseProject.documents.filter((entry) => entry.id !== document.id)]
        }
      };
    });
    setProjectUiState(projectId, null);
  }

  function applyWorkspacePreset(preset: WorkspacePreset) {
    setSearch("");
    setClientFilter("all");
    setQuickCreateOpen(false);
    setView("grid");
    replaceQuery({ new: null });

    if (preset === "my-team" && viewerDepartment) {
      setDepartmentFilter(viewerDepartment);
      setStatusFilter("all");
      setOverdueOnly(false);
      setSortMode("due-asc");
      return;
    }

    setDepartmentFilter("all");

    if (preset === "active") {
      setStatusFilter("active");
      setOverdueOnly(false);
      setSortMode("due-asc");
      return;
    }

    if (preset === "overdue") {
      setStatusFilter("overdue");
      setOverdueOnly(true);
      setSortMode("due-asc");
      return;
    }

    if (preset === "recent") {
      setStatusFilter("all");
      setOverdueOnly(false);
      setSortMode("created-desc");
      return;
    }

    if (preset === "completed") {
      setStatusFilter("done");
      setOverdueOnly(false);
      setSortMode("created-desc");
      return;
    }

    setStatusFilter("all");
    setOverdueOnly(false);
    setSortMode("due-asc");
  }

  function replaceQuery(updates: Record<string, string | null>) {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key);
        return;
      }

      params.set(key, value);
    });

    const query = params.toString();
    window.history.replaceState(window.history.state, "", query ? `${pathname}?${query}` : pathname);
  }

  function openProject(projectId: string, tab: ProjectPanelTab = "overview") {
    setActionNotice(null);
    setActionError(null);
    setActiveProjectId(projectId);
    setActivePanelTab(tab);
    replaceQuery({
      project: projectId,
      panel: tab,
      new: null,
      upload: null
    });
  }

  function closeProject() {
    setActionError(null);
    setActiveProjectId(null);
    replaceQuery({
      project: null,
      panel: null,
      upload: null
    });
  }

  function toggleQuickCreate(nextOpen: boolean) {
    setActionNotice(null);
    setActionError(null);
    setQuickCreateOpen(nextOpen);
    if (nextOpen) {
      setActiveProjectId(null);
    }
    replaceQuery({
      new: nextOpen ? "1" : null,
      project: null,
      panel: null,
      upload: null
    });
  }

  async function patchProject(project: ProjectSummary, patch: ProjectMetadataUpdateInput) {
    setActionError(null);
    setActionNotice(null);

    const previousProject = projects.find((entry) => entry.id === project.id) ?? project;
    const previousDetail = projectDetailsById[project.id] ?? null;

    setProjectUiState(project.id, { kind: "syncing", label: "Saving changes..." });
    setProjects((current) =>
      current.map((entry) =>
        entry.id === project.id
          ? {
              ...entry,
              name: patch.name ?? entry.name,
              client: patch.client ?? entry.client,
              assigned_person_name:
                patch.assigned_person_name === undefined ? entry.assigned_person_name : patch.assigned_person_name,
              priority: patch.priority ?? entry.priority,
              estimated_tat_days:
                patch.estimated_tat_days === undefined ? entry.estimated_tat_days : patch.estimated_tat_days,
              total_order_value:
                patch.total_order_value === undefined ? entry.total_order_value : patch.total_order_value,
              dispatch_date: patch.dispatch_date === undefined ? entry.dispatch_date : patch.dispatch_date
            }
          : entry
      )
    );
    if (previousDetail) {
      storeProjectDetail(applyProjectMetadataPatch(previousDetail, patch));
    }

    try {
      const updatedProject = await updateProjectMetadata(project.id, patch);
      syncProjectLocally(updatedProject);
      setProjectUiState(project.id, null);
      refreshWorkspace(true);
      pushToast({
        tone: "success",
        title: "Project updated",
        description: "The grid row has been reconciled with the backend."
      });
    } catch (error) {
      setProjects((current) => current.map((entry) => (entry.id === project.id ? previousProject : entry)));
      if (previousDetail) {
        storeProjectDetail(previousDetail);
      }
      setProjectUiState(project.id, null);
      setActionError(error instanceof Error ? error.message : "Unable to save that change right now.");
    }
  }

  async function handleDeleteProject() {
    if (!deleteTarget) {
      return;
    }

    setDeletePending(true);
    setDeleteError(null);

    try {
      await deleteProjectRequest(deleteTarget.id);
      setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
      removeProjectDetail(deleteTarget.id);
      setProjectUiState(deleteTarget.id, null);
      setActionError(null);
      setActionNotice(`${deleteTarget.project_code} was deleted from the workspace.`);
      refreshWorkspace(true);
      pushToast({
        tone: "success",
        title: "Project deleted",
        description: `${deleteTarget.project_code} was removed from the shared workspace.`
      });
      if (activeProjectId === deleteTarget.id) {
        closeProject();
      }
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete this project right now.");
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        {workspaceError ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{workspaceError}</p> : null}

        {actionError ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{actionError}</p> : null}

        {actionNotice ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{actionNotice}</p> : null}

        {queryUploadFailed && !activeProjectId ? (
          <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">
            A project was created successfully, but its BOQ upload did not complete.
          </p>
        ) : null}

        <section className="overflow-hidden border-y border-border bg-white">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ViewTab active={view === "grid"} onClick={() => setView("grid")} label="Grid" />
                  <ViewTab active={view === "kanban"} onClick={() => setView("kanban")} label="Kanban" />
                  <ViewTab active={view === "calendar"} onClick={() => setView("calendar")} label="Calendar" />
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Suggested views</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <WorkspacePresetChip
                      label="All projects"
                      count={presetCounts.all}
                      active={activePreset === "all"}
                      onClick={() => applyWorkspacePreset("all")}
                    />
                    {viewerDepartment ? (
                      <WorkspacePresetChip
                        label="My team"
                        count={presetCounts.myTeam}
                        active={activePreset === "my-team"}
                        onClick={() => applyWorkspacePreset("my-team")}
                      />
                    ) : null}
                    <WorkspacePresetChip
                      label="Overdue focus"
                      count={presetCounts.overdue}
                      active={activePreset === "overdue"}
                      onClick={() => applyWorkspacePreset("overdue")}
                    />
                    <WorkspacePresetChip
                      label="Created this week"
                      count={presetCounts.recent}
                      active={activePreset === "recent"}
                      onClick={() => applyWorkspacePreset("recent")}
                    />
                    <WorkspacePresetChip
                      label="Completed"
                      count={presetCounts.completed}
                      active={activePreset === "completed"}
                      onClick={() => applyWorkspacePreset("completed")}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                    Spreadsheet workspace
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold text-ink">Workflow grid</h1>
                  <p className="mt-2 max-w-3xl text-sm text-ink/55">
                    Work through projects in one dense workspace, then expand any row into the right-side record
                    panel for pipeline, comments, due-date requests, and documents.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryStat
                  label="Projects"
                  value={projectCounts.total}
                  tone="text-ink"
                  helper="All tracked projects"
                  active={activePreset === "all"}
                  onClick={() => applyWorkspacePreset("all")}
                />
                <SummaryStat
                  label="Active"
                  value={projectCounts.active}
                  tone="text-ink"
                  helper="Current live stages"
                  active={activePreset === "active"}
                  onClick={() => applyWorkspacePreset("active")}
                />
                <SummaryStat
                  label="Overdue"
                  value={projectCounts.overdue}
                  tone="text-danger"
                  helper="Needs follow-up now"
                  active={activePreset === "overdue"}
                  onClick={() => applyWorkspacePreset("overdue")}
                />
                <SummaryStat
                  label="Completed"
                  value={projectCounts.completed}
                  tone="text-success"
                  helper="Workflow fully done"
                  active={activePreset === "completed"}
                  onClick={() => applyWorkspacePreset("completed")}
                />
              </div>
            </div>
          </div>

          <div className="border-b border-border bg-surface-muted/35 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,0.8fr))]">
                <ToolbarField label="Search">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search code, project, client, stage, or owner"
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  />
                </ToolbarField>

                <ToolbarField label="Client">
                  <select
                    value={clientFilter}
                    onChange={(event) => setClientFilter(event.target.value)}
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  >
                    <option value="all">All clients</option>
                    {clients.map((client) => (
                      <option key={client} value={client}>
                        {client}
                      </option>
                    ))}
                  </select>
                </ToolbarField>

                <ToolbarField label="Status">
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as ProjectStatusFilter)}
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="overdue">Overdue</option>
                    <option value="done">Completed</option>
                  </select>
                </ToolbarField>

                <ToolbarField label="Department">
                  <select
                    value={departmentFilter}
                    onChange={(event) => setDepartmentFilter(event.target.value)}
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  >
                    <option value="all">All departments</option>
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </ToolbarField>

                <ToolbarField label="Sort">
                  <select
                    value={sortMode}
                    onChange={(event) => setSortMode(event.target.value as SortMode)}
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  >
                    <option value="due-asc">Due soonest</option>
                    <option value="created-desc">Newest created</option>
                    <option value="created-asc">Oldest created</option>
                    <option value="priority">Priority first</option>
                    <option value="value-desc">Highest value</option>
                  </select>
                </ToolbarField>

                <ToolbarField label="Row density">
                  <select
                    value={rowDensity}
                    onChange={(event) => setRowDensity(event.target.value as RowDensity)}
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  >
                    <option value="compact">Compact</option>
                    <option value="comfortable">Medium</option>
                    <option value="tall">Tall</option>
                  </select>
                </ToolbarField>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-2 text-sm font-medium text-ink/65">
                    Focus: {focusLabel}
                  </span>

                  <button
                    type="button"
                    onClick={() => setOverdueOnly((current) => !current)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      overdueOnly
                        ? "bg-accent text-white"
                        : "border border-border bg-white text-ink hover:border-accent hover:bg-surface-muted/60"
                    }`}
                  >
                    Overdue only
                  </button>

                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setClientFilter("all");
                        setStatusFilter("all");
                        setDepartmentFilter("all");
                        setOverdueOnly(false);
                      }}
                      className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/60"
                    >
                      Clear filters
                    </button>
                  ) : null}

                  <span className="rounded-full bg-white px-3 py-2 text-sm text-ink/55">
                    {matchingProjectCount} matching row{matchingProjectCount === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <ExportButton />
                  {viewerDepartment === "Sales" || viewerDepartment === "Admin" ? (
                    <Link
                      href="/reports"
                      className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/60"
                    >
                      Reports
                    </Link>
                  ) : null}
                  {viewerDepartment === "Admin" ? (
                    <Link
                      href="/settings/workflow"
                      className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/60"
                    >
                      Workflow settings
                    </Link>
                  ) : null}
                  {(viewerDepartment === "Sales" || viewerDepartment === "Admin") ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleQuickCreate(!quickCreateOpen)}
                        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
                      >
                        {quickCreateOpen ? "Hide quick add" : "New project"}
                      </button>
                      <Link
                        href="/projects/new"
                        className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/60"
                      >
                        Full form
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>

              {hasActiveFilters ? (
                <div className="flex flex-wrap items-center gap-2">
                  {search.trim() ? (
                    <ActiveFilterPill label={`Search: ${search.trim()}`} onClear={() => setSearch("")} />
                  ) : null}
                  {clientFilter !== "all" ? (
                    <ActiveFilterPill label={`Client: ${clientFilter}`} onClear={() => setClientFilter("all")} />
                  ) : null}
                  {statusFilter !== "all" ? (
                    <ActiveFilterPill
                      label={`Status: ${getProjectStatusLabel(statusFilter)}`}
                      onClear={() => setStatusFilter("all")}
                    />
                  ) : null}
                  {departmentFilter !== "all" ? (
                    <ActiveFilterPill
                      label={`Department: ${departmentFilter}`}
                      onClear={() => setDepartmentFilter("all")}
                    />
                  ) : null}
                  {overdueOnly ? (
                    <ActiveFilterPill label="Overdue only" onClear={() => setOverdueOnly(false)} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {quickCreateOpen ? (
            <QuickCreateProjectRow
              viewer={viewer ?? null}
              onCancel={() => toggleQuickCreate(false)}
              onCreateStart={(optimisticId, input) => {
                setActionError(null);
                setActionNotice(null);
                setProjects((current) => [
                  buildOptimisticProjectSummary(input, viewer ?? null, optimisticId),
                  ...current.filter((entry) => entry.id !== optimisticId)
                ]);
                setProjectUiState(optimisticId, { kind: "creating", label: "Creating project..." });
              }}
              onCreated={(optimisticId, project, options) => {
                setActionError(null);
                setActionNotice(
                  options.uploadPending
                    ? "Project created. BOQ upload is continuing in the background."
                    : "Project created and added to the workspace."
                );
                setProjects((current) => [
                  toProjectSummary(project),
                  ...current.filter((entry) => entry.id !== optimisticId && entry.id !== project.id)
                ]);
                storeProjectDetail(project);
                refreshWorkspace(true);
                setActiveProjectId(project.id);
                setActivePanelTab(options.defaultTab);
                setQuickCreateOpen(false);
                setProjectUiState(optimisticId, null);
                setProjectUiState(project.id, options.uploadPending ? { kind: "syncing", label: "Uploading BOQ..." } : null);
                pushToast({
                  tone: "success",
                  title: "Project created",
                  description: options.uploadPending
                    ? "The project is ready. The BOQ upload is still finishing."
                    : "The project was added to the workspace."
                });
                replaceQuery({
                  new: null,
                  project: project.id,
                  panel: options.defaultTab,
                  upload: null
                });
              }}
              onCreateFailed={(optimisticId, message) => {
                setProjects((current) => current.filter((entry) => entry.id !== optimisticId));
                setProjectUiState(optimisticId, null);
                setActionError(message);
              }}
              onUploadComplete={(projectId, document) => {
                handleProjectDocumentUploaded(projectId, document);
                setActionNotice("Project created and BOQ uploaded successfully.");
                pushToast({
                  tone: "success",
                  title: "BOQ uploaded",
                  description: "The new project record now includes its BOQ file."
                });
              }}
              onUploadFailed={(projectId) => {
                setProjectUiState(projectId, null);
                setActionNotice("Project created. Upload the BOQ from the documents tab.");
                setActiveProjectId(projectId);
                setActivePanelTab("documents");
                replaceQuery({
                  project: projectId,
                  panel: "documents",
                  upload: "failed",
                  new: null
                });
                pushToast({
                  tone: "info",
                  title: "Project created",
                  description: "The BOQ upload did not finish. You can retry it from the documents tab."
                });
              }}
            />
          ) : null}

          <div className={view === "grid" ? "px-0 py-0" : "px-4 py-4 sm:px-5"}>
            {view === "grid" ? (
              <GridWorkspaceTable
                projects={filteredProjects}
                loading={workspaceLoading}
                currentPage={gridPage}
                totalPages={totalGridPages}
                totalCount={matchingProjectCount}
                onPageChange={setGridPage}
                viewerDepartment={viewerDepartment ?? undefined}
                rowDensity={rowDensity}
                hasProjectsInWorkspace={
                  workspaceMeta ? workspaceMeta.summary.total > 0 : Boolean(projects.length || matchingProjectCount || hasActiveFilters)
                }
                hasActiveFilters={Boolean(hasActiveFilters)}
                canCreateProjects={viewerDepartment === "Sales" || viewerDepartment === "Admin"}
                projectUiStates={projectUiStates}
                onOpenProject={openProject}
                onDeleteProject={setDeleteTarget}
                onPatchProject={patchProject}
              />
            ) : view === "kanban" ? (
              <KanbanWorkspaceView
                buckets={kanbanBuckets}
                onOpenProject={openProject}
              />
            ) : (
              <CalendarWorkspaceView
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                calendarDays={calendarDays}
                projectsByDate={calendarProjectsByDate}
                onOpenProject={openProject}
              />
            )}
          </div>
        </section>
      </div>

      <DeleteProjectDialog
        project={deleteTarget}
        pending={deletePending}
        error={deleteError}
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deletePending) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleDeleteProject()}
      />

      <ProjectRecordPanel
        open={Boolean(activeProjectId)}
        project={displayedProject}
        projectId={activeProjectId}
        error={displayedProjectError}
        viewerDepartment={viewerDepartment}
        viewerName={viewer?.fullName ?? null}
        defaultTab={activePanelTab}
        projectSyncLabel={activeProjectId ? projectUiStates[activeProjectId]?.label ?? null : null}
        uploadFailed={queryUploadFailed}
        onProjectChange={handleProjectChange}
        onDocumentUpload={handleProjectDocumentUploaded}
        onProjectSyncStateChange={handleProjectSyncStateChange}
        onClose={closeProject}
      />
    </>
  );
}

function SummaryStat({
  label,
  value,
  tone,
  helper,
  active,
  onClick
}: {
  label: string;
  value: number;
  tone: string;
  helper: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-3 text-left transition",
        active
          ? "border-accent bg-accent/5 shadow-sm"
          : "border-border bg-surface-muted/35 hover:border-accent/40 hover:bg-white"
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-2 text-xs text-ink/50">{helper}</div>
    </button>
  );
}

function ViewTab({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-accent text-white" : "border border-border bg-surface-muted/45 text-ink hover:border-accent hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function ToolbarField({
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

function ActiveFilterPill({
  label,
  onClear
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-sm text-ink/65 transition hover:border-accent hover:bg-surface-muted/60"
    >
      <span>{label}</span>
      <span className="text-xs font-semibold text-ink/40">x</span>
    </button>
  );
}

function WorkspacePresetChip({
  active,
  label,
  count,
  onClick
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition",
        active
          ? "bg-accent text-white"
          : "border border-border bg-white text-ink hover:border-accent hover:bg-surface-muted/60"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
          active ? "bg-white/20 text-white" : "bg-surface-muted text-ink/55"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function GridWorkspaceTable({
  projects,
  loading,
  currentPage,
  totalPages,
  totalCount,
  onPageChange,
  viewerDepartment,
  rowDensity,
  hasProjectsInWorkspace,
  hasActiveFilters,
  canCreateProjects,
  projectUiStates,
  onOpenProject,
  onDeleteProject,
  onPatchProject
}: {
  projects: ProjectSummary[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  viewerDepartment?: Department;
  rowDensity: RowDensity;
  hasProjectsInWorkspace: boolean;
  hasActiveFilters: boolean;
  canCreateProjects: boolean;
  projectUiStates: Record<string, ProjectUiState>;
  onOpenProject: (projectId: string, tab?: ProjectPanelTab) => void;
  onDeleteProject: (project: ProjectSummary) => void;
  onPatchProject: (project: ProjectSummary, patch: ProjectMetadataUpdateInput) => Promise<void>;
}) {
  const canEditProjects = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const canDeleteProjects = viewerDepartment === "Admin";
  const shouldPaginate = totalPages > 1;
  const safeCurrentPage = clamp(currentPage, 1, totalPages);
  const pageStart = totalCount ? (safeCurrentPage - 1) * gridProjectsPerPage : 0;
  const pageEnd = projects.length ? pageStart + projects.length : 0;
  const visibleProjects = projects;
  const paginationItems = shouldPaginate ? buildPaginationItems(totalPages, safeCurrentPage) : [];
  const visibleStartLabel = totalCount && projects.length ? pageStart + 1 : 0;
  const visibleEndLabel = totalCount && projects.length ? pageEnd : 0;

  if (loading && !projects.length) {
    return (
      <div className="rounded-[24px] border border-border bg-surface-muted/20 px-5 py-8 text-sm text-ink/55">
        Loading projects...
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-ink/15 bg-surface-muted/20 px-5 py-8 text-sm text-ink/55">
        {hasProjectsInWorkspace
          ? hasActiveFilters
            ? "No projects match the current filters. Clear the filters or switch views to keep exploring."
            : "No projects match the current workspace view."
          : canCreateProjects
            ? "No projects yet. Create the first one from the quick-add row or the full project form."
            : "No projects are available in this workspace yet."}
      </div>
    );
  }

  return (
    <div className="overflow-hidden border-x border-b border-border bg-white">
      <div className="max-h-[65vh] overflow-auto overscroll-contain">
        <table className="min-w-[1140px] w-full border-collapse tabular-nums">
          <thead>
            <tr className="bg-surface-muted/70 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/60">
              <th className="sticky left-0 top-0 z-30 min-w-[280px] border-b border-r border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">
                Project / Client
              </th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">Current stage</th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">Status</th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">Progress / ETA</th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">Priority</th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">Assigned person</th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 text-right backdrop-blur">Order value</th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">Dispatch date</th>
              <th className="sticky top-0 z-20 border-b border-border bg-surface-muted/95 px-4 py-3 backdrop-blur">Created</th>
              <th className="sticky right-0 top-0 z-30 border-b border-l border-border bg-surface-muted/95 px-4 py-3 text-right backdrop-blur">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((project, index) => {
              const absoluteIndex = pageStart + index;
              const uiState = projectUiStates[project.id] ?? null;
              const isCreating = uiState?.kind === "creating";
              const isBusy = Boolean(uiState);
              const eta = getEta(project);
              const progress = getProgress(project);
              const stickyBackground = absoluteIndex % 2 === 0 ? "bg-white" : "bg-surface-muted/20";

              return (
                <tr
                  key={project.id}
                  onClick={() => {
                    if (!isCreating) {
                      onOpenProject(project.id);
                    }
                  }}
                  className={cn(
                    "group border-b border-ink/5 text-sm text-ink transition",
                    isCreating ? "cursor-default" : "cursor-pointer",
                    absoluteIndex % 2 === 0
                      ? "bg-white hover:bg-surface-muted/35"
                      : "bg-surface-muted/20 hover:bg-surface-muted/35"
                  )}
                >
                  <td
                    className={cn(
                      "sticky left-0 z-10 min-w-[280px] border-r border-border px-4",
                      rowDensityClasses[rowDensity],
                      stickyBackground,
                      "group-hover:bg-surface-muted/35"
                    )}
                  >
                    <EditableProjectIdentityCell
                      disabled={!canEditProjects || isCreating}
                      name={project.name}
                      client={project.client}
                      onSave={(name, client) => onPatchProject(project, { name, client })}
                    />
                  </td>
                  <td className={cn("px-4", rowDensityClasses[rowDensity])}>
                    <div className="space-y-1">
                      <div>{isCreating ? "Creating workflow" : project.current_stage?.name ?? "Completed workflow"}</div>
                      <div className="text-xs text-ink/45">
                        {isCreating
                          ? "Due date will appear after setup"
                          : project.current_stage?.due_date
                          ? `Due ${formatDate(project.current_stage.due_date)}`
                          : "No due date"}
                      </div>
                    </div>
                  </td>
                  <td className={cn("px-4", rowDensityClasses[rowDensity])}>
                    {uiState ? (
                      <span className="inline-flex rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                        {uiState.kind === "creating" ? "Creating" : "Syncing"}
                      </span>
                    ) : (
                      <StatusChip status={project.current_stage?.status ?? "done"} />
                    )}
                  </td>
                  <td className={cn("px-4", rowDensityClasses[rowDensity])}>
                    {uiState ? (
                      <div className="space-y-2">
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-2.5 rounded-full bg-accent/70 transition-all animate-pulse"
                            style={{ width: isCreating ? "32%" : `${Math.max(progress, 55)}%` }}
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="font-semibold text-accent">{uiState.label}</div>
                          <div className="text-ink/50">
                            {isCreating ? "The new row will reconcile automatically." : "Refreshing the latest record state."}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-2.5 w-full rounded-full bg-surface-muted">
                          <div
                            className={cn("h-2.5 rounded-full transition-all", getProgressTone(project.current_stage?.status ?? null))}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-ink/50">
                            {project.completed_stages}/{project.total_stages} stages
                          </span>
                          <span className={cn("font-semibold", eta.tone)}>{eta.label}</span>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className={cn("px-4", rowDensityClasses[rowDensity])}>
                    <EditableSelectCell
                      disabled={!canEditProjects || isCreating}
                      value={project.priority}
                      displayValue={formatPriority(project.priority)}
                      options={[
                        { label: "Normal", value: "normal" },
                        { label: "Accelerated", value: "accelerated" }
                      ]}
                      onSave={(nextValue) => onPatchProject(project, { priority: nextValue as ProjectPriority })}
                    />
                  </td>
                  <td className={cn("px-4", rowDensityClasses[rowDensity])}>
                    <EditableTextCell
                      disabled={!canEditProjects || isCreating}
                      value={project.assigned_person_name ?? ""}
                      emptyLabel="Unassigned"
                      onSave={(nextValue) => onPatchProject(project, { assigned_person_name: nextValue })}
                    />
                  </td>
                  <td className={cn("px-4 text-right", rowDensityClasses[rowDensity])}>
                    <EditableTextCell
                      disabled={!canEditProjects || isCreating}
                      value={
                        project.total_order_value === null || project.total_order_value === undefined
                          ? ""
                          : String(project.total_order_value)
                      }
                      emptyLabel="Not set"
                      align="right"
                      inputMode="decimal"
                      type="number"
                      onSave={(nextValue) =>
                        onPatchProject(project, {
                          total_order_value: nextValue.trim() ? Number(nextValue) : null
                        })
                      }
                      displayFormatter={(value) =>
                        value.trim() ? formatCurrency(Number(value)) : "Not set"
                      }
                    />
                  </td>
                  <td className={cn("px-4", rowDensityClasses[rowDensity])}>
                    <EditableDateCell
                      disabled={!canEditProjects || isCreating}
                      value={project.dispatch_date}
                      emptyLabel="Not set"
                      onSave={(nextValue) => onPatchProject(project, { dispatch_date: nextValue })}
                    />
                  </td>
                  <td className={cn("px-4 text-ink/65", rowDensityClasses[rowDensity])}>{formatDate(project.created_at)}</td>
                  <td
                    className={cn(
                      "sticky right-0 z-10 border-l border-border px-4 text-right",
                      rowDensityClasses[rowDensity],
                      stickyBackground,
                      "group-hover:bg-surface-muted/35"
                    )}
                  >
                    <div className="flex items-center justify-end gap-2 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button
                        type="button"
                        disabled={isCreating}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isCreating) {
                            onOpenProject(project.id);
                          }
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition hover:border-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Open ${project.project_code}`}
                      >
                        <ExpandIcon className="h-4 w-4" />
                      </button>
                      {canDeleteProjects ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isBusy) {
                              onDeleteProject(project);
                            }
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-ink transition hover:border-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Delete ${project.project_code}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shouldPaginate ? (
        <div className="flex flex-col gap-3 border-t border-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink/55">
            Showing {visibleStartLabel}-{visibleEndLabel} of {totalCount} matching rows
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(clamp(safeCurrentPage - 1, 1, totalPages))}
              disabled={safeCurrentPage === 1}
              className="rounded-full border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-surface-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
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
                  onClick={() => onPageChange(item)}
                  className={cn(
                    "min-w-10 rounded-full px-3 py-2 text-sm font-semibold transition",
                    safeCurrentPage === item
                      ? "bg-accent text-white"
                      : "border border-border bg-white text-ink hover:border-accent hover:bg-surface-muted/60"
                  )}
                >
                  {item}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => onPageChange(clamp(safeCurrentPage + 1, 1, totalPages))}
              disabled={safeCurrentPage === totalPages}
              className="rounded-full border border-border bg-white px-3 py-2 text-sm font-medium text-ink transition hover:border-accent hover:bg-surface-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KanbanWorkspaceView({
  buckets,
  onOpenProject
}: {
  buckets: Record<string, ProjectSummary[]>;
  onOpenProject: (projectId: string, tab?: ProjectPanelTab) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {["Costing", "Drawing", "Sampling", "Production", "Completed"].map((bucket) => {
        const items = buckets[bucket] ?? [];

        return (
          <section key={bucket} className="min-w-[280px] flex-1 rounded-[24px] border border-border bg-surface-muted/20 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">{bucket}</h3>
                <p className="text-xs text-ink/45">{items.length} project{items.length === 1 ? "" : "s"}</p>
              </div>
            </div>

            <div className="space-y-3">
              {items.length ? (
                items.map((project) => {
                  const eta = getEta(project);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => onOpenProject(project.id, "pipeline")}
                      className="w-full rounded-[20px] border border-border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                            {project.project_code}
                          </p>
                          <h4 className="mt-1 text-sm font-semibold text-ink">{project.name}</h4>
                          <p className="mt-1 text-xs text-ink/55">{project.client}</p>
                        </div>
                        <StatusChip status={project.current_stage?.status ?? "done"} />
                      </div>

                      <div className="mt-3 space-y-2 text-xs text-ink/55">
                        <div>{project.current_stage?.name ?? "Completed workflow"}</div>
                        <div className={cn("font-semibold", eta.tone)}>{eta.label}</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-white/70 px-4 py-6 text-sm text-ink/45">
                  No projects in this lane.
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CalendarWorkspaceView({
  month,
  onMonthChange,
  calendarDays,
  projectsByDate,
  onOpenProject
}: {
  month: string;
  onMonthChange: (value: string) => void;
  calendarDays: Array<{ key: string; date: Date | null }>;
  projectsByDate: Map<string, ProjectSummary[]>;
  onOpenProject: (projectId: string, tab?: ProjectPanelTab) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink">Due-date calendar</h3>
          <p className="text-sm text-ink/55">Scan active project deadlines by month.</p>
        </div>

        <label className="inline-flex items-center gap-3 rounded-full border border-border bg-surface-muted/35 px-4 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Month</span>
          <input
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
            className="bg-transparent text-sm font-medium text-ink outline-none"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-border">
        <div className="grid grid-cols-7 bg-surface-muted/65 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/50">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <div key={label} className="border-b border-r border-border px-3 py-3 last:border-r-0">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((entry, index) => {
            const items = entry.date ? projectsByDate.get(toDateKey(entry.date)) ?? [] : [];

            return (
              <div
                key={entry.key}
                className={cn(
                  "min-h-[10rem] border-r border-t border-border px-3 py-3",
                  index % 7 === 6 && "border-r-0",
                  !entry.date && "bg-surface-muted/15"
                )}
              >
                {entry.date ? (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{entry.date.getDate()}</span>
                      {items.length ? (
                        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-ink/60">
                          {items.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      {items.slice(0, 3).map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => onOpenProject(project.id, "pipeline")}
                          className="block w-full rounded-xl border border-border bg-white px-2.5 py-2 text-left text-xs transition hover:border-accent hover:bg-surface-muted/35"
                        >
                          <div className="font-semibold text-ink">{project.project_code}</div>
                          <div className="truncate text-ink/60">{project.name}</div>
                        </button>
                      ))}

                      {items.length > 3 ? (
                        <div className="text-xs font-medium text-ink/50">+{items.length - 3} more</div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuickCreateProjectRow({
  viewer,
  onCreateStart,
  onCreated,
  onCreateFailed,
  onUploadComplete,
  onUploadFailed,
  onCancel
}: {
  viewer: ViewerDetails | null;
  onCreateStart: (optimisticId: string, input: ProjectCreateInput) => void;
  onCreated: (
    optimisticId: string,
    project: ProjectDetail,
    options: { uploadPending: boolean; defaultTab: ProjectPanelTab }
  ) => void;
  onCreateFailed: (optimisticId: string, message: string) => void;
  onUploadComplete: (projectId: string, document: ProjectDocument) => void;
  onUploadFailed: (projectId: string) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boqFile, setBoqFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    name: "",
    client: "",
    assigned_person_name: viewer?.fullName ?? "",
    priority: "normal" as ProjectPriority,
    estimated_tat_days: "",
    total_order_value: "",
    dispatch_date: "",
    special_request: ""
  });

  function updateField<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function handleSubmit() {
    setError(null);

    if (!form.name.trim() || !form.client.trim() || !form.assigned_person_name.trim()) {
      setError("Project name, client, and assigned person are required.");
      return;
    }

    if (!form.estimated_tat_days.trim() || !form.total_order_value.trim()) {
      setShowMoreFields(true);
      setError("Add estimated TAT and order value before creating the project.");
      return;
    }

    const payload: ProjectCreateInput = {
      name: form.name.trim(),
      client: form.client.trim(),
      assigned_person_name: form.assigned_person_name.trim(),
      priority: form.priority,
      estimated_tat_days: Number(form.estimated_tat_days),
      total_order_value: Number(form.total_order_value),
      dispatch_date: form.dispatch_date || undefined,
      special_request: form.special_request.trim() || undefined
    };
    const optimisticId = `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onCreateStart(optimisticId, payload);

    startTransition(() => {
      void (async () => {
        try {
          const project = await createProject(payload);

          onCreated(optimisticId, project, {
            uploadPending: Boolean(boqFile),
            defaultTab: "overview"
          });

          if (boqFile) {
            try {
              const uploadedDocument = await uploadProjectDocument(project.id, boqFile, "boq");
              onUploadComplete(project.id, uploadedDocument);
            } catch {
              onUploadFailed(project.id);
            }
          }
        } catch (caughtError) {
          const message = caughtError instanceof Error ? caughtError.message : "Unable to create project.";
          setError(message);
          onCreateFailed(optimisticId, message);
        }
      })();
    });
  }

  return (
    <div className="border-b border-border bg-surface-muted/35 px-4 py-4 sm:px-5">
      <div className="space-y-4 rounded-[24px] border border-border bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Quick add</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Create a project without leaving the grid</h2>
            <p className="mt-1 text-sm text-ink/55">
              Start with the key business fields here, then open the record panel for pipeline and documents.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowMoreFields((current) => !current)}
              className="rounded-full border border-border bg-surface-muted/45 px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-white"
            >
              {showMoreFields ? "Hide more fields" : "More fields"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/60"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_0.85fr]">
          <WorkspaceInput
            label="Project name"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Premium retail fixture rollout"
          />
          <WorkspaceInput
            label="Client"
            value={form.client}
            onChange={(event) => updateField("client", event.target.value)}
            placeholder="Acme Retail"
          />
          <WorkspaceInput
            label="Assigned person"
            value={form.assigned_person_name}
            onChange={(event) => updateField("assigned_person_name", event.target.value)}
            placeholder="Project owner"
          />
          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Priority</span>
            <select
              value={form.priority}
              onChange={(event) => updateField("priority", event.target.value as ProjectPriority)}
              className="w-full rounded-2xl border border-border bg-surface-muted/35 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            >
              <option value="normal">Normal</option>
              <option value="accelerated">Accelerated</option>
            </select>
          </label>
        </div>

        {showMoreFields ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <WorkspaceInput
              label="Estimated TAT (days)"
              value={form.estimated_tat_days}
              onChange={(event) => updateField("estimated_tat_days", event.target.value)}
              placeholder="21"
              type="number"
              min={1}
            />
            <WorkspaceInput
              label="Total order value (INR)"
              value={form.total_order_value}
              onChange={(event) => updateField("total_order_value", event.target.value)}
              placeholder="250000"
              type="number"
              min={0}
              step="0.01"
            />
            <WorkspaceInput
              label="Dispatch date"
              value={form.dispatch_date}
              onChange={(event) => updateField("dispatch_date", event.target.value)}
              placeholder=""
              type="date"
            />

            <label className="space-y-2 lg:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Special request</span>
              <textarea
                value={form.special_request}
                onChange={(event) => updateField("special_request", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-border bg-surface-muted/35 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                placeholder="Optional rollout note, packaging instruction, or urgency reason."
              />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">BOQ upload</span>
              <div className="rounded-[20px] border border-dashed border-ink/15 bg-surface-muted/35 px-4 py-4">
                <input
                  type="file"
                  accept={acceptedDocumentTypes}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setBoqFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-accent/90"
                />
                <p className="mt-3 text-xs text-ink/45">
                  Optional. Add the first BOQ here, or upload it later from the project panel.
                </p>
                {boqFile ? <p className="mt-2 text-sm font-medium text-ink/70">{boqFile.name}</p> : null}
              </div>
            </label>
          </div>
        ) : null}

        {error ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Creating..." : "Create project"}
          </button>
          <span className="text-xs text-ink/45">
            Required for creation: project name, client, assigned person, TAT, and order value.
          </span>
        </div>
      </div>
    </div>
  );
}

function WorkspaceInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  step
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: "text" | "number" | "date";
  min?: number;
  step?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-border bg-surface-muted/35 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
      />
    </label>
  );
}

function EditableProjectIdentityCell({
  disabled,
  name,
  client,
  onSave
}: {
  disabled: boolean;
  name: string;
  client: string;
  onSave: (name: string, client: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftClient, setDraftClient] = useState(client);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraftName(name);
      setDraftClient(client);
      setError(null);
    }
  }, [client, editing, name]);

  useEffect(() => {
    if (editing) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const nextName = draftName.trim();
    const nextClient = draftClient.trim();

    if (!nextName || !nextClient) {
      setError("Project name and client are required.");
      return;
    }

    setEditing(false);
    setError(null);

    if (nextName === name && nextClient === client) {
      return;
    }

    void onSave(nextName, nextClient);
  };

  const cancel = () => {
    setDraftName(name);
    setDraftClient(client);
    setError(null);
    setEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  if (editing && !disabled) {
    return (
      <div
        onClick={(event) => event.stopPropagation()}
        className="space-y-2 rounded-2xl border border-border bg-white p-3 shadow-sm"
      >
        <input
          ref={nameInputRef}
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Project name"
          className="w-full rounded-xl border border-border bg-surface-muted/20 px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-accent"
        />
        <input
          value={draftClient}
          onChange={(event) => setDraftClient(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Client"
          className="w-full rounded-xl border border-border bg-surface-muted/20 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
        />

        {error ? <p className="text-xs text-ink">{error}</p> : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={commit}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90"
          >
            Save
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/35"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="space-y-2">
        <div className="font-semibold text-ink">{name}</div>
        <div className="text-xs text-ink/55">{client}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      className="block w-full rounded-2xl border border-transparent px-3 py-2 text-left transition hover:border-border hover:bg-white"
    >
      <div className="font-semibold text-ink">{name}</div>
      <div className="text-xs text-ink/55">{client}</div>
    </button>
  );
}

function EditableSelectCell({
  disabled,
  value,
  displayValue,
  options,
  onSave
}: {
  disabled: boolean;
  value: string;
  displayValue: string;
  options: Array<{ label: string; value: string }>;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return editing && !disabled ? (
    <select
      autoFocus
      defaultValue={value}
      onClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        const nextValue = event.currentTarget.value;
        setEditing(false);
        if (nextValue !== value) {
          startTransition(() => {
            void onSave(nextValue);
          });
        }
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setEditing(false);
        if (nextValue !== value) {
          startTransition(() => {
            void onSave(nextValue);
          });
        }
      }}
      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ) : (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          setEditing(true);
        }
      }}
      className={cn(
        "rounded-xl px-3 py-2 text-left text-sm transition",
        disabled
          ? "cursor-default bg-transparent text-ink/70"
          : "border border-transparent bg-surface-muted/45 text-ink hover:border-border hover:bg-white"
      )}
    >
      {pending ? "Saving..." : displayValue}
    </button>
  );
}

function EditableTextCell({
  disabled,
  value,
  emptyLabel,
  onSave,
  type = "text",
  inputMode = "text",
  align = "left",
  displayFormatter
}: {
  disabled: boolean;
  value: string;
  emptyLabel: string;
  onSave: (value: string) => Promise<void>;
  type?: "text" | "number";
  inputMode?: "text" | "decimal";
  align?: "left" | "right";
  displayFormatter?: (value: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const displayValue = draft.trim()
    ? displayFormatter
      ? displayFormatter(draft)
      : draft
    : emptyLabel;

  const commit = () => {
    const nextValue = draft.trim();
    setEditing(false);

    if (nextValue === value.trim()) {
      return;
    }

    startTransition(() => {
      void onSave(type === "number" ? draft : nextValue);
    });
  };

  if (editing && !disabled) {
    return (
      <input
        ref={inputRef}
        type={type}
        inputMode={inputMode}
        value={draft}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className={cn(
          "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent",
          align === "right" && "text-right"
        )}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          setEditing(true);
        }
      }}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-sm transition",
        align === "right" ? "text-right" : "text-left",
        disabled
          ? "cursor-default bg-transparent text-ink/70"
          : "border border-transparent bg-surface-muted/45 text-ink hover:border-border hover:bg-white"
      )}
    >
      {pending ? "Saving..." : displayValue}
    </button>
  );
}

function EditableDateCell({
  disabled,
  value,
  emptyLabel,
  onSave
}: {
  disabled: boolean;
  value: string | null;
  emptyLabel: string;
  onSave: (value: string | null) => Promise<void>;
}) {
  const normalizedValue = value ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(normalizedValue);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(normalizedValue);
    }
  }, [editing, normalizedValue]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  const commit = () => {
    const nextValue = draft.trim();
    setEditing(false);

    if (nextValue === normalizedValue) {
      return;
    }

    startTransition(() => {
      void onSave(nextValue || null);
    });
  };

  const cancel = () => {
    setDraft(normalizedValue);
    setEditing(false);
  };

  if (editing && !disabled) {
    return (
      <div
        onClick={(event) => event.stopPropagation()}
        className="space-y-2 rounded-2xl border border-border bg-white p-3 shadow-sm"
      >
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className="w-full rounded-xl border border-border bg-surface-muted/20 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={commit}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setDraft("")}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/35"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:bg-surface-muted/35"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          setEditing(true);
        }
      }}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-left text-sm transition",
        disabled
          ? "cursor-default bg-transparent text-ink/70"
          : "border border-transparent bg-surface-muted/45 text-ink hover:border-border hover:bg-white"
      )}
    >
      {pending ? "Saving..." : normalizedValue ? formatDate(normalizedValue) : emptyLabel}
    </button>
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/60 px-4 py-6 backdrop-blur-sm sm:items-center">
      <button type="button" onClick={onClose} className="absolute inset-0" aria-label="Close delete dialog" />

      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-[32px] border border-border bg-white text-ink shadow-2xl">
        <div className="border-b border-border bg-surface-muted/70 px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-muted text-ink/70">
              <WarningIcon className="h-6 w-6" />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">
                Destructive action
              </p>
              <h3 className="text-2xl font-semibold text-ink">Delete this project permanently?</h3>
              <p className="text-sm leading-6 text-ink/65">
                This will remove <span className="font-semibold text-ink">{project.project_code}</span> from the
                shared workspace for every team.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="grid gap-3 rounded-[24px] border border-border bg-surface-muted/35 p-4 sm:grid-cols-2">
            <ProjectInfoTile label="Project" value={project.name} />
            <ProjectInfoTile label="Code" value={project.project_code} />
            <ProjectInfoTile label="Client" value={project.client} />
            <ProjectInfoTile label="Current stage" value={project.current_stage?.name ?? "Completed workflow"} />
          </div>

          <div className="rounded-[24px] border border-border bg-surface-muted px-4 py-4 text-sm leading-7 text-ink/80">
            Deleting this project will permanently remove its workflow stages, comments, uploaded documents, and
            linked audit records. This action cannot be undone.
          </div>

          {error ? (
            <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{error}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Keep project
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="space-y-1 rounded-2xl border border-border bg-white px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</p>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

