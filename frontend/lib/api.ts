import { createBrowserSupabaseClient } from "@/lib/supabase";
import type {
  Comment,
  DashboardSummary,
  ProjectCreateInput,
  ProjectDetail,
  ProjectSummary,
  WorkflowStageSetting,
  WorkflowStageSettingUpdateInput
} from "@/lib/types";

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function getBrowserAccessToken() {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token;
  } catch {
    return undefined;
  }
}

async function getApiErrorMessage(response: Response) {
  const fallback = `API request failed with status ${response.status}`;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();

      if (typeof payload?.detail === "string") {
        return payload.detail;
      }

      if (typeof payload?.message === "string") {
        return payload.message;
      }

      if (payload) {
        return JSON.stringify(payload);
      }
    } catch {
      return fallback;
    }
  }

  const message = await response.text();
  return message || fallback;
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const token = accessToken ?? (await getBrowserAccessToken());
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export function listProjects(accessToken?: string) {
  return apiFetch<ProjectSummary[]>("/api/v1/projects", {}, accessToken);
}

export function getProject(projectId: string, accessToken?: string) {
  return apiFetch<ProjectDetail>(`/api/v1/projects/${projectId}`, {}, accessToken);
}

export function getDashboardSummary(accessToken?: string) {
  return apiFetch<DashboardSummary>("/api/v1/dashboard/summary", {}, accessToken);
}

export function listWorkflowSettings(accessToken?: string) {
  return apiFetch<WorkflowStageSetting[]>("/api/v1/workflow-settings", {}, accessToken);
}

export function updateWorkflowSettings(
  settings: WorkflowStageSettingUpdateInput[],
  accessToken?: string
) {
  return apiFetch<WorkflowStageSetting[]>(
    "/api/v1/workflow-settings",
    {
      method: "PUT",
      body: JSON.stringify({ settings })
    },
    accessToken
  );
}

export function createProject(input: ProjectCreateInput, accessToken?: string) {
  return apiFetch<ProjectDetail>(
    "/api/v1/projects",
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    accessToken
  );
}

export function completeStage(stageId: string, accessToken?: string) {
  return apiFetch<ProjectDetail>(
    `/api/v1/stages/${stageId}/complete`,
    {
      method: "PATCH"
    },
    accessToken
  );
}

export function setStageDueDate(stageId: string, dueDate: string, accessToken?: string) {
  return apiFetch<ProjectDetail>(
    `/api/v1/stages/${stageId}/due-date`,
    {
      method: "PATCH",
      body: JSON.stringify({ due_date: dueDate })
    },
    accessToken
  );
}

export function createComment(stageId: string, text: string, accessToken?: string) {
  return apiFetch<Comment>(
    `/api/v1/stages/${stageId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ text })
    },
    accessToken
  );
}

export async function downloadProjectsCsv(accessToken?: string) {
  const token = accessToken ?? (await getBrowserAccessToken());
  const response = await fetch(`${getApiBaseUrl()}/api/v1/projects/export/csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return response.blob();
}
