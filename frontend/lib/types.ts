export type Department =
  | "Sales"
  | "R&D"
  | "Production"
  | "Procurement"
  | "QC"
  | "Dispatch"
  | "Admin";

export interface ViewerDetails {
  id: string;
  email: string;
  fullName: string;
  department: Department | null;
}

export type StagePhase = "costing" | "drawing" | "sampling" | "production";
export type StageStatus = "pending" | "active" | "overdue" | "done";

export interface Comment {
  id: string;
  stage_id: string;
  user_id: string;
  department: Department;
  author_name: string;
  text: string;
  created_at: string;
}

export interface Stage {
  id: string;
  project_id: string;
  stage_key: string;
  phase: StagePhase;
  name: string;
  responsible_dept: Department;
  status: StageStatus;
  activated_at: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
  comments: Comment[];
}

export interface StageSnapshot {
  id: string;
  name: string;
  phase: StagePhase;
  responsible_dept: Department;
  status: StageStatus;
  activated_at: string | null;
  due_date: string | null;
}

export interface ProjectSummary {
  id: string;
  project_code: string;
  name: string;
  client: string;
  brand: string | null;
  created_at: string;
  is_archived: boolean;
  current_stage: StageSnapshot | null;
}

export interface ProjectDetail {
  id: string;
  project_code: string;
  name: string;
  client: string;
  brand: string | null;
  created_by: string | null;
  created_at: string;
  is_archived: boolean;
  stages: Stage[];
}

export interface DashboardSummary {
  total_projects: number;
  active_stages: number;
  overdue_stages: number;
  completed_stages: number;
}

export interface ProjectCreateInput {
  project_code: string;
  name: string;
  client: string;
  brand?: string;
}

export interface WorkflowStageSetting {
  stage_key: string;
  phase: StagePhase;
  name: string;
  responsible_dept: Department;
  sort_order: number;
  default_due_days: number | null;
  updated_at: string | null;
}

export interface WorkflowStageSettingUpdateInput {
  stage_key: string;
  responsible_dept: Department;
  default_due_days: number | null;
}
