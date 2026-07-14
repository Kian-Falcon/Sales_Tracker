import { clsx, type ClassValue } from "clsx";

import type { ProjectPriority, StagePhase } from "@/lib/types";

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

export function formatMonthLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const [year, month] = value.split("-");
  const parsed = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric"
  }).format(parsed);
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

  return "";
}

export function titleCasePhase(phase: StagePhase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "0%";
  }

  return `${value.toFixed(1)}%`;
}

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatPriority(priority: ProjectPriority) {
  return priority === "accelerated" ? "Accelerated" : "Normal";
}

export const phaseOrder: StagePhase[] = ["costing", "drawing", "sampling", "production"];
