"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ChangeEvent, type FormEvent } from "react";

import { createProject, listProjectMentionableUsers, uploadProjectDocument } from "@/lib/api";
import type { MentionableUser, ProjectPriority, ViewerDetails } from "@/lib/types";

type FormState = {
  name: string;
  client: string;
  assigned_person_name: string;
  priority: ProjectPriority;
  estimated_tat_days: string;
  total_order_value: string;
  special_request: string;
};

const acceptedDocumentTypes = ".pdf,.csv,.xls,.xlsx,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg";

export function NewProjectForm({ viewer }: { viewer: ViewerDetails | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    client: "",
    assigned_person_name: viewer?.fullName ?? "",
    priority: "normal",
    estimated_tat_days: "",
    total_order_value: "",
    special_request: ""
  });
  const [boqFile, setBoqFile] = useState<File | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<MentionableUser | null>(
    viewer?.department
      ? {
          id: viewer.id,
          display_name: viewer.fullName,
          email: viewer.email,
          department: viewer.department
        }
      : null
  );

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  useEffect(() => {
    let active = true;

    setMentionLoading(true);

    void listProjectMentionableUsers()
      .then((users) => {
        if (!active) {
          return;
        }
        setMentionableUsers(users);
        setMentionError(null);
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }
        setMentionableUsers([]);
        setMentionError(
          caughtError instanceof Error ? caughtError.message : "Unable to load teammates for assignment."
        );
      })
      .finally(() => {
        if (active) {
          setMentionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const assigneeMentionQuery = useMemo(() => {
    const value = form.assigned_person_name.trimStart();
    if (!value.startsWith("@")) {
      return null;
    }

    return value.slice(1).trim().toLowerCase();
  }, [form.assigned_person_name]);

  const filteredMentionableUsers = useMemo(() => {
    if (assigneeMentionQuery === null) {
      return [];
    }

    return mentionableUsers
      .filter((user) => {
        if (!assigneeMentionQuery) {
          return true;
        }

        return (
          user.display_name.toLowerCase().includes(assigneeMentionQuery) ||
          user.email.toLowerCase().includes(assigneeMentionQuery) ||
          user.department.toLowerCase().includes(assigneeMentionQuery)
        );
      })
      .slice(0, 6);
  }, [assigneeMentionQuery, mentionableUsers]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setBoqFile(event.target.files?.[0] ?? null);
  };

  const handleAssignedPersonChange = (value: string) => {
    updateField("assigned_person_name", value);
    if (selectedAssignee && value.trim() !== selectedAssignee.display_name) {
      setSelectedAssignee(null);
    }
  };

  const handleAssigneeSelect = (user: MentionableUser) => {
    updateField("assigned_person_name", user.display_name);
    setSelectedAssignee(user);
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
            assigned_person_name: form.assigned_person_name.trim(),
            assigned_person_email: selectedAssignee?.email,
            priority: form.priority,
            estimated_tat_days: Number(form.estimated_tat_days),
            total_order_value: Number(form.total_order_value),
            special_request: form.special_request.trim() || undefined
          });

          if (boqFile) {
            try {
              await uploadProjectDocument(project.id, boqFile, "boq");
            } catch {
              router.push(`/dashboard?project=${project.id}&panel=documents&upload=failed`);
              return;
            }
          }

          router.push(`/dashboard?project=${project.id}`);
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
          value={viewer ? `${viewer.fullName} - ${viewer.department ?? "Unassigned"}` : "Current signed-in user"}
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
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink/70">Assigned person</span>
          <input
            required
            type="text"
            value={form.assigned_person_name}
            onChange={(event) => handleAssignedPersonChange(event.target.value)}
            placeholder="Type @ to pick a teammate or enter a name"
            className="w-full rounded-2xl border border-ink/10 bg-surface-muted/50 px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
          {assigneeMentionQuery !== null && filteredMentionableUsers.length ? (
            <div className="rounded-2xl border border-ink/10 bg-white p-2 shadow-sm">
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                Assign teammate
              </p>
              <div className="space-y-1">
                {filteredMentionableUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleAssigneeSelect(user);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition hover:bg-surface-muted/70"
                  >
                    <div>
                      <div className="text-sm font-medium text-ink">{user.display_name}</div>
                      <div className="text-xs text-ink/55">{user.email}</div>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                      {user.department}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {selectedAssignee ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink/55">
              <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 font-semibold text-success">
                Notifying {selectedAssignee.email}
              </span>
              <span>{selectedAssignee.department}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink/50">
            <span>
              Type `@` to pick a teammate. New-project emails go to the selected assignee plus Sales and Admin.
            </span>
            {mentionLoading ? <span className="text-ink/45">Loading teammates...</span> : null}
            {mentionError ? <span className="text-danger">{mentionError}</span> : null}
            {!selectedAssignee && assigneeMentionQuery === null ? (
              <span className="text-warning">No teammate selected yet. Only Sales/Admin will receive the email.</span>
            ) : null}
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink/70">Priority</span>
          <select
            value={form.priority}
            onChange={(event) => updateField("priority", event.target.value as ProjectPriority)}
            className="w-full rounded-2xl border border-ink/10 bg-surface-muted/50 px-4 py-3 text-sm outline-none transition focus:border-accent"
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

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm font-medium text-ink/70">Special request</span>
          <textarea
            value={form.special_request}
            onChange={(event) => updateField("special_request", event.target.value)}
            placeholder="Optional client note, fast-track request, packaging instruction, or store-specific constraint."
            rows={4}
            className="w-full rounded-2xl border border-ink/10 bg-surface-muted/50 px-4 py-3 text-sm outline-none transition focus:border-accent"
          />
        </label>

        <label className="block space-y-2 lg:col-span-2">
          <span className="text-sm font-medium text-ink/70">BOQ upload</span>
          <div className="rounded-[24px] border border-dashed border-ink/15 bg-surface-muted/35 p-4">
            <input
              type="file"
              accept={acceptedDocumentTypes}
              onChange={handleFileChange}
              className="block w-full text-sm text-ink/70 file:mr-4 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-accent/90"
            />
            <p className="mt-3 text-xs text-ink/45">
              Optional. Supports PDF, CSV, Excel, DOC, images, text, and ZIP uploads for the initial BOQ.
            </p>
            {boqFile ? <p className="mt-2 text-sm font-medium text-ink/70">Selected: {boqFile.name}</p> : null}
          </div>
        </label>
      </div>

      {error ? <p className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-ink">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
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
        className="w-full rounded-2xl border border-ink/10 bg-surface-muted/50 px-4 py-3 text-sm outline-none transition focus:border-accent"
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
    <div className="rounded-[24px] border border-ink/10 bg-surface-muted/35 px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 text-sm font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink/45">{helper}</div>
    </div>
  );
}

