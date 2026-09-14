import { AuthSidePanel } from "@/components/AuthSidePanel";
import { AppLogo } from "@/components/AppLogo";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
      <div className="grid w-full max-w-xl overflow-hidden rounded-[28px] border border-ink/10 bg-white/90 shadow-panel lg:max-w-5xl lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:rounded-[36px]">
        <AuthSidePanel
          eyebrow="Kian Falcon Workflow"
          title="Track every project handoff in one shared workspace."
          description="From costing and drawings to production, QC, and dispatch, every team works from the same live workflow with clear ownership, due dates, files, and updates."
        />

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

