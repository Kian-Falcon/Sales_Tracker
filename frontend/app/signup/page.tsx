import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] place-items-center">
      <div className="grid w-full max-w-xl overflow-hidden rounded-[28px] border border-ink/10 bg-white/90 shadow-panel lg:max-w-5xl lg:grid-cols-[1.1fr_0.9fr] lg:gap-8 lg:rounded-[36px]">
        <section className="hidden space-y-6 bg-ink px-8 py-10 text-white md:px-12 lg:block">
          <span className="inline-flex rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            Team access
          </span>
          <div className="space-y-4">
            <h1 className="max-w-md text-4xl font-semibold leading-tight">
              Create your department account and join the live workflow tracker.
            </h1>
            <p className="max-w-lg text-sm leading-7 text-white/70">
              Add your name, work email, and department so every stage update and comment is clearly tied to the
              right person.
            </p>
          </div>
        </section>

        <section className="space-y-6 px-6 py-8 sm:px-8 sm:py-10 md:px-10">
          <div className="space-y-2">
            <p className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-pine lg:block">Sign up</p>
            <h2 className="text-2xl font-semibold text-ink sm:text-3xl">Create your account</h2>
            <p className="hidden text-sm text-ink/60 lg:block">
              Use your team email so your updates, comments, and stage ownership are visible across departments.
            </p>
          </div>
          <SignupForm />
        </section>
      </div>
    </div>
  );
}
