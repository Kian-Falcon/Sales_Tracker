"use client";

import { cn } from "@/lib/utils";

export function Skeleton({
  className
}: {
  className?: string;
}) {
  return <div className={cn("animate-pulse rounded-2xl bg-surface-muted", className)} />;
}
