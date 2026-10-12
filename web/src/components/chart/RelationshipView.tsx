import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toAppLanguage } from "@/lib/language";
import { FirebaseError } from "firebase/app";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { askRelationship } from "@/api/ai";
import { trackEvent, trackOnce } from "@/lib/analytics";
import PlaceSearch from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TOKEN_COST } from "@/lib/tokens";
import { AiReading } from "@/components/AiReading";

interface RelationshipViewProps {
  profileId: string;
  ownerDeviceId: string;
  relocationLat?: number | null;
  relocationLng?: number | null;
  tokens?: number;
  compatibilityIncluded?: boolean;
  onUnlocked?: () => void;
  onPurchasePremium?: () => void;
}

/** A paid compatibility reading — persisted so it survives tab switches. */
interface CompatEntry {
  partnerName: string;
  partnerBirthDate: string;
  partnerBirthPlace: string;
  answer: string;
  partnerTimezone: string | null;
  generatedAt: string;
}

function compatStorageKey(profileId: string): string {
  return `astroweb:compat:v1:${profileId}`;
}

function cleanAiArtifacts(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/\*Continuation:\*\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function RelationshipView({
  profileId,
  ownerDeviceId,
  relocationLat,
  relocationLng,
  tokens = 0,
  onUnlocked,
  onPurchasePremium,
}: RelationshipViewProps) {
  const { t, i18n } = useTranslation();
  const language = toAppLanguage(i18n.resolvedLanguage);
  const canAfford = tokens >= TOKEN_COST.compatibility;

  // Funnel: the compatibility paywall (not enough stars) is on screen.
  useEffect(() => {
    if (!canAfford) trackOnce(profileId, "paywall_viewed", { feature: "compatibility" });
  }, [canAfford, profileId]);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthPlace, setBirthPlace] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CompatEntry[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Restore previously generated (paid) readings on mount so they survive tab
  // switches and reloads — nothing the user paid for should silently vanish.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(compatStorageKey(profileId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as CompatEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setHistory(parsed);
      }
    } catch {
      /* ignore corrupt cache */
    }
  }, [profileId]);

  // Persist whenever the history changes.
  useEffect(() => {
    try {
      localStorage.setItem(
        compatStorageKey(profileId),
        JSON.stringify(history.slice(0, 20)),
      );
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [history, profileId]);

  function handlePlaceSelect(place: { name: string; lat: number; lng: number }) {
    setBirthPlace(place.name);
    setLat(place.lat);
    setLng(place.lng);
    setErrors((prev) => {
      const { birthPlace: _birthPlace, ...rest } = prev;
      return rest;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!name.trim()) {
      next.name = t("profile.validation.nameRequired");
    }
    if (!birthDate) {
      next.birthDate = t("profile.validation.birthDateRequired");
    }
    if (!timeUnknown && !birthTime) {
      next.birthTime = t("profile.validation.birthTimeRequired");
    }
    if (!birthPlace || lat === null || lng === null) {
      next.birthPlace = t("profile.validation.birthPlaceRequired");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleGenerate() {
    if (!validate()) return;
    if (!canAfford) {
      onPurchasePremium?.();
      return;
    }

    setLoading(true);
    setError(null);
    trackEvent("ai_reading_requested", { kind: "compatibility" });

    try {
      const response = await askRelationship({
        profileId,
        ownerDeviceId,
        language,
        relocationLat: relocationLat ?? undefined,
        relocationLng: relocationLng ?? undefined,
        partner: {
          name: name.trim(),
          birthDate,
          birthTime: timeUnknown ? null : birthTime,
          timeUnknown,
          birthPlace,
          lat: lat!,
          lng: lng!,
        },
      });

      const entry: CompatEntry = {
        partnerName: name.trim(),
        partnerBirthDate: birthDate,
        partnerBirthPlace: birthPlace,
        answer: cleanAiArtifacts(response.answer),
        partnerTimezone: response.partnerTimezone,
        generatedAt: new Date().toISOString(),
      };

      // Persist straight to storage first — if the user switched tabs while the
      // ✦2 reading was generating, this component has unmounted and setHistory
      // below is a no-op. The paid reading must survive regardless.
      try {
        const raw = localStorage.getItem(compatStorageKey(profileId));
        const prev = raw ? (JSON.parse(raw) as CompatEntry[]) : [];
        localStorage.setItem(
          compatStorageKey(profileId),
          JSON.stringify([entry, ...(Array.isArray(prev) ? prev : [])].slice(0, 20)),
        );
      } catch {
        /* storage unavailable — fall back to state-only persistence */
      }

      setHistory((prev) => [entry, ...prev].slice(0, 20));

      // ✦2 was spent server-side — refresh the inline balance and header.
      onUnlocked?.();
      window.dispatchEvent(new Event("astroweb:stars-changed"));
    } catch (err) {
      if (err instanceof FirebaseError && err.message.includes("invalid-argument")) {
        setError(t("errors.invalidProfileData"));
      } else if (err instanceof FirebaseError && err.message.includes("failed-precondition")) {
        // INSUFFICIENT_TOKENS — balance changed under us; steer to purchase.
        onPurchasePremium?.();
      } else {
        setError(t("errors.aiFailed"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{t("ai.relationshipTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("ai.relationshipDescription")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="relationship-name">{t("ai.partnerNameLabel")}</Label>
          <Input
            id="relationship-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("profile.form.namePlaceholder")}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="relationship-date">{t("ai.partnerBirthDateLabel")}</Label>
          <Input
            id="relationship-date"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          {errors.birthDate && <p className="text-sm text-destructive">{errors.birthDate}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Switch
            id="relationship-time-unknown"
            checked={timeUnknown}
            onCheckedChange={(checked) => {
              setTimeUnknown(checked);
              if (checked) {
                setBirthTime("");
              }
            }}
          />
          <Label htmlFor="relationship-time-unknown">{t("ai.partnerTimeUnknown")}</Label>
        </div>

        {!timeUnknown && (
          <div className="space-y-2 md:max-w-xs">
            <Label htmlFor="relationship-time">{t("ai.partnerBirthTimeLabel")}</Label>
            <Input
              id="relationship-time"
              type="time"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
            />
            {errors.birthTime && <p className="text-sm text-destructive">{errors.birthTime}</p>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t("ai.partnerBirthPlaceLabel")}</Label>
        <PlaceSearch onSelect={handlePlaceSelect} initialValue={birthPlace || undefined} />
        {errors.birthPlace && <p className="text-sm text-destructive">{errors.birthPlace}</p>}
        {lat !== null && lng !== null && (
          <p className="text-xs text-muted-foreground">
            {t("ai.partnerCoordinatesLabel")}: {lat.toFixed(4)}, {lng.toFixed(4)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={canAfford ? handleGenerate : onPurchasePremium}
          disabled={loading}
        >
          {loading
            ? t("ai.relationshipGenerating")
            : canAfford
              ? `${t("ai.relationshipGenerate")} ✦${TOKEN_COST.compatibility}`
              : t("premium.needStars", { count: TOKEN_COST.compatibility, defaultValue: `Need ✦${TOKEN_COST.compatibility} — buy stars` })}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {history.length > 0 && (
        <div className="space-y-3">
          {history.map((entry) => {
            const key = `${entry.generatedAt}-${entry.partnerName}`;
            const isCollapsed = collapsed[key] ?? false;
            return (
              <div key={key} className="rounded-md border bg-background/60 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("ai.relationshipAnswerTitle")}
                    </p>
                    <p className="font-serif text-sm text-[#8fb6ff]">
                      {entry.partnerName}
                      {entry.partnerBirthDate ? ` · ${entry.partnerBirthDate}` : ""}
                    </p>
                    {entry.partnerTimezone && (
                      <p className="text-xs text-muted-foreground">
                        {t("ai.relationshipPartnerTimezone", { timezone: entry.partnerTimezone })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={isCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                      title={isCollapsed ? t("ai.expandExplanation") : t("ai.collapseExplanation")}
                      onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !isCollapsed }))}
                    >
                      {isCollapsed ? <ChevronDown /> : <ChevronUp />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("common.delete", "Delete")}
                      title={t("common.delete", "Delete")}
                      onClick={() => setHistory((prev) => prev.filter((e) => `${e.generatedAt}-${e.partnerName}` !== key))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                {!isCollapsed && <AiReading text={entry.answer} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
