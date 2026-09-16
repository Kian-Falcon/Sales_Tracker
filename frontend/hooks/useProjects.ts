"use client";

import { useQuery } from "@tanstack/react-query";

import { listProjects } from "@/lib/api";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjects()
  });
}
