import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export interface LetterQuestion {
  id: string;
  text: string;
  options: string[];
  dossierKey: string;
  sensitive: boolean;
  answeredOption?: string | null;
}
export interface Letter {
  id: string;
  profileId: string;
  generatedAt: string;
  html: string;
  teaserText: string;
  questions: LetterQuestion[];
  status: "generated" | "delivered" | "read";
  feedback: "resonated" | "missed" | null;
}

export async function listLetters(profileId: string): Promise<Letter[]> {
  const fn = httpsCallable<{ profileId: string }, { letters: Letter[] }>(functions, "listLetters");
  return (await fn({ profileId })).data.letters;
}

export async function markLetterRead(profileId: string, letterId: string): Promise<void> {
  const fn = httpsCallable(functions, "markLetterRead");
  await fn({ profileId, letterId });
}

export async function setLetterFeedback(profileId: string, letterId: string, feedback: "resonated" | "missed"): Promise<void> {
  const fn = httpsCallable(functions, "setLetterFeedback");
  await fn({ profileId, letterId, feedback });
}

export async function answerLetterQuestion(profileId: string, letterId: string, questionId: string, optionId: string): Promise<void> {
  const fn = httpsCallable(functions, "answerLetterQuestion");
  await fn({ profileId, letterId, questionId, optionId });
}

export async function askInLetter(profileId: string, question: string, language?: string): Promise<{ answer: string }> {
  const fn = httpsCallable<{ profileId: string; question: string; language?: string }, { answer: string; model: string }>(functions, "askInLetter");
  return (await fn({ profileId, question, language })).data;
}

export async function generateLetterNow(profileId: string): Promise<{ letterId: string; costUsd: number }> {
  const fn = httpsCallable<{ profileId: string }, { ok: boolean; letterId: string; costUsd: number }>(functions, "generateLetterNow");
  return (await fn({ profileId })).data;
}
