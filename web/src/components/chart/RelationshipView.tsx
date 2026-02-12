import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { askRelationship } from "@/api/ai";
import PlaceSearch from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface RelationshipViewProps {
  profileId: string;
  ownerDeviceId: string;
  relocationLat?: number | null;
  relocationLng?: number | null;
}

function cleanAiArtifacts(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\[END_OF_REPORT\]/g, "")
    .replace(/\*Continuation:\*\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const boldPattern = /(\*\*[^*]+?\*\*|__[^_]+?__)/g;
  let lastIndex = 0;
  let keyIndex = 0;

  for (const match of text.matchAll(boldPattern)) {
    const full = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const content = full.slice(2, -2).trim();
    if (content.length > 0) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${keyIndex}`}>
          {content}
        </strong>,
      );
      keyIndex += 1;
    }

    lastIndex = start + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function RelationshipText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        if (/^#{1,6}\s+/.test(trimmed)) {
          const title = trimmed.replace(/^#{1,6}\s+/, "");
          return (
            <h4 key={`h-${index}`} className="text-sm font-semibold">
              {renderInlineMarkdown(title, `h-${index}`)}
            </h4>
          );
        }

        if (/^(-|\*|\d+\.)\s+/.test(trimmed)) {
          const item = trimmed.replace(/^(-|\*|\d+\.)\s+/, "");
          return (
            <p key={`li-${index}`} className="text-sm leading-relaxed pl-4">
              •{" "}
              {renderInlineMarkdown(item, `li-${index}`)}
            </p>
          );
        }

        return (
          <p key={`p-${index}`} className="text-sm leading-relaxed whitespace-pre-wrap">
            {renderInlineMarkdown(trimmed, `p-${index}`)}
          </p>
        );
      })}
    </div>
  );
}

export function RelationshipView({
  profileId,
  ownerDeviceId,
  relocationLat,
  relocationLng,
}: RelationshipViewProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("ru") ? "ru" : "en";

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
  const [answer, setAnswer] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [partnerTimezone, setPartnerTimezone] = useState<string | null>(null);

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

    setLoading(true);
    setError(null);

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

      setAnswer(cleanAiArtifacts(response.answer));
      setModel(response.model);
      setPartnerTimezone(response.partnerTimezone);
    } catch (err) {
      if (err instanceof FirebaseError && err.message.includes("invalid-argument")) {
        setError(t("errors.invalidProfileData"));
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
        <Button type="button" onClick={handleGenerate} disabled={loading}>
          {loading ? t("ai.relationshipGenerating") : t("ai.relationshipGenerate")}
        </Button>
        {model && (
          <span className="text-xs text-muted-foreground">
            {t("ai.modelLabel", { model })}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {answer && (
        <div className="rounded-md border bg-background/60 p-4 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("ai.relationshipAnswerTitle")}
          </p>
          {partnerTimezone && (
            <p className="text-xs text-muted-foreground">
              {t("ai.relationshipPartnerTimezone", { timezone: partnerTimezone })}
            </p>
          )}
          <RelationshipText text={answer} />
        </div>
      )}
    </div>
  );
}
