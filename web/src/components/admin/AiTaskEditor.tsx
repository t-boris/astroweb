import { useRef, useState } from "react";
import type { AiModelInfo, AiPromptPart, AiSettingsResponse, AiTask, TextLanguage } from "@/api/adminAi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  draftChanged,
  draftIssues,
  formatPrice,
  modelSettingsAreCustom,
  partIsCustom,
  partIssues,
  PROVIDER_LABELS,
  withModel,
  withText,
  type AiDraft,
} from "@/lib/aiSettings";

interface Props {
  task: AiTask;
  draft: AiDraft;
  settings: Pick<AiSettingsResponse, "models" | "limits">;
  saving: boolean;
  serverProblems: string[];
  onChange: (draft: AiDraft) => void;
  onSave: () => void;
  onDiscard: () => void;
  onReset: () => void;
}

const PROVIDER_ORDER: AiModelInfo["provider"][] = ["anthropic", "openai", "gemini"];

function Badge({ custom }: { custom: boolean }) {
  return custom ? (
    <span className="rounded-full border border-primary/60 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
      custom
    </span>
  ) : (
    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      default
    </span>
  );
}

function PromptPartEditor(props: {
  task: AiTask;
  part: AiPromptPart;
  language: TextLanguage;
  draft: AiDraft;
  maxLength: number;
  onChange: (draft: AiDraft) => void;
}) {
  const { task, part, language, draft, maxLength, onChange } = props;
  const [showDefault, setShowDefault] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = draft.texts[language]?.[part.key] ?? "";
  const defaultText = task.defaults.texts[language]?.[part.key] ?? "";
  const custom = partIsCustom(task, draft, language, part.key);
  const issues = partIssues(part, language, text, maxLength);
  const rows = Math.min(24, Math.max(3, text.split("\n").length + 1));
  const id = `ai-${task.id}-${language}-${part.key}`;

  function insertPlaceholder(name: string) {
    const area = ref.current;
    const token = `{{${name}}}`;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    onChange(withText(draft, language, part.key, text.slice(0, start) + token + text.slice(end)));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3" data-testid={`ai-part-${part.key}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">{part.label}</label>
        <Badge custom={custom} />
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowDefault((v) => !v)}>
            {showDefault ? "Hide default" : "Show default"}
          </Button>
          {custom && (
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(withText(draft, language, part.key, defaultText))}>
              Restore default
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{part.description}</p>
      {part.placeholders.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Placeholders">
          <span className="text-muted-foreground">Insert:</span>
          {part.placeholders.map((p) => (
            <button
              key={p.name}
              type="button"
              title={`${p.description}${p.optional ? " (optional)" : ""}${p.collapsible ? " (removed with its line when empty)" : ""}`}
              onClick={() => insertPlaceholder(p.name)}
              className="rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:border-primary"
            >
              {`{{${p.name}}}`}
              {p.optional ? <span className="text-muted-foreground">?</span> : null}
            </button>
          ))}
        </div>
      )}
      <textarea
        id={id}
        ref={ref}
        value={text}
        rows={rows}
        spellCheck={false}
        onChange={(e) => onChange(withText(draft, language, part.key, e.target.value))}
        className="w-full rounded-md border border-input bg-background/60 p-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary"
      />
      <p className="text-right text-[11px] text-muted-foreground">
        {text.length.toLocaleString("en-US")} / {maxLength.toLocaleString("en-US")}
      </p>
      {issues.map((issue) => (
        <p key={issue} className="text-xs text-destructive">{issue}</p>
      ))}
      {showDefault && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
          {defaultText}
        </pre>
      )}
    </div>
  );
}

export default function AiTaskEditor({ task, draft, settings, saving, serverProblems, onChange, onSave, onDiscard, onReset }: Props) {
  const [language, setLanguage] = useState<TextLanguage>(task.languages[0]);
  const [confirmReset, setConfirmReset] = useState(false);
  const activeLanguage = task.languages.includes(language) ? language : task.languages[0];
  const model = settings.models.find((m) => m.id === draft.model);
  const changed = draftChanged(task, draft);
  const issues = draftIssues(task, draft, settings);
  const hasOverride = Object.keys(task.override).length > 0;
  const maxLimit = Math.min(settings.limits.maxOutputTokens, model?.maxOutputTokens ?? settings.limits.maxOutputTokens);

  return (
    <div className="space-y-5" data-testid="ai-task-editor">
      <div className="space-y-1">
        <h3 className="font-serif text-xl text-primary">{task.label}</h3>
        <p className="text-sm text-muted-foreground">{task.description}</p>
        <p className="text-xs text-muted-foreground">
          {hasOverride && task.updatedAt
            ? `Custom settings saved by ${task.updatedBy ?? "the admin"} on ${task.updatedAt.slice(0, 16).replace("T", " ")} UTC.`
            : "Runs on the code defaults."}
        </p>
      </div>

      <section className="ds-card space-y-4 p-4" aria-label="Model">
        <div className="flex items-center gap-2">
          <h4 className="font-serif text-lg text-primary">Model</h4>
          <Badge custom={modelSettingsAreCustom(task, draft)} />
          {modelSettingsAreCustom(task, draft) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() =>
                onChange({
                  ...draft,
                  model: task.defaults.model,
                  maxOutputTokens: task.defaults.maxOutputTokens,
                  temperature: task.defaults.temperature,
                })
              }
            >
              Restore default
            </Button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Model</span>
            <select
              value={draft.model}
              onChange={(e) => {
                const next = settings.models.find((m) => m.id === e.target.value);
                if (next) onChange(withModel(draft, next, task));
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              {PROVIDER_ORDER.map((provider) => (
                <optgroup key={provider} label={PROVIDER_LABELS[provider]}>
                  {settings.models
                    .filter((m) => m.provider === provider)
                    .map((m) => (
                      <option key={m.id} value={m.id} disabled={!m.available || (task.needsWebSearch && !m.webSearch)}>
                        {m.label} — ${m.inputPerMTok}/${m.outputPerMTok}
                        {!m.available ? " (no API key)" : ""}
                        {m.id === task.defaults.model ? " · default" : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Output limit (tokens)</span>
            <Input
              type="number"
              min={settings.limits.minOutputTokens}
              max={maxLimit}
              step={100}
              value={Number.isFinite(draft.maxOutputTokens) ? draft.maxOutputTokens : ""}
              onChange={(e) => onChange({ ...draft, maxOutputTokens: e.target.value === "" ? NaN : Number(e.target.value) })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Temperature</span>
            {model?.temperature ? (
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                placeholder="not sent"
                value={draft.temperature ?? ""}
                onChange={(e) => onChange({ ...draft, temperature: e.target.value === "" ? null : Number(e.target.value) })}
              />
            ) : (
              <p className="pt-2 text-xs text-muted-foreground">This model does not accept a temperature.</p>
            )}
          </label>
        </div>
        {model && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {model.label} · {PROVIDER_LABELS[model.provider]} · {formatPrice(model)} · output limit up to{" "}
              {maxLimit.toLocaleString("en-US")} tokens.
            </p>
            {model.nextPrice && (
              <p>
                Price changes on {model.nextPrice.from} to ${model.nextPrice.inputPerMTok} / ${model.nextPrice.outputPerMTok}.
              </p>
            )}
            <p>Models that reason before answering get extra room for reasoning on top of the output limit.</p>
            {task.needsWebSearch && <p>This task uses the provider's own web search (billed per search).</p>}
          </div>
        )}
      </section>

      <section className="ds-card space-y-3 p-4" aria-label="Prompts">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-serif text-lg text-primary">Prompts</h4>
          {task.languages.length > 1 ? (
            <div className="ml-auto flex gap-1" role="group" aria-label="Language">
              {task.languages.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLanguage(l)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    l === activeLanguage ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          ) : (
            <span className="ml-auto text-xs text-muted-foreground">One text for every language.</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The same prompts are used whichever model runs the task. Placeholders are filled by the server with the data of each request.
        </p>
        {task.parts.map((part) => (
          <PromptPartEditor
            key={`${activeLanguage}-${part.key}`}
            task={task}
            part={part}
            language={activeLanguage}
            draft={draft}
            maxLength={settings.limits.maxPromptLength}
            onChange={onChange}
          />
        ))}
      </section>

      <div className="sticky bottom-0 z-10 space-y-2 border-t border-border/60 bg-background/95 py-3 backdrop-blur">
        {changed && issues.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive">
            {issues.slice(0, 6).map((issue) => <li key={issue}>{issue}</li>)}
            {issues.length > 6 && <li>…and {issues.length - 6} more</li>}
          </ul>
        )}
        {serverProblems.length > 0 && (
          <ul className="space-y-0.5 text-xs text-destructive" data-testid="ai-server-problems">
            {serverProblems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onSave} disabled={!changed || issues.length > 0 || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={onDiscard} disabled={!changed || saving}>
            Discard changes
          </Button>
          {changed && <span className="text-xs text-primary">Unsaved changes</span>}
          {hasOverride && (
            <Button type="button" variant="ghost" className="ml-auto text-destructive" onClick={() => setConfirmReset(true)} disabled={saving}>
              Reset task to defaults
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Saved changes reach new requests within about a minute.</p>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {task.label} to the defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              The custom model, limits and prompts of this task are deleted and cannot be restored. The task runs on the code defaults again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReset(false);
                onReset();
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
