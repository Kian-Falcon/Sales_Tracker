"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { createProject } from "@/lib/api";

export default function NewProjectPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    project_code: "",
    name: "",
    client: "",
    brand: ""
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        try {
          const project = await createProject(form);
          router.push(`/projects/${project.id}`);
          router.refresh();
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to create project.");
        }
      })();
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard" className="text-sm font-medium text-pine hover:text-ink">
        Back to dashboard
      </Link>

      <section className="rounded-[32px] border border-ink/10 bg-white p-8 shadow-panel">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">Sales only</p>
          <h1 className="text-3xl font-semibold text-ink">Create a new project</h1>
          <p className="text-sm text-ink/60">
            The backend scaffold will create the project row and auto-seed the 27 placeholder stages from the
            architecture brief.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <Field
            label="Project code"
            value={form.project_code}
            onChange={(value) => updateField("project_code", value)}
            placeholder="P001"
          />
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
          />

          {error ? <p className="rounded-2xl bg-ember/10 px-4 py-3 text-sm text-ember">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? "Creating..." : "Create project"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-ink/70">{label}</span>
      <input
        required={label !== "Brand"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3 text-sm outline-none transition focus:border-gold"
      />
    </label>
  );
}
