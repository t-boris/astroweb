import { generateText, type GenerationPrompt, type GenerationResult } from "./generate";
import type { EffectiveTaskSettings } from "./settings";
import { taskSpec } from "./tasks";

/** Run a task's prompt with the task's settings and its fixed generation options. */
export function runTask(settings: EffectiveTaskSettings, prompt: GenerationPrompt): Promise<GenerationResult> {
  return generateText(settings, prompt, taskSpec(settings.taskId).generation);
}

/** Cache-key fields for a task's settings: none while it runs on its defaults (DEC-004). */
export function settingsKeyPart(settings: EffectiveTaskSettings): { aiSettings?: string } {
  return settings.version ? { aiSettings: settings.version } : {};
}
