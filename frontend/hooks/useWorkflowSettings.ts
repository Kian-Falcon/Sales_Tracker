"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateWorkflowSettings } from "@/lib/api";
import type { WorkflowStageSettingUpdateInput } from "@/lib/types";

export function useUpdateWorkflowSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: WorkflowStageSettingUpdateInput[]) => updateWorkflowSettings(settings),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workflow-settings"] });
    }
  });
}
