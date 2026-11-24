import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ImageUp, RotateCcw, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpBubble } from "@/components/HelpBubble";
import { AiReading } from "@/components/AiReading";
import { pointLabel } from "@/components/chart/utils/labels";
import type { PreparedPicture } from "@/lib/chartPicture";
import {
  coordinatesLabel,
  failureTextKey,
  formatBirthDay,
  roundAccuracy,
  wasRefunded,
  type ReadFailure,
} from "@/lib/explainChart";
import type { AppLanguage } from "@/lib/language";
import { TOKEN_COST } from "@/lib/tokens";
import type { ChartPictureReading, ReadChartPoint, RecoveredBirth } from "@/types";

/** The pieces of the Explain my natal chart page, drawn from props only (the page holds the state). */

const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,image/heif";

/** Where the picture is chosen, dropped or pasted, and its preview once chosen. */
export function PicturePicker({
  picture,
  preparing,
  disabled,
  onFile,
}: {
  picture: PreparedPicture | null;
  preparing: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !disabled) onFile(file);
  }

  return (
    <div
      data-picture-drop
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
        dragging ? "border-primary bg-primary/10" : "border-primary/30"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-picture-input
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      {picture ? (
        <img
          src={picture.dataUrl}
          alt={t("explainChart.pick.previewAlt")}
          className="mx-auto mb-4 max-h-[420px] w-auto rounded-md border border-border/40"
        />
      ) : (
        <ImageUp className="mx-auto mb-3 h-10 w-10 text-primary/70" aria-hidden />
      )}
      <Button type="button" variant={picture ? "outline" : "default"} disabled={disabled || preparing} onClick={() => input.current?.click()}>
        {preparing ? t("explainChart.pick.preparing") : picture ? t("explainChart.pick.change") : t("explainChart.pick.choose")}
      </Button>
      <p className="mt-3 text-sm text-muted-foreground">{t("explainChart.pick.dropHint")}</p>
    </div>
  );
}

/** The read button, or the way to stars when the balance is short. */
export function ReadAction({
  signedIn,
  stars,
  firstProfileId,
  busy,
  disabled,
  onRead,
}: {
  signedIn: boolean;
  /** The balance; null while it is not known. */
  stars: number | null;
  firstProfileId: string | null;
  busy: boolean;
  disabled: boolean;
  onRead: () => void;
}) {
  const { t } = useTranslation();
  const cost = TOKEN_COST.chartReading;
  const short = signedIn && stars !== null && stars < cost;

  if (short) {
    return (
      <div className="space-y-2" data-read-action="short">
        {firstProfileId ? (
          <Button asChild className="bg-[#e8c969] text-[#1a1606] hover:bg-[#f2dd9a]">
            <Link to={`/profile/${firstProfileId}?tab=premium`}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {t("premium.needStars", { count: cost })}
            </Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("explainChart.read.buyNeedsProfile")}{" "}
            <Link to="/profile/new" className="text-primary hover:underline">
              {t("home.createProfile")}
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-read-action={signedIn ? "read" : "sign-in"}>
      <Button type="button" size="lg" disabled={busy || disabled} onClick={onRead}>
        <Sparkles className="mr-1.5 h-4 w-4" />
        {signedIn ? t("explainChart.read.button", { count: cost }) : t("explainChart.read.signIn", { count: cost })}
      </Button>
      {signedIn && stars !== null && <p className="text-xs text-muted-foreground">{t("explainChart.read.balance", { count: stars })}</p>}
    </div>
  );
}

/** Why the picture gave no birth, and whether the star went back. */
export function FailureNote({ failure }: { failure: ReadFailure }) {
  const { t } = useTranslation();
  return (
    <div role="alert" data-failure={failure.kind === "not_read" ? failure.reason : failure.kind} className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <p className="text-foreground">{t(failureTextKey(failure))}</p>
      {wasRefunded(failure) && <p className="mt-1 text-muted-foreground">{t("explainChart.failure.refunded")}</p>}
    </div>
  );
}

/** When and where the person was born, with the accuracy. */
export function RecoveredBirthCard({
  birth,
  placeName,
  language,
  charged,
}: {
  birth: RecoveredBirth;
  /** The name of the place; undefined while it is looked up, null when none was found. */
  placeName: string | null | undefined;
  language: AppLanguage;
  charged: boolean;
}) {
  const { t } = useTranslation();
  const place = placeName === undefined ? "…" : placeName || coordinatesLabel(birth.lat, birth.lng);
  return (
    <Card className="ds-card" data-recovered-birth>
      <CardContent className="space-y-2 pt-6">
        <HelpBubble helpKey="explainChart.accuracy" side="top">
          <h2 className="font-serif text-2xl text-foreground">{t("explainChart.result.bornTitle")}</h2>
        </HelpBubble>
        <p className="font-serif text-3xl text-[#e8c969]">{formatBirthDay(birth.birthDate, language)}</p>
        <p className="text-foreground">
          {t("explainChart.result.time", { time: birth.birthTime, minutes: roundAccuracy(birth.timeAccuracyMinutes) })}
        </p>
        <p className="text-foreground">{t("explainChart.result.place", { place, km: roundAccuracy(birth.placeAccuracyKm) })}</p>
        <p className="text-sm text-muted-foreground">{t("explainChart.result.timezone", { zone: birth.timezone })}</p>
        {!charged && <p className="text-sm text-muted-foreground">{t("explainChart.result.free")}</p>}
      </CardContent>
    </Card>
  );
}

function positionText(t: TFunction, point: ReadChartPoint): string {
  const sign = t(`signs.${point.sign}`);
  const minute = point.minute === null ? "" : `${String(point.minute).padStart(2, "0")}′`;
  return `${point.estimated ? "≈ " : ""}${point.degree}°${minute} ${sign}${point.retrograde ? " ℞" : ""}`;
}

/** The positions the model read, and whether each fits the solved moment. */
export function ReadPointsTable({ reading }: { reading: ChartPictureReading }) {
  const { t } = useTranslation();
  const rows = [...reading.points, ...(reading.asc ? [reading.asc] : []), ...(reading.mc ? [reading.mc] : [])];
  const misread = rows.filter((p) => p.matched === false);
  return (
    <details className="ds-card group p-4" data-read-points>
      <summary className="cursor-pointer font-serif text-lg text-foreground">{t("explainChart.result.readTitle")}</summary>
      {misread.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground" data-misread>
          {t("explainChart.result.partial", { points: misread.map((p) => pointLabel(t, p.id)).join(", ") })}
        </p>
      )}
      <table className="mt-3 w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-normal">{t("explainChart.result.colPoint")}</th>
            <th className="py-1 pr-3 font-normal">{t("explainChart.result.colPosition")}</th>
            <th className="py-1 font-normal">{t("explainChart.result.colCheck")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((point) => (
            <tr key={point.id} data-point={point.id} data-matched={point.matched === undefined ? "none" : String(point.matched)} className="border-t border-border/30">
              <td className="py-1 pr-3">{pointLabel(t, point.id)}</td>
              <td className="py-1 pr-3">{positionText(t, point)}</td>
              <td className="py-1">
                {point.matched === undefined
                  ? t("explainChart.result.notChecked")
                  : point.matched
                    ? t("explainChart.result.fits")
                    : t("explainChart.result.off", { minutes: Math.round(point.deviationArcmin ?? 0) })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** The story about the person, as it is being written, written, or failed. */
export function StorySection({ text, state, onRetry }: { text: string | null; state: "loading" | "failed" | "done"; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="ds-card" data-story={state}>
      <CardContent className="space-y-3 pt-6">
        <h2 className="font-serif text-2xl text-foreground">{t("explainChart.result.storyTitle")}</h2>
        {state === "done" && text && <AiReading text={text} />}
        {state === "loading" && <p className="text-sm text-muted-foreground">{t("explainChart.result.storyLoading")}</p>}
        {state === "failed" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("explainChart.result.storyFailed")}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t("errors.retry")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Keep the person: the profile form opens filled in with the recovered birth. */
export function SaveAsProfile({ onSave }: { onSave: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="ds-card" data-save-profile>
      <CardContent className="space-y-3 pt-6">
        <h2 className="font-serif text-2xl text-foreground">{t("explainChart.save.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("explainChart.save.text")}</p>
        <Button type="button" onClick={onSave}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          {t("explainChart.save.button")}
        </Button>
      </CardContent>
    </Card>
  );
}
