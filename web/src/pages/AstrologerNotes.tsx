import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { X, Plus, Trash2, Check } from "lucide-react";
import {
  getDossier,
  setDossierInterests,
  deleteDossierFact,
  confirmDossierFact,
  forgetDossier,
} from "@/api/dossier";
import type { Dossier, DossierFact, StyleProfile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTED = ["career", "money", "love", "health", "creativity", "sport", "tech", "travel", "family", "spirituality"];

const DEFAULT_STYLE = { humor: 0.4, seriousness: 0.5, warmth: 0.6, brevity: 0.6 };
function isDefaultStyle(s: StyleProfile | null): boolean {
  if (!s) return true;
  return (
    s.humor === DEFAULT_STYLE.humor &&
    s.seriousness === DEFAULT_STYLE.seriousness &&
    s.warmth === DEFAULT_STYLE.warmth &&
    s.brevity === DEFAULT_STYLE.brevity
  );
}
function registerLine(s: StyleProfile | null, t: (k: string, d?: string) => string): string {
  // No interactions yet → the register hasn't been learned, say so honestly.
  if (isDefaultStyle(s)) return t("notes.stillLearning", "still getting to know you");
  const parts: string[] = [];
  if (s!.warmth >= 0.6) parts.push(t("notes.warm", "warm"));
  if (s!.humor >= 0.55) parts.push(t("notes.playful", "lightly playful"));
  else if (s!.seriousness >= 0.65) parts.push(t("notes.serious", "grounded"));
  if (s!.brevity >= 0.65) parts.push(t("notes.concise", "concise"));
  return parts.join(", ") || t("notes.registerNeutral", "warm, balanced tone");
}

export default function AstrologerNotes() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [facts, setFacts] = useState<DossierFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const { dossier, facts } = await getDossier(id);
      setDossier(dossier);
      setFacts(facts);
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
  }, [id]);

  async function saveTags(tags: string[]) {
    if (!id) return;
    const d = await setDossierInterests(id, tags);
    setDossier(d);
  }
  function addTag(tag: string) {
    const tg = tag.trim().toLowerCase();
    if (!tg || !dossier || dossier.interests.includes(tg)) return;
    void saveTags([...dossier.interests, tg]);
    setNewTag("");
  }
  function removeTag(tag: string) {
    if (!dossier) return;
    void saveTags(dossier.interests.filter((x) => x !== tag));
  }
  async function handleDeleteFact(factId: string) {
    if (!id) return;
    await deleteDossierFact(id, factId);
    setFacts((prev) => prev.filter((f) => f.id !== factId));
  }
  async function handleConfirm(factId: string) {
    if (!id) return;
    await confirmDossierFact(id, factId);
    setFacts((prev) => prev.map((f) => (f.id === factId ? { ...f, confirmed: true } : f)));
  }
  async function handleForget() {
    if (!id) return;
    setConfirming(false);
    await forgetDossier(id);
    await load();
  }

  function provenance(f: DossierFact): string {
    if (f.source === "tap" || f.source === "onboarding") return t("notes.youToldUs", "You told us");
    return t("notes.inferred", "Your astrologer inferred this from your question");
  }

  if (loading) return <p className="py-12 text-center text-muted-foreground">{t("common.loading", "Loading…")}</p>;
  if (needSignIn) return <div className="ds-card mx-auto max-w-md p-6 text-center text-muted-foreground">{t("hub.signInRequired", "Sign in to manage your dossier.")}</div>;
  if (error) return <p className="py-12 text-center text-destructive">{error}</p>;
  if (!dossier) return null;

  const interestTags = dossier.interests;
  const suggestions = SUGGESTED.filter((s) => !interestTags.includes(s));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl text-[#8fb6ff]">{t("notes.title", "What your astrologer knows")}</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/profile/${id}`}>{t("profile.detail.back", "Back")}</Link>
        </Button>
      </div>

      {/* Register */}
      <div className="ds-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("notes.register", "Talks to you in a")}</p>
        <p className="font-serif text-lg">{registerLine(dossier.styleProfile, (k, d) => t(k, { defaultValue: d }))}</p>
      </div>

      {/* Interest tags */}
      <div className="ds-card space-y-3 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("notes.interests", "Your interests")}</p>
        <div className="flex flex-wrap gap-2">
          {interestTags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-[#8fb6ff]">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} aria-label="remove"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {interestTags.length === 0 && <span className="text-sm text-muted-foreground">{t("notes.noInterests", "No interests yet")}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag(newTag)} placeholder={t("notes.addInterest", "Add an interest…")} className="h-9 max-w-xs" />
          <Button size="sm" variant="outline" onClick={() => addTag(newTag)}><Plus className="h-4 w-4" /></Button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => addTag(s)} className="rounded-full border border-border/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground">+ {s}</button>
            ))}
          </div>
        )}
      </div>

      {/* Facts */}
      <div className="ds-card space-y-2 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("notes.facts", "Notes about you")}</p>
        {facts.length === 0 && <p className="text-sm text-muted-foreground">{t("notes.noFacts", "Nothing learned yet — ask the oracle and it will get to know you.")}</p>}
        {facts.map((f) => (
          <div key={f.id} className="flex items-start justify-between gap-2 border-b border-border/40 py-2 last:border-0">
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">{f.key}:</span> {f.value}
                {f.sensitive && !f.confirmed && <span className="ml-2 rounded bg-[#e8c969]/15 px-1.5 py-0.5 text-[11px] text-[#e8c969]">{t("notes.pending", "needs your OK")}</span>}
              </p>
              <p className="text-[11px] text-muted-foreground">{provenance(f)}</p>
            </div>
            <div className="flex flex-none items-center gap-1">
              {f.sensitive && !f.confirmed && (
                <button type="button" onClick={() => handleConfirm(f.id)} title={t("notes.confirm", "Confirm")} className="rounded-md border border-border/60 p-1.5 text-muted-foreground hover:border-primary hover:text-primary"><Check className="h-3.5 w-3.5" /></button>
              )}
              <button type="button" onClick={() => handleDeleteFact(f.id)} title={t("common.delete", "Delete")} className="rounded-md border border-border/60 p-1.5 text-muted-foreground hover:border-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Forget */}
      <div className="ds-card p-4">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("notes.forgetConfirm", "Delete everything your astrologer knows about this chart?")}</span>
            <Button size="sm" variant="outline" className="border-destructive text-destructive" onClick={handleForget}>{t("notes.forgetYes", "Forget all")}</Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>{t("common.cancel", "Cancel")}</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => setConfirming(true)}>{t("notes.forget", "Forget everything")}</Button>
        )}
      </div>
    </div>
  );
}
