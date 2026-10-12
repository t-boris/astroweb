import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { Sparkles, ThumbsUp, ThumbsDown } from "lucide-react";
import {
  listLetters,
  markLetterRead,
  setLetterFeedback,
  answerLetterQuestion,
  askInLetter,
  generateLetterNow,
  type Letter,
} from "@/api/letters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LetterCard({ profileId, letter }: { profileId: string; letter: Letter }) {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState(letter.questions ?? []);
  const [feedback, setFeedback] = useState(letter.feedback);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState<string | null>(null);

  useEffect(() => {
    void markLetterRead(profileId, letter.id).catch(() => {});
  }, [profileId, letter.id]);

  async function tap(qid: string, option: string) {
    setQuestions((prev) => prev.map((q) => (q.id === qid ? { ...q, answeredOption: option } : q)));
    await answerLetterQuestion(profileId, letter.id, qid, option).catch(() => {});
  }
  async function fb(v: "resonated" | "missed") {
    setFeedback(v);
    await setLetterFeedback(profileId, letter.id, v).catch(() => {});
  }
  async function submitAsk() {
    const q = ask.trim();
    if (!q) return;
    setAsking(true);
    setAskErr(null);
    try {
      const r = await askInLetter(profileId, q);
      setAnswer(r.answer);
      setAsk("");
      window.dispatchEvent(new Event("astroweb:stars-changed"));
    } catch (e) {
      setAskErr((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="ds-card space-y-4 p-4 sm:p-5">
      <p className="text-xs text-muted-foreground">{new Date(letter.generatedAt).toLocaleDateString()}</p>
      <div
        className="space-y-3 text-[15px] leading-relaxed text-muted-foreground [&_h3]:mt-1 [&_h3]:font-serif [&_h3]:text-base [&_h3]:text-[#8fb6ff] [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_li]:marker:text-[#8fb6ff]/70"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(letter.html, { USE_PROFILES: { html: true } }) }}
      />

      {questions.length > 0 && (
        <div className="space-y-3 border-t border-border/40 pt-3">
          {questions.map((q) => (
            <div key={q.id} className="space-y-1.5">
              <p className="text-sm text-muted-foreground">{q.text}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => tap(q.id, opt)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      q.answeredOption === opt
                        ? "border-primary bg-primary/20 text-[#8fb6ff]"
                        : "border-border/60 text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2">
          <Input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAsk()}
            placeholder={t("letters.askPlaceholder", "Ask about this letter… (✦1)")}
            className="h-9"
          />
          <Button size="sm" onClick={submitAsk} disabled={asking} className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]">
            {asking ? "…" : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
        {askErr && <p className="text-xs text-destructive">{askErr}</p>}
        {answer && <div className="rounded-md border border-border/40 bg-background/40 p-3 text-sm whitespace-pre-wrap">{answer}</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-border/40 pt-3">
        <span className="text-xs text-muted-foreground">{t("letters.feedback", "Did this resonate?")}</span>
        <button type="button" onClick={() => fb("resonated")} className={`rounded-md p-1.5 ${feedback === "resonated" ? "text-[#8fb6ff]" : "text-muted-foreground hover:text-foreground"}`}><ThumbsUp className="h-4 w-4" /></button>
        <button type="button" onClick={() => fb("missed")} className={`rounded-md p-1.5 ${feedback === "missed" ? "text-[#8fb6ff]" : "text-muted-foreground hover:text-foreground"}`}><ThumbsDown className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** Reusable letters inbox — used standalone (page) and inside the Astrologer tab. */
export default function LettersInbox({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setLetters(await listLetters(profileId));
      setError(null);
      setNeedSignIn(false);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("unauthenticated") || msg.includes("Sign in")) setNeedSignIn(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await generateLetterNow(profileId);
      window.dispatchEvent(new Event("astroweb:stars-changed"));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  // The Astrologer tab already shows AstrologerPanel's sign-in CTA above this
  // inbox; rendering a second identical card here just looks like a duplicate.
  if (needSignIn) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-[#8fb6ff]">{t("letters.title", "Letters from your astrologer")}</h2>
        <Button size="sm" onClick={generate} disabled={generating} className="bg-primary/20 border border-primary text-primary hover:bg-primary/30">
          {generating ? t("letters.generating", "Writing…") : t("letters.generateSample", "Generate a letter")}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="py-8 text-center text-muted-foreground">{t("common.loading", "Loading…")}</p>}
      {!loading && letters.length === 0 && (
        <div className="ds-card p-8 text-center text-muted-foreground">{t("letters.empty", "No letters yet. Generate one to see how your astrologer writes for you.")}</div>
      )}
      {letters.map((l) => (
        <LetterCard key={l.id} profileId={profileId} letter={l} />
      ))}
    </div>
  );
}
