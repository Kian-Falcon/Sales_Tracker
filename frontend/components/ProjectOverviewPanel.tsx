"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { useToast } from "@/components/ToastProvider";
import { updateProjectMetadata } from "@/lib/api";
import type { Department, ProjectDetail, ProjectPriority } from "@/lib/types";
import { formatCurrency, formatDate, formatPriority } from "@/lib/utils";

type FormState = {
  name: string;
  client: string;
  assigned_person_name: string;
  priority: ProjectPriority;
  estimated_tat_days: string;
  total_order_value: string;
  special_request: string;
};

function buildFormState(project: ProjectDetail): FormState {
  return {
    name: project.name,
    client: project.client,
    assigned_person_name: project.assigned_person_name ?? "",
    priority: project.priority,
    estimated_tat_days:
      project.estimated_tat_days !== null && project.estimated_tat_days !== undefined
        ? String(project.estimated_tat_days)
        : "",
    total_order_value:
      project.total_order_value !== null && project.total_order_value !== undefined
        ? String(project.total_order_value)
        : "",
    special_request: project.special_request ?? ""
  };
}

export function ProjectOverviewPanel({
  project: initialProject,
  viewerDepartment,
  onProjectChange
}: {
  project: ProjectDetail;
  viewerDepartment?: Department | null;
  onProjectChange?: (project: ProjectDetail) => void;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [form, setForm] = useState<FormState>(() => buildFormState(initialProject));
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    setProject(initialProject);
    setForm(buildFormState(initialProject));
  }, [initialProject]);

  const canEdit = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const hasMissingDetails = project.estimated_tat_days === null || project.total_order_value === null;

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Project name is required.");
      return;
    }

    if (!form.client.trim()) {
      setError("Client is required.");
      return;
    }

    if (!form.assigned_person_name.trim()) {
      setError("Assigned person is required.");
      return;
    }

    setError(null);
    setMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          const updatedProject = await updateProjectMetadata(project.id, {
            name: form.name.trim(),
            client: form.client.trim(),
            assigned_person_name: form.assigned_person_name.trim(),
            priority: form.priority,
            estimated_tat_days: form.estimated_tat_days ? Number(form.estimated_tat_days) : null,
            total_order_value: form.total_order_value ? Number(form.total_order_value) : null,
            special_request: form.special_request.trim() || null
          });

          setProject(updatedProject);
          setForm(buildFormState(updatedProject));
          setEditorOpen(false);
          setMessage("Project details updated.");
          onProjectChange?.(updatedProject);
          pushToast({
            tone: "success",
            title: "Project updated",
            description: "The record fields were saved successfully."
          });
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to update this project.");
        }
      })();
    });
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-border bg-white shadow-panel">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Record fields</p>
          <h2 className="text-xl font-semibold text-ink">Project details</h2>
          <p className="max-w-2xl text-sm text-ink/55">
            Review the business context for this workflow and update the editable fields without leaving the record
            panel.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                setEditorOpen((value) => !value);
                setError(null);
                setMessage(null);
                setForm(buildFormState(project));
              }}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
            >
              {editorOpen ? "Hide editor" : hasMissingDetails ? "Add missing details" : "Edit fields"}
            </button>
          ) : null}
          <div className="text-sm text-ink/55">Created {formatDate(project.created_at)}</div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        {message ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{message}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailCard label="Project name" value={project.name} />
          <DetailCard label="Client" value={project.client} />
          <DetailCard label="Assigned person" value={project.assigned_person_name ?? "Unassigned"} />
          <DetailCard label="Priority" value={formatPriority(project.priority)} />
          <DetailCard
            label="Estimated TAT"
            value={project.estimated_tat_days ? `${project.estimated_tat_days} days` : "Not set"}
            muted={!project.estimated_tat_days}
          />
          <DetailCard
            label="Total order value"
            value={formatCurrency(project.total_order_value)}
            muted={project.total_order_value === null || project.total_order_value === undefined}
          />
          <DetailCard label="Created by" value={project.created_by_name ?? "Workflow user"} />
          <DetailCard
            label="Department"
            value={project.created_by_department ?? "Not captured"}
            muted={!project.created_by_department}
          />
          <DetailCard label="Created on" value={formatDate(project.created_at)} />
        </div>

        <div className="rounded-[24px] border border-border bg-surface-muted/30 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Special request</p>
          <p className="mt-2 text-sm leading-6 text-ink/75">
            {project.special_request?.trim() ? project.special_request : "No special request has been recorded."}
          </p>
        </div>

        {canEdit && editorOpen ? (
          <form onSubmit={handleSubmit} className="rounded-[24px] border border-border bg-surface-muted/20 p-5 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Edit mode</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">Update project fields</h3>
              <p className="mt-2 max-w-2xl text-sm text-ink/60">
                Keep the project identity, ownership, timeline, value, and special instructions current for the next
                team in the workflow.
              </p>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <Field
                label="Project name"
                value={form.name}
                onChange={(value) => updateField("name", value)}
                placeholder="Premium retail fixture rollout"
              />
              <Field
                label="Client"
                value={form.client}
                onChange={(value) => updateField("client", value)}
                placeholder="Acme Retail"
              />
              <Field
                label="Assigned person"
                value={form.assigned_person_name}
                onChange={(value) => updateField("assigned_person_name", value)}
                placeholder="Project owner or account manager"
              />

              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink/70">Priority</span>
                <select
                  value={form.priority}
                  onChange={(event) => updateField("priority", event.target.value as ProjectPriority)}
                  className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent"
                >
                  <option value="normal">Normal</option>
                  <option value="accelerated">Accelerated (high)</option>
                </select>
              </label>

              <Field
                label="Estimated TAT (days)"
                value={form.estimated_tat_days}
                onChange={(value) => updateField("estimated_tat_days", value)}
                placeholder="21"
                required={false}
                type="number"
                inputMode="numeric"
                min={1}
              />
              <Field
                label="Total order value (INR)"
                value={form.total_order_value}
                onChange={(value) => updateField("total_order_value", value)}
                placeholder="250000"
                required={false}
                type="number"
                step="0.01"
                inputMode="decimal"
                min={0}
              />

              <label className="block space-y-2 lg:col-span-2">
                <span className="text-sm font-medium text-ink/70">Special request</span>
                <textarea
                  value={form.special_request}
                  onChange={(event) => updateField("special_request", event.target.value)}
                  placeholder="Optional client note, fast-track request, packaging instruction, or rollout constraint."
                  rows={4}
                  className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent"
                />
              </label>
            </div>

            {error ? <p className="mt-5 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{error}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pending ? "Saving..." : "Save details"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditorOpen(false);
                  setError(null);
                  setForm(buildFormState(project));
                }}
                disabled={pending}
                className="rounded-full border border-border px-5 py-3 text-sm font-semibold text-ink transition hover:border-accent hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  required = true,
  type = "text",
  step,
  inputMode,
  min
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "number";
  step?: string;
  inputMode?: "text" | "numeric" | "decimal";
  min?: number;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-ink/70">{label}</span>
      <input
        required={required}
        type={type}
        step={step}
        inputMode={inputMode}
        min={type === "number" ? min ?? 0 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-accent"
      />
    </label>
  );
}

function DetailCard({
  label,
  value,
  muted = false
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-[22px] border border-border px-4 py-4 ${muted ? "bg-surface-muted" : "bg-surface-muted/35"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className={`mt-2 text-sm font-semibold ${muted ? "text-ink/70" : "text-ink"}`}>{value}</div>
    </div>
  );
}
