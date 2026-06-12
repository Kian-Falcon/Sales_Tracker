"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { completeStage, createComment, setStageDueDate } from "@/lib/api";

export function useCompleteStageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stageId: string) => completeStage(stageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    }
  });
}

export function useSetDueDateMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stageId, dueDate }: { stageId: string; dueDate: string }) =>
      setStageDueDate(stageId, dueDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    }
  });
}

export function useCreateCommentMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stageId, text }: { stageId: string; text: string }) => createComment(stageId, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });
}
