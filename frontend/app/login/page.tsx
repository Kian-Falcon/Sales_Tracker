import { AppLogo } from "@/components/AppLogo";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
      <div className="grid w-full max-w-xl overflow-hidden rounded-[28px] border border-ink/10 bg-white/90 shadow-panel lg:max-w-5xl lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:rounded-[36px]">
        <section className="hidden space-y-6 bg-ink px-8 py-10 text-white md:px-12 lg:block">
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

        <section className="space-y-6 px-6 py-8 sm:px-8 sm:py-10 md:px-10">
          <div className="space-y-4 text-center">
            <AppLogo showWordmark size="xl" align="center" className="items-center" priority />
            <p className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-ink/45 lg:block">Sign in</p>
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-semibold text-ink sm:text-3xl">Workflow Tracker</h2>
              <p className="hidden text-sm text-ink/60 lg:block">
                Sign in with your existing team account, or create one if this is your first time using the tracker.
              </p>
            </div>
          </div>
          <LoginForm />
        </section>
      </div>
    </div>
  );
}

