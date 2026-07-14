export type Department =
  | "Sales"
  | "R&D"
  | "Production"
  | "Procurement"
  | "QC"
  | "Dispatch"
  | "Admin";

export type ProjectPriority = "normal" | "accelerated";
export type ProjectDocumentType = "boq" | "attachment";

export interface ViewerDetails {
  id: string;
  email: string;
  fullName: string;
  department: Department | null;
}

export interface MentionableUser {
  id: string;
  display_name: string;
  email: string;
  department: Department;
}

export type StagePhase = "costing" | "drawing" | "sampling" | "production";
export type StageStatus = "pending" | "active" | "overdue" | "done";
export type DueDateRequestStatus = "pending" | "approved" | "rejected";

export interface Comment {
  id: string;
  stage_id: string;
  user_id: string;
  department: Department;
  author_name: string;
  text: string;
  created_at: string;
}

export interface StageDueDateRequest {
  id: string;
  stage_id: string;
  requested_by: string;
  requested_by_department: Department;
  requestor_name: string | null;
  current_due_date: string | null;
  requested_due_date: string;
  reason: string;
  status: DueDateRequestStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
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
  due_date_requests: StageDueDateRequest[];
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
  assigned_person_name: string | null;
  priority: ProjectPriority;
  estimated_tat_days: number | null;
  total_order_value: number | null;
  number_of_stores: number | null;
  created_at: string;
  is_archived: boolean;
  current_stage: StageSnapshot | null;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  document_type: ProjectDocumentType;
  file_name: string;
  content_type: string;
  file_size: number;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  download_url: string | null;
  created_at: string;
}

export interface ProjectDetail {
  id: string;
  project_code: string;
  name: string;
  client: string;
  brand: string | null;
  assigned_person_name: string | null;
  priority: ProjectPriority;
  estimated_tat_days: number | null;
  total_order_value: number | null;
  number_of_stores: number | null;
  special_request: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_by_department: Department | null;
  created_at: string;
  is_archived: boolean;
  documents: ProjectDocument[];
  stages: Stage[];
}

export interface DashboardSummary {
  total_projects: number;
  active_stages: number;
  overdue_stages: number;
  completed_stages: number;
}

export interface MonthlyReportOverview {
  projects_in_scope: number;
  projects_created: number;
  active_projects: number;
  overdue_projects: number;
  completed_projects: number;
  stages_completed: number;
  overdue_events: number;
  comments_logged: number;
  total_pipeline_value: number;
  stores_in_scope: number;
}

export interface MonthlyDepartmentReportRow {
  department: Department;
  total_stages: number;
  completed_total: number;
  completed_this_month: number;
  active_now: number;
  overdue_now: number;
  pending_now: number;
  completion_rate: number;
  avg_completion_days: number | null;
  avg_delay_days: number | null;
}

export interface MonthlyProjectReportRow {
  project_id: string;
  project_code: string;
  project_name: string;
  client: string;
  brand: string | null;
  priority: ProjectPriority;
  assigned_person_name: string | null;
  total_order_value: number | null;
  number_of_stores: number | null;
  created_at: string;
  status_label: string;
  current_stage_name: string | null;
  current_stage_department: Department | null;
  current_stage_status: StageStatus | null;
  current_stage_due_date: string | null;
  total_stages: number;
  completed_stages: number;
  active_stages: number;
  overdue_stages: number;
  pending_stages: number;
  completed_this_month: number;
  completion_rate: number;
  current_delay_days: number | null;
}

export interface MonthlyReportTrendPoint {
  label: string;
  period_start: string;
  period_end: string;
  projects_created: number;
  stages_completed: number;
  overdue_events: number;
  comments_logged: number;
}

export interface MonthlyAuditEvent {
  event_id: string;
  changed_at: string;
  project_id: string;
  project_code: string;
  project_name: string;
  stage_name: string | null;
  event_type: string;
  actor_name: string;
  actor_email: string | null;
  details: string;
}

export interface MonthlyReport {
  month: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  overview: MonthlyReportOverview;
  departments: MonthlyDepartmentReportRow[];
  projects: MonthlyProjectReportRow[];
  trends: MonthlyReportTrendPoint[];
  audit_events: MonthlyAuditEvent[];
}

export interface ProjectCreateInput {
  name: string;
  client: string;
  assigned_person_name: string;
  priority: ProjectPriority;
  estimated_tat_days: number;
  total_order_value: number;
  special_request?: string;
}

export interface ProjectMetadataUpdateInput {
  assigned_person_name: string;
  priority: ProjectPriority;
  estimated_tat_days: number | null;
  total_order_value: number | null;
  special_request?: string | null;
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
