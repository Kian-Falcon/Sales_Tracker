import { AppLogo } from "@/components/AppLogo";
import { AuthSidePanel } from "@/components/AuthSidePanel";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
      <div className="grid w-full max-w-xl overflow-hidden rounded-[28px] border border-ink/10 bg-white/90 shadow-panel lg:max-w-5xl lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:rounded-[36px]">
        <AuthSidePanel
          eyebrow="Account recovery"
          title="Reset access without losing your workflow history."
          description="We will send a secure recovery link to your work email so you can choose a new password and get back into the tracker."
        />

        <section className="space-y-6 px-6 py-8 sm:px-8 sm:py-10 md:px-10">
          <div className="space-y-4 text-center">
            <AppLogo showWordmark size="xl" align="center" className="items-center" priority />
            <p className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-ink/45 lg:block">Forgot password</p>
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-semibold text-ink sm:text-3xl">Reset your password</h2>
              <p className="hidden text-sm text-ink/60 lg:block">
                Enter your team email and we&apos;ll send a reset link to the inbox.
              </p>
            </div>
          </div>
          <ForgotPasswordForm />
        </section>
      </div>
    </div>
  );
}
