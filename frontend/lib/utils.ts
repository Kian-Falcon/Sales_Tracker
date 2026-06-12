import { clsx, type ClassValue } from "clsx";

import type { StagePhase } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return clsx(...inputs);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatPendingDuration(
  startValue: string | null | undefined,
  endValue?: string | null | undefined
) {
  if (!startValue) {
    return "Not started";
  }

  const start = new Date(startValue).getTime();
  const end = endValue ? new Date(endValue).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 1) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours >= 1) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"}`;
  }

  return "Less than 1 hour";
}

export function titleCasePhase(phase: StagePhase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export const phaseOrder: StagePhase[] = ["costing", "drawing", "sampling", "production"];
