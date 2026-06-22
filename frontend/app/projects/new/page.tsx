import Link from "next/link";

import { NewProjectForm } from "@/components/NewProjectForm";
import { getServerAuth } from "@/lib/supabase-server";

export default async function NewProjectPage() {
  const { viewer } = await getServerAuth();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/dashboard" className="text-sm font-medium text-pine hover:text-ink">
        Back to dashboard
      </Link>

      <section className="rounded-[32px] border border-ink/10 bg-white p-8 shadow-panel">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pine">Sales only</p>
          <h1 className="text-3xl font-semibold text-ink">Create a new project</h1>
          <p className="max-w-3xl text-sm text-ink/60">
            Project codes are generated automatically, the 25-stage workflow is seeded instantly, and you can
            optionally attach the first BOQ file while creating the project.
          </p>
        </div>

        <NewProjectForm viewer={viewer ?? null} />
      </section>
    </div>
  );
}
