import { useState } from "react";
import type { AdminProfile } from "@/api/admin";
import { adminTestAiTask, callableProblems, type AiSettingsResponse, type AiTask, type AiTestResult } from "@/api/adminAi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftIssues, draftOverride, formatUsd, PROVIDER_LABELS, type AiDraft } from "@/lib/aiSettings";

interface Props {
  task: AiTask;
  draft: AiDraft;
  settings: Pick<AiSettingsResponse, "models" | "limits">;
  profiles: AdminProfile[];
}

const SECTIONS = ["planets", "houses", "aspects", "portrait"] as const;
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

/** Run the task once with the editor's unsaved settings on a chosen profile (REQ-009, DEC-012). */
export default function AiTestPanel({ task, draft, settings, profiles }: Props) {
  const [profileId, setProfileId] = useState("");
  const [partnerProfileId, setPartnerProfileId] = useState("");
  const [language, setLanguage] = useState<"en" | "ru">("en");
  const [question, setQuestion] = useState("What should I focus on in my career this year?");
  const [topic, setTopic] = useState("Sun in Aries");
  const [baseInterpretation, setBaseInterpretation] = useState(
    "The Sun in Aries gives a direct, brave and energetic character that likes to start things first.",
  );
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("planets");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);

  const issues = draftIssues(task, draft, settings);
  const needs = new Set(task.testInputs);
  const bilingual = task.languages.includes("en") && task.languages.includes("ru");
  const missingInput =
    !profileId ||
    (needs.has("partnerProfileId") && !partnerProfileId) ||
    (needs.has("question") && !question.trim()) ||
    (needs.has("topic") && !topic.trim()) ||
    (needs.has("baseInterpretation") && !baseInterpretation.trim());

  async function run() {
    setRunning(true);
    setProblems([]);
    setResult(null);
    try {
      setResult(
        await adminTestAiTask({
          taskId: task.id,
          override: draftOverride(draft),
          profileId,
          language,
          inputs: {
            ...(needs.has("question") ? { question } : {}),
            ...(needs.has("topic") ? { topic } : {}),
            ...(needs.has("baseInterpretation") ? { baseInterpretation } : {}),
            ...(needs.has("partnerProfileId") ? { partnerProfileId } : {}),
            ...(needs.has("section") ? { section } : {}),
          },
        }),
      );
    } catch (error) {
      setProblems(callableProblems(error));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="ds-card space-y-4 p-4" aria-label="Test run" data-testid="ai-test-panel">
      <div className="space-y-1">
        <h4 className="font-serif text-lg text-primary">Test run</h4>
        <p className="text-xs text-muted-foreground">
          Runs this task once with the settings in the editor, saved or not. It spends real API tokens; no stars are charged,
          and no answer is cached or saved to the person's content.
          {task.id === "letterWriting" && " The analysis pass runs first with its saved settings to produce the brief."}
          {task.id === "letterAnalysis" && " The news digest is read from its cache, or generated without being cached."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-muted-foreground">Profile</span>
          <select className={selectClass} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Choose a profile…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.birthDate}</option>
            ))}
          </select>
        </label>
        {bilingual && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Language</span>
            <select className={selectClass} value={language} onChange={(e) => setLanguage(e.target.value as "en" | "ru")}>
              <option value="en">English</option>
              <option value="ru">Russian</option>
            </select>
          </label>
        )}
        {needs.has("partnerProfileId") && (
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">Partner profile</span>
            <select className={selectClass} value={partnerProfileId} onChange={(e) => setPartnerProfileId(e.target.value)}>
              <option value="">Choose a profile…</option>
              {profiles.filter((p) => p.id !== profileId).map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.birthDate}</option>
              ))}
            </select>
          </label>
        )}
        {needs.has("section") && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Section</span>
            <select className={selectClass} value={section} onChange={(e) => setSection(e.target.value as (typeof SECTIONS)[number])}>
              {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {needs.has("topic") && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Block (topic)</span>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} />
          </label>
        )}
        {needs.has("baseInterpretation") && (
          <label className="space-y-1 text-sm md:col-span-3">
            <span className="text-muted-foreground">Standard interpretation of the block</span>
            <textarea
              className="w-full rounded-md border border-input bg-background/60 p-2 text-sm text-foreground"
              rows={2}
              maxLength={2000}
              value={baseInterpretation}
              onChange={(e) => setBaseInterpretation(e.target.value)}
            />
          </label>
        )}
        {needs.has("question") && (
          <label className="space-y-1 text-sm md:col-span-3">
            <span className="text-muted-foreground">Question</span>
            <textarea
              className="w-full rounded-md border border-input bg-background/60 p-2 text-sm text-foreground"
              rows={2}
              maxLength={task.id === "factExtraction" ? 2000 : 1000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void run()} disabled={running || missingInput || issues.length > 0}>
          {running ? "Running…" : "Run test"}
        </Button>
        {issues.length > 0 && <span className="text-xs text-destructive">Fix the settings above to run a test.</span>}
      </div>

      {problems.length > 0 && (
        <ul className="space-y-0.5 text-sm text-destructive" data-testid="ai-test-error">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {result && (
        <div className="space-y-3" data-testid="ai-test-result">
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div><dt className="text-muted-foreground">Model</dt><dd className="font-mono text-foreground">{result.model}</dd></div>
            <div><dt className="text-muted-foreground">Provider</dt><dd className="text-foreground">{PROVIDER_LABELS[result.provider]}</dd></div>
            <div>
              <dt className="text-muted-foreground">Tokens in / out</dt>
              <dd className="text-foreground">
                {result.usage.inputTokens.toLocaleString("en-US")} / {result.usage.outputTokens.toLocaleString("en-US")}
                {result.usage.webSearches > 0 ? ` · ${result.usage.webSearches} searches` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cost</dt>
              <dd className="text-foreground">
                {formatUsd(result.costUsd)}
                {result.preparationCostUsd > 0 ? ` + ${formatUsd(result.preparationCostUsd)} preparation` : ""}
              </dd>
            </div>
            <div><dt className="text-muted-foreground">Time</dt><dd className="text-foreground">{(result.durationMs / 1000).toFixed(1)} s</dd></div>
          </dl>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 font-sans text-sm leading-relaxed text-foreground">
            {result.text}
          </pre>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowPrompt((v) => !v)}>
            {showPrompt ? "Hide the prompt sent" : "Show the prompt sent"}
          </Button>
          {showPrompt && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">System prompt</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                {result.prompt.system}
              </pre>
              <p className="text-xs text-muted-foreground">User message</p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground">
                {result.prompt.user}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
