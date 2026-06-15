"use client";

import { useEffect, useMemo, useState } from "react";

import { useUpdateWorkflowSettingsMutation } from "@/hooks/useWorkflowSettings";
import type { Department, WorkflowStageSetting } from "@/lib/types";
import { formatDateTime, phaseOrder, titleCasePhase } from "@/lib/utils";

const departmentOptions: Department[] = [
  "Sales",
  "R&D",
  "Production",
  "Procurement",
  "QC",
  "Dispatch",
  "Admin"
];

export function WorkflowSettingsEditor({
  initialSettings
}: {
  initialSettings: WorkflowStageSetting[];
}) {
  const updateWorkflowSettings = useUpdateWorkflowSettingsMutation();
  const [settings, setSettings] = useState(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [saveTarget, setSaveTarget] = useState<string | "all" | null>(null);

  useEffect(() => {
    setSettings(initialSettings);
    setSavedSettings(initialSettings);
  }, [initialSettings]);

  const settingsByStageKey = useMemo(
    () => new Map(settings.map((setting) => [setting.stage_key, setting])),
    [settings]
  );
  const savedSettingsByStageKey = useMemo(
    () => new Map(savedSettings.map((setting) => [setting.stage_key, setting])),
    [savedSettings]
  );

  function buildPayload(source: WorkflowStageSetting[]) {
    return source.map((setting) => ({
      stage_key: setting.stage_key,
      responsible_dept: setting.responsible_dept,
      default_due_days: setting.default_due_days
    }));
  }

  function rowHasChanges(stageKey: string) {
    const current = settingsByStageKey.get(stageKey);
    const saved = savedSettingsByStageKey.get(stageKey);

    return (
      current?.responsible_dept !== saved?.responsible_dept ||
      current?.default_due_days !== saved?.default_due_days
    );
  }

  const dirtyStageKeys = new Set(
    settings.filter((setting) => rowHasChanges(setting.stage_key)).map((setting) => setting.stage_key)
  );
  const hasChanges = dirtyStageKeys.size > 0;

  async function persistSettings(
    nextSettings: WorkflowStageSetting[],
    target: string | "all",
    preserveDirtyStageKeys: Set<string> = new Set()
  ) {
    setSaveTarget(target);
    try {
      const updatedSettings = await updateWorkflowSettings.mutateAsync(buildPayload(nextSettings));
      setSavedSettings(updatedSettings);
      setSettings((current) =>
        updatedSettings.map((updatedSetting) => {
          if (
            target !== "all" &&
            preserveDirtyStageKeys.has(updatedSetting.stage_key) &&
            updatedSetting.stage_key !== target
          ) {
            return current.find((item) => item.stage_key === updatedSetting.stage_key) ?? updatedSetting;
          }

          return updatedSetting;
        })
      );
    } finally {
      setSaveTarget(null);
    }
  }

  async function handleSaveAll() {
    await persistSettings(settings, "all");
  }

  async function handleRowSave(stageKey: string) {
    const rowDraft = settingsByStageKey.get(stageKey);
    if (!rowDraft) {
      return;
    }

    const nextSettings = savedSettings.map((setting) =>
      setting.stage_key === stageKey ? rowDraft : setting
    );

    await persistSettings(nextSettings, stageKey, dirtyStageKeys);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-ink/10 bg-white p-6 shadow-panel">
        <div className="space-y-3">
          <span className="inline-flex rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink/70">
            Admin controls
          </span>
          <h1 className="text-3xl font-semibold text-ink">Workflow settings</h1>
          <p className="max-w-3xl text-sm leading-7 text-ink/60">
            Tune stage ownership and SLA days without editing code. These changes apply to newly
            created projects, and updated SLA days are used when future stages activate.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={!hasChanges || updateWorkflowSettings.isPending}
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveTarget === "all" && updateWorkflowSettings.isPending ? "Saving..." : "Save all changes"}
          </button>
          <button
            type="button"
            onClick={() => setSettings(savedSettings)}
            disabled={!hasChanges || updateWorkflowSettings.isPending}
            className="rounded-full border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset unsaved changes
          </button>
          {updateWorkflowSettings.isSuccess && !hasChanges ? (
            <span className="text-sm text-pine">Workflow settings saved.</span>
          ) : null}
          {updateWorkflowSettings.error ? (
            <span className="text-sm text-ember">{updateWorkflowSettings.error.message}</span>
          ) : null}
        </div>
      </section>

      {phaseOrder.map((phase) => {
        const phaseSettings = settings.filter((setting) => setting.phase === phase);
        if (!phaseSettings.length) {
          return null;
        }

        return (
          <section key={phase} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">{titleCasePhase(phase)}</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">
                {phaseSettings.length} stages
              </span>
            </div>

            <div className="grid gap-4">
              {phaseSettings.map((setting) => (
                <article
                  key={setting.stage_key}
                  className="grid gap-4 rounded-[28px] border border-ink/10 bg-white p-5 shadow-panel md:grid-cols-[minmax(0,1.3fr)_220px_180px_160px]"
                >
                  <div className="space-y-2">
                    <div>
                      <h3 className="text-lg font-semibold text-ink">{setting.name}</h3>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/45">
                        {setting.stage_key}
                      </p>
                    </div>
                    <p className="text-xs text-ink/50">
                      Last updated {formatDateTime(setting.updated_at)}
                    </p>
                  </div>

                  <label className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                      Responsible department
                    </span>
                    <select
                      value={setting.responsible_dept}
                      onChange={(event) =>
                        setSettings((current) =>
                          current.map((item) =>
                            item.stage_key === setting.stage_key
                              ? {
                                  ...item,
                                  responsible_dept: event.target.value as Department
                                }
                              : item
                          )
                        )
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
                    >
                      {departmentOptions.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                      Default SLA days
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={setting.default_due_days ?? ""}
                      onChange={(event) =>
                        setSettings((current) =>
                          current.map((item) =>
                            item.stage_key === setting.stage_key
                              ? {
                                  ...item,
                                  default_due_days:
                                    event.target.value === "" ? null : Number(event.target.value)
                                }
                              : item
                          )
                        )
                      }
                      className="w-full rounded-2xl border border-ink/10 bg-sand/50 px-3 py-2 text-sm outline-none transition focus:border-gold"
                      placeholder="No auto SLA"
                    />
                  </label>

                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                      Actions
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRowSave(setting.stage_key)}
                      disabled={!rowHasChanges(setting.stage_key) || updateWorkflowSettings.isPending}
                      className="w-full rounded-full border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saveTarget === setting.stage_key && updateWorkflowSettings.isPending
                        ? "Saving..."
                        : rowHasChanges(setting.stage_key)
                          ? "Save row"
                          : "Saved"}
                    </button>
                    <p className={`text-xs ${rowHasChanges(setting.stage_key) ? "text-gold" : "text-ink/45"}`}>
                      {rowHasChanges(setting.stage_key) ? "Unsaved row changes" : "No row changes"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
