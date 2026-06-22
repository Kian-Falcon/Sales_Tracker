"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { updateProjectMetadata } from "@/lib/api";
import type { Department, ProjectDetail, ProjectPriority } from "@/lib/types";
import { formatCurrency, formatDate, formatPriority } from "@/lib/utils";

type FormState = {
  assigned_person_name: string;
  priority: ProjectPriority;
  estimated_tat_days: string;
  total_order_value: string;
  number_of_stores: string;
  special_request: string;
};

function buildFormState(project: ProjectDetail): FormState {
  return {
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
    number_of_stores:
      project.number_of_stores !== null && project.number_of_stores !== undefined
        ? String(project.number_of_stores)
        : "",
    special_request: project.special_request ?? ""
  };
}

export function ProjectOverviewPanel({
  project: initialProject,
  viewerDepartment
}: {
  project: ProjectDetail;
  viewerDepartment?: Department | null;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [form, setForm] = useState<FormState>(() => buildFormState(initialProject));
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProject(initialProject);
    setForm(buildFormState(initialProject));
  }, [initialProject]);

  const canEdit = viewerDepartment === "Sales" || viewerDepartment === "Admin";
  const hasMissingDetails =
    project.estimated_tat_days === null ||
    project.total_order_value === null ||
    project.number_of_stores === null;

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
            assigned_person_name: form.assigned_person_name.trim(),
            priority: form.priority,
            estimated_tat_days: form.estimated_tat_days ? Number(form.estimated_tat_days) : null,
            total_order_value: form.total_order_value ? Number(form.total_order_value) : null,
            number_of_stores: form.number_of_stores ? Number(form.number_of_stores) : null,
            special_request: form.special_request.trim() || null
          });

          setProject(updatedProject);
          setForm(buildFormState(updatedProject));
          setEditorOpen(false);
          setMessage("Project details updated.");
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to update this project.");
        }
      })();
    });
  };

  return (
    <section className="rounded-[32px] bg-white p-8 shadow-panel">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink/70">
              {project.project_code}
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                project.priority === "accelerated" ? "bg-ember/10 text-ember" : "bg-pine/10 text-pine"
              }`}
            >
              {formatPriority(project.priority)}
            </span>
          </div>
          <div>
            <h1 className="text-4xl font-semibold text-ink">{project.name}</h1>
            <p className="text-sm text-ink/60">
              {project.client}
              {project.brand ? ` - ${project.brand}` : ""}
            </p>
            <p className="mt-2 text-sm text-ink/50">
              Created by {project.created_by_name ?? "Workflow user"}
              {project.created_by_department ? ` | ${project.created_by_department}` : ""}
            </p>
          </div>
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
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-gold hover:text-pine"
            >
              {editorOpen ? "Hide editor" : hasMissingDetails ? "Add missing details" : "Edit details"}
            </button>
          ) : null}
          <div className="text-sm text-ink/55">Created {formatDate(project.created_at)}</div>
        </div>
      </div>

      {message ? <p className="mt-6 rounded-2xl bg-pine/10 px-4 py-3 text-sm text-pine">{message}</p> : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailCard label="Assigned person" value={project.assigned_person_name ?? "Unassigned"} />
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
        <DetailCard
          label="Number of stores"
          value={project.number_of_stores ? String(project.number_of_stores) : "Not set"}
          muted={!project.number_of_stores}
        />
        <DetailCard label="Priority" value={formatPriority(project.priority)} />
      </div>

      {project.special_request ? (
        <div className="mt-6 rounded-[24px] border border-ink/10 bg-sand/35 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">Special request</p>
          <p className="mt-2 text-sm leading-6 text-ink/75">{project.special_request}</p>
        </div>
      ) : null}

      {canEdit && editorOpen ? (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-[28px] border border-ink/10 bg-sand/25 p-5 shadow-sm"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">Project intake details</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Fill or revise the missing values</h2>
              <p className="mt-2 max-w-2xl text-sm text-ink/60">
                Keep the assigned owner, TAT, order value, store count, and any special instruction current for the
                teams following this project.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
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
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
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

            <Field
              label="Number of stores"
              value={form.number_of_stores}
              onChange={(value) => updateField("number_of_stores", value)}
              placeholder="48"
              required={false}
              type="number"
              inputMode="numeric"
              min={1}
            />

            <label className="block space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-ink/70">Special request</span>
              <textarea
                value={form.special_request}
                onChange={(event) => updateField("special_request", event.target.value)}
                placeholder="Optional client note, fast-track request, packaging instruction, or rollout constraint."
                rows={4}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
              />
            </label>
          </div>

          {error ? <p className="mt-5 rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-70"
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
              className="rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
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
        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-gold"
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
    <div className={`rounded-[24px] border border-ink/10 px-4 py-4 ${muted ? "bg-gold/10" : "bg-sand/35"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className={`mt-2 text-sm font-semibold ${muted ? "text-ink/70" : "text-ink"}`}>{value}</div>
    </div>
  );
}
