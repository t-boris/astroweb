import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toAppLanguage } from "@/lib/language";
import { getForecast } from "@/api/forecast";
import { AiReading } from "@/components/AiReading";

export function ForecastView({ profileId, ownerDeviceId }: { profileId: string; ownerDeviceId: string }) {
  const { t, i18n } = useTranslation();
  const language = toAppLanguage(i18n.resolvedLanguage);
  const [text, setText] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `astroweb:forecast:v1:${profileId}:${language}:${today}`;

    // Client cache: today's forecast doesn't change, so don't re-fetch (or even
    // hit the server) when re-opening the tab — load it instantly.
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { text: string; date: string };
        setText(cached.text);
        setDate(cached.date);
        setLoading(false);
        return () => { cancelled = true; };
      }
    } catch {
      /* ignore corrupt cache */
    }

    setLoading(true);
    setError(null);
    getForecast({ profileId, ownerDeviceId, language })
      .then((r) => {
        if (cancelled) return;
        setText(r.text);
        setDate(r.date);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ text: r.text, date: r.date }));
        } catch {
          /* storage full — non-fatal */
        }
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId, ownerDeviceId, language]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs uppercase tracking-[0.28em] text-[#8fb6ff]">
          ✦ {t("forecast.eyebrow", "Forecast")}
        </div>
        <h2 className="font-serif text-2xl text-foreground">
          {t("forecast.title", "Transits & Cosmic Weather")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("forecast.subtitle", "How today's sky touches your natal chart.")}
          {date ? ` · ${date}` : ""}
        </p>
      </div>

      {loading && (
        <p className="text-muted-foreground">{t("forecast.loading", "Reading today's sky…")}</p>
      )}
      {error && <p className="text-destructive">{t("errors.unknownError")}</p>}

      {!loading && !error && text && (
        <div
          className="ds-card space-y-3 p-4 sm:p-6"
          style={{ background: "linear-gradient(120deg, rgba(91,141,239,0.12), rgba(140,165,235,0.04))" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌙</span>
            <h3 className="font-serif text-xl text-[#8fb6ff]">
              {t("forecast.todayTitle", "Today's cosmic weather")}
            </h3>
          </div>
          <AiReading text={text} />
        </div>
      )}
    </div>
  );
}
