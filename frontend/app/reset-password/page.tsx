import { AppLogo } from "@/components/AppLogo";
import { AuthSidePanel } from "@/components/AuthSidePanel";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
      <div className="grid w-full max-w-xl overflow-hidden rounded-[28px] border border-ink/10 bg-white/90 shadow-panel lg:max-w-5xl lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:rounded-[36px]">
        <AuthSidePanel
          eyebrow="Secure reset"
          title="Set a new password and jump straight back into the workspace."
          description="Use a strong password so your department updates, files, and project history stay protected inside the tracker."
        />

        <section className="space-y-6 px-6 py-8 sm:px-8 sm:py-10 md:px-10">
          <div className="space-y-4 text-center">
            <AppLogo showWordmark size="xl" align="center" className="items-center" priority />
            <p className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-ink/45 lg:block">Reset password</p>
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-semibold text-ink sm:text-3xl">Choose a new password</h2>
              <p className="hidden text-sm text-ink/60 lg:block">
                This screen opens after you click the recovery link from your email.
              </p>
            </div>
          </div>
          <ResetPasswordForm />
        </section>
      </div>
    </div>
  );
}
