import { AuthSidePanel } from "@/components/AuthSidePanel";
import { AppLogo } from "@/components/AppLogo";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center py-4 lg:py-6">
      <div className="grid w-full max-w-xl overflow-hidden rounded-[28px] border border-ink/10 bg-white/90 shadow-panel lg:max-w-[72rem] lg:grid-cols-[1.02fr_0.98fr] lg:gap-6 lg:rounded-[36px]">
        <AuthSidePanel
          eyebrow="Team onboarding"
          title="Create your account and join the live workflow."
          description="Use your work email to access the shared workspace, update your stage, upload files, and keep handoffs visible across teams."
        />

        <section className="space-y-4 px-5 py-6 sm:px-6 sm:py-7 md:px-8">
          <div className="space-y-3 text-center">
            <AppLogo showWordmark size="lg" align="center" className="items-center" priority />
            <p className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-ink/45 lg:block">Sign up</p>
            <div className="space-y-1.5 text-center">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">Create your account</h2>
              <p className="hidden text-sm leading-6 text-ink/60 lg:block">
                Use your team email so your updates, comments, and ownership stay visible across departments.
              </p>
            </div>
          </div>
          <SignupForm />
        </section>
      </div>
    </div>
  );
}

