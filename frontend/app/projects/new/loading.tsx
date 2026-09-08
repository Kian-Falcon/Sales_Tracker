import { Skeleton } from "@/components/Skeleton";

export default function NewProjectLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-5 w-32" />
      <section className="rounded-[32px] border border-ink/10 bg-white p-8 shadow-panel">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-[30rem] max-w-full" />
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-14 w-full" />
            </div>
          ))}
          <div className="space-y-2 lg:col-span-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </section>
    </div>
  );
}
