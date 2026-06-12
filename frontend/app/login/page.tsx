import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
      <div className="grid w-full max-w-5xl gap-8 overflow-hidden rounded-[36px] border border-ink/10 bg-white/90 shadow-panel lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6 bg-ink px-8 py-10 text-white md:px-12">
          <span className="inline-flex rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            Internal system
          </span>
          <div className="space-y-4">
            <h1 className="max-w-md text-4xl font-semibold leading-tight">
              Department-owned project visibility from costing to dispatch.
            </h1>
            <p className="max-w-lg text-sm leading-7 text-white/70">
              This starter reflects the architecture brief: Supabase-authenticated access, stage ownership,
              immutable comments, and a dashboard-first workflow for Sales and operations.
            </p>
          </div>
        </section>

        <section className="space-y-6 px-8 py-10 md:px-10">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-pine">Sign in</p>
            <h2 className="text-3xl font-semibold text-ink">Workflow Tracker</h2>
            <p className="text-sm text-ink/60">
              Use the Supabase Auth users created for Sales, R&amp;D, Production, QC, Dispatch, or Admin.
            </p>
          </div>
          <LoginForm />
        </section>
      </div>
    </div>
  );
}
