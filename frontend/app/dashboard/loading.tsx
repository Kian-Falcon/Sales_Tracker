import { Skeleton } from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-border bg-white shadow-panel">
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Skeleton className="h-10 w-20 rounded-full" />
                <Skeleton className="h-10 w-24 rounded-full" />
                <Skeleton className="h-10 w-24 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-[28rem] max-w-full" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full min-w-[11rem]" />
              ))}
            </div>
          </div>
        </div>

        <div className="border-b border-border bg-surface-muted/35 px-4 py-4 sm:px-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,0.8fr))]">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-[24px] border border-border">
            <div className="grid grid-cols-[2fr_repeat(6,1fr)] gap-0 border-b border-border bg-surface-muted/60 px-4 py-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className="h-4 w-20" />
              ))}
            </div>
            <div className="space-y-0">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="grid grid-cols-[2fr_repeat(6,1fr)] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0">
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-7 w-20 rounded-full" />
                  <Skeleton className="h-8 w-full max-w-[8rem]" />
                  <Skeleton className="ml-auto h-9 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
