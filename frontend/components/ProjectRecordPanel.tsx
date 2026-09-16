"use client";

import { useEffect, useMemo, useState } from "react";

import { PipelineView } from "@/components/PipelineView";
import { ProjectDocumentsPanel } from "@/components/ProjectDocumentsPanel";
import { ProjectOverviewPanel } from "@/components/ProjectOverviewPanel";
import { Skeleton } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import type { Department, ProjectDetail, ProjectDocument } from "@/lib/types";
import { formatDate, formatPriority } from "@/lib/utils";

export type ProjectPanelTab = "overview" | "pipeline" | "documents";

export function ProjectRecordPanel({
  open,
  project,
  projectId,
  viewerDepartment,
  viewerName,
  defaultTab = "overview",
  projectSyncLabel,
  uploadFailed = false,
  error,
  onClose,
  onProjectChange,
  onDocumentUpload,
  onProjectSyncStateChange
}: {
  open: boolean;
  project: ProjectDetail | null;
  projectId: string | null;
  viewerDepartment?: Department | null;
  viewerName?: string | null;
  defaultTab?: ProjectPanelTab;
  projectSyncLabel?: string | null;
  uploadFailed?: boolean;
  error?: string | null;
  onClose: () => void;
  onProjectChange?: (project: ProjectDetail) => void;
  onDocumentUpload?: (projectId: string, document: ProjectDocument) => void;
  onProjectSyncStateChange?: (projectId: string, label: string | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<ProjectPanelTab>(defaultTab);
  const [panelProject, setPanelProject] = useState<ProjectDetail | null>(project);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, projectId]);

  useEffect(() => {
    if (!open || !projectId) {
      setPanelProject(null);
      return;
    }

    if (project && project.id === projectId) {
      setPanelProject(project);
      return;
    }

    setPanelProject((current) => (current?.id === projectId ? current : null));
  }, [open, project, projectId]);

  const liveStage = useMemo(
    () => panelProject?.stages.find((stage) => stage.status === "active" || stage.status === "overdue") ?? null,
    [panelProject]
  );

  const handleProjectUpdate = (updatedProject: ProjectDetail) => {
    setPanelProject(updatedProject);
    onProjectChange?.(updatedProject);
  };

  const handleDocumentUpload = (document: ProjectDocument) => {
    setPanelProject((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        documents: [document, ...current.documents.filter((entry) => entry.id !== document.id)]
      };
    });
    if (projectId) {
      onDocumentUpload?.(projectId, document);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/45 backdrop-blur-sm">
      <button type="button" aria-label="Close project panel" className="flex-1" onClick={onClose} />

      <aside className="relative h-full w-full max-w-[min(46rem,100vw)] overflow-hidden border-l border-border bg-surface-muted shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="border-b border-border bg-white/90 px-5 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                {panelProject ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/65">
                        {panelProject.project_code}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          panelProject.priority === "accelerated"
                            ? "border border-border bg-white text-ink"
                            : "bg-surface-muted text-ink/65"
                        }`}
                      >
                        {formatPriority(panelProject.priority)}
                      </span>
                      {liveStage ? <StatusChip status={liveStage.status} /> : null}
                    </div>
                    <div>
                      <h2 className="truncate text-2xl font-semibold text-ink">{panelProject.name}</h2>
                      <p className="truncate text-sm text-ink/55">{panelProject.client}</p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-ink/50">
                      <span>Created {formatDate(panelProject.created_at)}</span>
                      <span>
                        Current owner: {liveStage?.responsible_dept ?? "Completed workflow"}
                      </span>
                      <span>Due: {formatDate(liveStage?.due_date ?? null)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/65">
                      Project
                    </span>
                    <div>
                      <h2 className="text-2xl font-semibold text-ink">Project workspace</h2>
                      <p className="text-sm text-ink/55">
                        {error ?? "This project could not be loaded in the side panel."}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(["overview", "pipeline", "documents"] as ProjectPanelTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab
                      ? "bg-accent text-white"
                      : "border border-border bg-surface-muted/45 text-ink hover:border-accent hover:bg-white"
                  }`}
                >
                  {tab === "overview" ? "Overview" : tab === "pipeline" ? "Pipeline" : "Documents"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            {projectSyncLabel ? (
              <div className="mb-4 rounded-2xl border border-accent/15 bg-accent/5 px-4 py-3 text-sm text-accent">
                {projectSyncLabel}
              </div>
            ) : null}

            {uploadFailed ? (
              <p className="mb-4 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">
                Project created successfully, but the BOQ upload did not finish. Use the Documents tab to upload it.
              </p>
            ) : null}

            {error && !project ? (
              <div className="rounded-[28px] border border-border bg-white px-5 py-6 text-sm text-ink shadow-panel">
                {error}
              </div>
            ) : null}

            {!panelProject && !error ? (
              <div className="space-y-4 rounded-[28px] border border-border bg-white px-5 py-6 shadow-panel">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
                <Skeleton className="h-28" />
                <Skeleton className="h-40" />
              </div>
            ) : null}

            {panelProject ? (
              activeTab === "overview" ? (
                <ProjectOverviewPanel
                  project={panelProject}
                  viewerDepartment={viewerDepartment}
                  onProjectChange={handleProjectUpdate}
                />
              ) : activeTab === "pipeline" ? (
                <PipelineView
                  project={panelProject}
                  viewerDepartment={viewerDepartment ?? undefined}
                  viewerName={viewerName}
                  onProjectChange={handleProjectUpdate}
                  onProjectSyncStateChange={onProjectSyncStateChange}
                />
              ) : (
                <ProjectDocumentsPanel
                  projectId={panelProject.id}
                  documents={panelProject.documents}
                  viewerDepartment={viewerDepartment ?? undefined}
                  onDocumentUpload={handleDocumentUpload}
                />
              )
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
