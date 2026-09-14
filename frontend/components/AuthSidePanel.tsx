import { cn } from "@/lib/utils";

type AuthSidePanelProps = {
  eyebrow: string;
  title: string;
  description: string;
  className?: string;
};

export function AuthSidePanel({ eyebrow, title, description, className }: AuthSidePanelProps) {
  return (
    <section className={cn("relative hidden min-h-[360px] overflow-hidden lg:block", className)}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/filler-image.jpg')" }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(24,24,27,0.22)_0%,rgba(24,24,27,0.08)_40%,rgba(24,24,27,0.28)_100%)]" />
      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />

      <div className="relative z-10 flex h-full items-start p-7 md:p-10">
        <div className="max-w-md space-y-5 rounded-[30px] border border-white/18 bg-black/26 px-6 py-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-md">
          <span className="inline-flex rounded-full border border-white/24 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/82">
            {eyebrow}
          </span>

          <div className="space-y-3">
            <h1 className="max-w-md text-3xl font-semibold leading-tight text-white drop-shadow-sm">{title}</h1>
            <p className="max-w-md text-sm leading-6 text-white/84">{description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
