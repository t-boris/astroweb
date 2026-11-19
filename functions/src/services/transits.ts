import { computeNatalChart } from "../astro/chart";
import { detectAspect } from "../astro/aspects";
import type { ChartResult } from "../types";

/**
 * Current transits relative to a natal chart. Planet positions are computed for
 * "now" (location-independent for longitudes); aspects to the natal chart are
 * computed in code. The natal chart passed in should already have its houses
 * relocated to the current residence (via resolveOwnedChart relocation).
 */

const SLOW = new Set(["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]);
const LUMINARY = new Set(["Sun", "Moon", "Mercury", "Venus", "Mars"]);

interface LocalParts {
  date: string; // YYYY-MM-DD in the residence timezone
  time: string; // HH:mm
}
function localParts(when: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(when).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

export interface TransitContext {
  positions: string; // human-readable current planet positions
  aspects: string; // transit→natal aspects, most significant first
}

export function computeTransits(
  natal: ChartResult,
  residence: { lat: number; lng: number; timezone: string },
  when: Date,
): TransitContext {
  const lp = localParts(when, residence.timezone);
  const nowChart = computeNatalChart({
    birthDate: lp.date,
    birthTime: lp.time,
    timeUnknown: false,
    lat: residence.lat,
    lng: residence.lng,
    timezone: residence.timezone,
    houseSystem: "koch",
  });

  const positions = nowChart.points
    .map((p) => `${p.body} ${p.sign} ${Math.floor(p.degreeInSign)}°`)
    .join(" · ");

  const found: { line: string; weight: number; exactness: number }[] = [];
  for (const tp of nowChart.points) {
    for (const np of natal.points) {
      const aspect = detectAspect(tp.body, tp.lon, np.body, np.lon);
      if (!aspect) continue;
      // Weight: slow transiting planets to personal natal points matter most.
      const weight = (SLOW.has(tp.body) ? 2 : 1) + (LUMINARY.has(np.body) ? 1 : 0) + aspect.exactness;
      found.push({
        line: `Transit ${tp.body} ${aspect.type} natal ${np.body} (orb ${aspect.orb.toFixed(1)}°)`,
        weight,
        exactness: aspect.exactness,
      });
    }
  }
  found.sort((a, b) => b.weight - a.weight || b.exactness - a.exactness);
  const aspects = found.slice(0, 8).map((f) => f.line).join("\n");
  return { positions, aspects };
}

/**
 * Sample transits across a multi-day period (`periodStart`..`periodEnd`, YYYY-MM-DD)
 * so three-month forecasts and monthly/yearly horoscopes can ground timing in
 * real planetary movements without extra API calls.
 */
export function computePeriodTransits(
  natal: ChartResult,
  residence: { lat: number; lng: number; timezone: string },
  periodStart: string,
  periodEnd: string,
  sampleCount = 3,
): string {
  const startMs = Date.parse(`${periodStart}T12:00:00Z`);
  const endMs = Date.parse(`${periodEnd}T12:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return "none";
  const count = Math.max(1, Math.min(6, Math.floor(sampleCount)));
  const blocks: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const ratio = count === 1 ? 0 : i / (count - 1);
    const sampleDate = new Date(Math.round(startMs + (endMs - startMs) * ratio));
    const dateLabel = sampleDate.toISOString().slice(0, 10);
    const t = computeTransits(natal, residence, sampleDate);
    const topAspects = t.aspects
      .split("\n")
      .filter(Boolean)
      .slice(0, 5)
      .join("; ");
    blocks.push(
      `[${dateLabel}] Sky: ${t.positions}${topAspects ? `\nKey natal contacts: ${topAspects}` : ""}`,
    );
  }
  return blocks.join("\n\n");
}
