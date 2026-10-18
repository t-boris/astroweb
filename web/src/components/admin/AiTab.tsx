import { useEffect, useState } from "react";
import type { AdminProfile } from "@/api/admin";
import {
  adminGetAiSettings,
  adminResetAiSettings,
  adminSaveAiSettings,
  callableProblems,
  type AiSettingsResponse,
  type AiTask,
} from "@/api/adminAi";
import { Button } from "@/components/ui/button";
import { draftChanged, draftFromTask, draftOverride, PROVIDER_LABELS, type AiDraft } from "@/lib/aiSettings";
import AiTaskEditor from "./AiTaskEditor";
import AiTestPanel from "./AiTestPanel";

/**
 * Admin AI tab: which model each AI task uses, its limits and prompts, and a
 * test run (REQ-001..004, REQ-009). Drafts are kept per task, so switching
 * tasks never loses unsaved edits.
 */
export default function AiTab({ profiles }: { profiles: AdminProfile[] }) {
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AiDraft>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const next = await adminGetAiSettings();
      setSettings(next);
      setDrafts(Object.fromEntries(next.tasks.map((t) => [t.id, draftFromTask(t)])));
      setSelected((current) => current ?? next.tasks[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function replaceTask(task: AiTask) {
    setSettings((prev) => (prev ? { ...prev, tasks: prev.tasks.map((t) => (t.id === task.id ? task : t)) } : prev));
    setDrafts((prev) => ({ ...prev, [task.id]: draftFromTask(task) }));
  }

  async function save(task: AiTask) {
    setSaving(true);
    setProblems([]);
    try {
      replaceTask(await adminSaveAiSettings(task.id, draftOverride(drafts[task.id])));
    } catch (e) {
      setProblems(callableProblems(e));
    } finally {
      setSaving(false);
    }
  }

  async function reset(task: AiTask) {
    setSaving(true);
    setProblems([]);
    try {
      replaceTask(await adminResetAiSettings(task.id));
    } catch (e) {
      setProblems(callableProblems(e));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="space-y-2" data-testid="ai-tab">
        <p className="text-sm text-muted-foreground">{loading ? "Loading AI settings…" : ""}</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  const task = settings.tasks.find((t) => t.id === selected) ?? settings.tasks[0];
  const draft = drafts[task.id];
  const modelLabel = (id: string) => settings.models.find((m) => m.id === id)?.label ?? id;

  return (
    <div className="space-y-4" data-testid="ai-tab">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Provider keys:</span>
        {(Object.keys(settings.providers) as Array<keyof typeof settings.providers>).map((p) => (
          <span
            key={p}
            className={`rounded-full border px-2.5 py-0.5 ${
              settings.providers[p] ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {PROVIDER_LABELS[p]}: {settings.providers[p] ? "configured" : "no API key"}
          </span>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : "Reload"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav className="space-y-1.5" aria-label="AI tasks">
          {settings.tasks.map((t) => {
            const custom = Object.keys(t.override).length > 0;
            const unsaved = drafts[t.id] ? draftChanged(t, drafts[t.id]) : false;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={t.id === task.id ? "true" : undefined}
                onClick={() => {
                  setSelected(t.id);
                  setProblems([]);
                }}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  t.id === task.id ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{t.label}</span>
                  {unsaved && <span className="h-2 w-2 rounded-full bg-primary" title="Unsaved changes" />}
                  <span className={`ml-auto text-[10px] uppercase tracking-wide ${custom ? "text-primary" : "text-muted-foreground"}`}>
                    {custom ? "custom" : "default"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {modelLabel(t.effective.model)} · {t.effective.maxOutputTokens.toLocaleString("en-US")} tokens
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-6">
          <AiTaskEditor
            key={task.id}
            task={task}
            draft={draft}
            settings={settings}
            saving={saving}
            serverProblems={problems}
            onChange={(next) => setDrafts((prev) => ({ ...prev, [task.id]: next }))}
            onSave={() => void save(task)}
            onDiscard={() => setDrafts((prev) => ({ ...prev, [task.id]: draftFromTask(task) }))}
            onReset={() => void reset(task)}
          />
          <AiTestPanel key={`test-${task.id}`} task={task} draft={draft} settings={settings} profiles={profiles} />
        </div>
      </div>
    </div>
  );
}
