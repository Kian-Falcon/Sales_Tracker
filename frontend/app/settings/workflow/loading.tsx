import { Skeleton } from "@/components/Skeleton";

export default function WorkflowSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>

      <section className="overflow-hidden rounded-[28px] border border-border bg-white shadow-panel">
        <div className="border-b border-border px-5 py-4">
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
        </div>
        <div className="space-y-3 px-5 py-5">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid gap-4 rounded-2xl border border-border px-4 py-4 md:grid-cols-[1.2fr_1fr_1fr_0.8fr]">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
