"use client";

import { useQuery } from "@tanstack/react-query";

import { getDashboardSummary, listProjects } from "@/lib/api";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects()
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => getDashboardSummary()
  });
}
