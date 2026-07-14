"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";

import { createProject, uploadProjectDocument } from "@/lib/api";
import type { ProjectPriority, ViewerDetails } from "@/lib/types";

type FormState = {
  name: string;
  client: string;
  brand: string;
  assigned_person_name: string;
  priority: ProjectPriority;
  estimated_tat_days: string;
  total_order_value: string;
  number_of_stores: string;
  special_request: string;
};

const acceptedDocumentTypes = ".pdf,.csv,.xls,.xlsx,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg";

export function NewProjectForm({ viewer }: { viewer: ViewerDetails | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    client: "",
    brand: "",
    assigned_person_name: viewer?.fullName ?? "",
    priority: "normal",
    estimated_tat_days: "",
    total_order_value: "",
    number_of_stores: "",
    special_request: ""
  });
  const [boqFile, setBoqFile] = useState<File | null>(null);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBoqFile(event.target.files?.[0] ?? null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        try {
          const project = await createProject({
            name: form.name.trim(),
            client: form.client.trim(),
            brand: form.brand.trim() || undefined,
            assigned_person_name: form.assigned_person_name.trim(),
            priority: form.priority,
            estimated_tat_days: Number(form.estimated_tat_days),
            total_order_value: Number(form.total_order_value),
            number_of_stores: form.number_of_stores ? Number(form.number_of_stores) : null,
            special_request: form.special_request.trim() || undefined
          });

          if (boqFile) {
            try {
              await uploadProjectDocument(project.id, boqFile, "boq");
            } catch {
              router.push(`/projects/${project.id}?upload=failed`);
              return;
            }
          }

          router.push(`/projects/${project.id}`);
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to create project.");
        }
      })();
    });
  };

  return (
    <form className="mt-8 space-y-8" onSubmit={handleSubmit}>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReadOnlyField
          label="Project code"
          value="Generated automatically after save"
          helper="No manual project code entry is needed now."
        />
        <ReadOnlyField
          label="Created by"
          value={viewer ? `${viewer.fullName} • ${viewer.department ?? "Unassigned"}` : "Current signed-in user"}
          helper={viewer?.email ?? "This project will be linked to the logged-in account."}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
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
          label="Brand"
          value={form.brand}
          onChange={(value) => updateField("brand", value)}
          placeholder="Optional"
          required={false}
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
            className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm outline-none transition focus:border-gold"
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
          type="number"
          inputMode="numeric"
          min={1}
        />
        <Field
          label="Total order value (INR)"
          value={form.total_order_value}
          onChange={(value) => updateField("total_order_value", value)}
          placeholder="250000"
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
          type="number"
          inputMode="numeric"
          min={1}
          required={false}
        />

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm font-medium text-ink/70">Special request</span>
          <textarea
            value={form.special_request}
            onChange={(event) => updateField("special_request", event.target.value)}
            placeholder="Optional client note, fast-track request, packaging instruction, or store-specific constraint."
            rows={4}
            className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm outline-none transition focus:border-gold"
          />
        </label>

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm font-medium text-ink/70">BOQ upload</span>
          <div className="rounded-[24px] border border-dashed border-ink/15 bg-sand/35 p-4">
            <input
              type="file"
              accept={acceptedDocumentTypes}
              onChange={handleFileChange}
              className="block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-pine"
            />
            <p className="mt-3 text-xs text-ink/45">
              Optional. Supports PDF, CSV, Excel, DOC, images, text, and ZIP uploads for the initial BOQ.
            </p>
            {boqFile ? (
              <p className="mt-2 text-sm font-medium text-pine">Selected: {boqFile.name}</p>
            ) : null}
          </div>
        </label>
      </div>

      {error ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Creating..." : "Create project"}
      </button>
    </form>
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
        className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm outline-none transition focus:border-gold"
      />
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[24px] border border-ink/10 bg-sand/35 px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 text-sm font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink/45">{helper}</div>
    </div>
  );
}
