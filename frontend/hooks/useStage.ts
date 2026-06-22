"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  completeStage,
  createComment,
  requestStageDueDateChange,
  reviewStageDueDateRequest,
  setStageDueDate
} from "@/lib/api";

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

export function useRequestStageDueDateChangeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stageId, requestedDueDate, reason }: { stageId: string; requestedDueDate: string; reason: string }) =>
      requestStageDueDateChange(stageId, {
        requested_due_date: requestedDueDate,
        reason
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    }
  });
}

export function useReviewStageDueDateRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      stageId,
      requestId,
      action,
      note
    }: {
      stageId: string;
      requestId: string;
      action: "approve" | "reject";
      note?: string | null;
    }) =>
      reviewStageDueDateRequest(stageId, requestId, {
        action,
        note
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    }
  });
}
