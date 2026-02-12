import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChartAspect, ChartResult } from "@/types";
import {
  PLANET_GLYPHS,
  ZODIAC_GLYPHS,
  ASPECT_GLYPHS,
  ASPECT_COLORS,
  SIGN_ELEMENTS,
  ELEMENT_COLORS,
} from "@/components/chart/utils/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TraditionalPlanet =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Mars"
  | "Jupiter"
  | "Saturn";

const TRADITIONAL_PLANETS: TraditionalPlanet[] = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
];

const SIGN_ORDER = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const;

const SIGN_RULERS: Record<string, TraditionalPlanet> = {
  Aries: "Mars",
  Taurus: "Venus",
  Gemini: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Virgo: "Mercury",
  Libra: "Venus",
  Scorpio: "Mars",
  Sagittarius: "Jupiter",
  Capricorn: "Saturn",
  Aquarius: "Saturn",
  Pisces: "Jupiter",
};

const EXALTATION_RULERS: Partial<Record<string, TraditionalPlanet>> = {
  Aries: "Sun",
  Taurus: "Moon",
  Cancer: "Jupiter",
  Virgo: "Mercury",
  Libra: "Saturn",
  Capricorn: "Mars",
  Pisces: "Venus",
};

const TRIPLICITY_RULERS: Record<
  "fire" | "earth" | "air" | "water",
  {
    day: TraditionalPlanet;
    night: TraditionalPlanet;
    participating: TraditionalPlanet;
  }
> = {
  fire: { day: "Sun", night: "Jupiter", participating: "Saturn" },
  earth: { day: "Venus", night: "Moon", participating: "Mars" },
  air: { day: "Saturn", night: "Mercury", participating: "Jupiter" },
  water: { day: "Venus", night: "Mars", participating: "Moon" },
};

const FACE_RULERS: Record<string, [TraditionalPlanet, TraditionalPlanet, TraditionalPlanet]> = {
  Aries: ["Mars", "Sun", "Venus"],
  Taurus: ["Mercury", "Moon", "Saturn"],
  Gemini: ["Jupiter", "Mars", "Sun"],
  Cancer: ["Venus", "Mercury", "Moon"],
  Leo: ["Saturn", "Jupiter", "Mars"],
  Virgo: ["Sun", "Venus", "Mercury"],
  Libra: ["Moon", "Saturn", "Jupiter"],
  Scorpio: ["Mars", "Sun", "Venus"],
  Sagittarius: ["Mercury", "Moon", "Saturn"],
  Capricorn: ["Jupiter", "Mars", "Sun"],
  Aquarius: ["Venus", "Mercury", "Moon"],
  Pisces: ["Saturn", "Jupiter", "Mars"],
};

interface HouseAlmuten {
  house: number;
  sign: string;
  degreeInSign: number;
  ruler: TraditionalPlanet;
  almuten: TraditionalPlanet[];
  score: number;
  scores: Record<TraditionalPlanet, number>;
  planetsInHouse: string[];
}

interface AreaSummary {
  key: "health" | "relationships" | "finances" | "home";
  houses: HouseAlmuten[];
  areaAlmuten: TraditionalPlanet[];
  areaScore: number;
  areaScores: Record<TraditionalPlanet, number>;
  relevantAspects: ChartAspect[];
}

interface HouseAreasViewProps {
  chart: ChartResult;
}

const AREA_HOUSES: Record<AreaSummary["key"], number[]> = {
  health: [1, 6, 12],
  relationships: [5, 7, 11],
  finances: [2, 8, 10, 11],
  home: [4],
};
const HOUSE_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

function emptyScores(): Record<TraditionalPlanet, number> {
  return {
    Sun: 0,
    Moon: 0,
    Mercury: 0,
    Venus: 0,
    Mars: 0,
    Jupiter: 0,
    Saturn: 0,
  };
}

function isTraditionalPlanet(body: string): body is TraditionalPlanet {
  return TRADITIONAL_PLANETS.includes(body as TraditionalPlanet);
}

function getSignFromLongitude(lon: number): string {
  const index = Math.floor((((lon % 360) + 360) % 360) / 30);
  return SIGN_ORDER[index];
}

function getDegreeInSign(lon: number): number {
  const normalized = ((lon % 360) + 360) % 360;
  return normalized % 30;
}

function topPlanetsByScore(scores: Record<TraditionalPlanet, number>): {
  planets: TraditionalPlanet[];
  score: number;
} {
  const maxScore = Math.max(...TRADITIONAL_PLANETS.map((planet) => scores[planet]));
  return {
    planets: TRADITIONAL_PLANETS.filter((planet) => scores[planet] === maxScore),
    score: maxScore,
  };
}

function formatPlanet(planet: string): string {
  return `${PLANET_GLYPHS[planet] ?? ""} ${planet}`.trim();
}

function formatSign(sign: string, degreeInSign: number): string {
  const deg = Math.floor(degreeInSign);
  const min = Math.round((degreeInSign % 1) * 60);
  return `${ZODIAC_GLYPHS[sign] ?? ""} ${sign} ${deg}\u00b0${String(min).padStart(2, "0")}'`.trim();
}

function formatTopScores(scores: Record<TraditionalPlanet, number>): string {
  return [...TRADITIONAL_PLANETS]
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, 3)
    .map((planet) => `${planet} ${scores[planet]}`)
    .join(", ");
}

function scoreHouseAlmuten(chart: ChartResult, house: number): HouseAlmuten {
  const cuspLon = chart.houses.cusps[house - 1] ?? 0;
  const sign = getSignFromLongitude(cuspLon);
  const degreeInSign = getDegreeInSign(cuspLon);
  const scores = emptyScores();

  const ruler = SIGN_RULERS[sign];
  scores[ruler] += 5;

  const exalted = EXALTATION_RULERS[sign];
  if (exalted) {
    scores[exalted] += 4;
  }

  const element = SIGN_ELEMENTS[sign];
  const triplicity = TRIPLICITY_RULERS[element];

  const sun = chart.points.find((point) => point.body === "Sun");
  const isDayChart =
    sun?.house !== null && sun?.house !== undefined
      ? sun.house >= 7 && sun.house <= 12
      : true;

  const primaryTriplicity = isDayChart ? triplicity.day : triplicity.night;
  const secondaryTriplicity = isDayChart ? triplicity.night : triplicity.day;

  scores[primaryTriplicity] += 3;
  scores[secondaryTriplicity] += 2;
  scores[triplicity.participating] += 1;

  const decan = Math.floor(degreeInSign / 10);
  const faceRuler = FACE_RULERS[sign][Math.min(2, Math.max(0, decan))];
  scores[faceRuler] += 1;

  const planetsInHouse = chart.points
    .filter((point) => point.house === house)
    .map((point) => point.body);

  for (const planet of planetsInHouse) {
    if (isTraditionalPlanet(planet)) {
      scores[planet] += 2;
    }
  }

  const top = topPlanetsByScore(scores);

  return {
    house,
    sign,
    degreeInSign,
    ruler,
    almuten: top.planets,
    score: top.score,
    scores,
    planetsInHouse,
  };
}

function getAreaAspects(chart: ChartResult, houses: number[]): ChartAspect[] {
  const bodyToHouse = new Map(chart.points.map((point) => [point.body, point.house]));

  return chart.aspects
    .filter((aspect) => {
      const houseA = bodyToHouse.get(aspect.a);
      const houseB = bodyToHouse.get(aspect.b);
      return (
        (houseA !== null && houseA !== undefined && houses.includes(houseA)) ||
        (houseB !== null && houseB !== undefined && houses.includes(houseB))
      );
    })
    .sort((a, b) => b.exactness - a.exactness)
    .slice(0, 8);
}

function summarizeArea(chart: ChartResult, key: AreaSummary["key"]): AreaSummary {
  const houses = AREA_HOUSES[key].map((house) => scoreHouseAlmuten(chart, house));

  const areaScores = emptyScores();
  for (const house of houses) {
    for (const planet of TRADITIONAL_PLANETS) {
      areaScores[planet] += house.scores[planet];
    }
  }

  const top = topPlanetsByScore(areaScores);

  return {
    key,
    houses,
    areaAlmuten: top.planets,
    areaScore: top.score,
    areaScores,
    relevantAspects: getAreaAspects(chart, AREA_HOUSES[key]),
  };
}

export function HouseAreasView({ chart }: HouseAreasViewProps) {
  const { t } = useTranslation();

  const areas = useMemo(
    () => [
      summarizeArea(chart, "health"),
      summarizeArea(chart, "relationships"),
      summarizeArea(chart, "finances"),
      summarizeArea(chart, "home"),
    ],
    [chart],
  );

  const peopleInsights = useMemo(() => {
    const house3 = scoreHouseAlmuten(chart, 3);
    const house7 = scoreHouseAlmuten(chart, 7);
    const house11 = scoreHouseAlmuten(chart, 11);

    const socialPlanets = new Set(["Mercury", "Venus", "Mars", "Moon", "Sun", "Jupiter", "Saturn"]);
    const aspects = chart.aspects
      .filter((aspect) => socialPlanets.has(aspect.a) || socialPlanets.has(aspect.b))
      .sort((a, b) => b.exactness - a.exactness)
      .slice(0, 10);

    return { house3, house7, house11, aspects };
  }, [chart]);

  const allHouses = useMemo(
    () => HOUSE_NUMBERS.map((house) => scoreHouseAlmuten(chart, house)),
    [chart],
  );

  const renderAspectItem = (key: string, aspect: ChartAspect) => {
    const glyph = ASPECT_GLYPHS[aspect.type] ?? "•";
    const color = ASPECT_COLORS[aspect.type] ?? "currentColor";
    const hint = t(`houseAreas.aspectHints.${aspect.type}`, {
      defaultValue: t("houseAreas.aspectHints.default"),
    });

    return (
      <div key={key} className="rounded-md border bg-background/40 px-3 py-2 space-y-1">
        <p className="text-sm">
          {formatPlanet(aspect.a)}{" "}
          <span style={{ color }} className="font-semibold">
            {glyph}
          </span>{" "}
          {formatPlanet(aspect.b)}
        </p>
        <p className="text-xs text-muted-foreground">
          <span style={{ color }} className="font-semibold">
            {glyph}
          </span>{" "}
          {aspect.orb.toFixed(1)}° · {hint}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {chart.meta.timeUsed === null && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          {t("houseAreas.timeUnknownWarning")}
        </div>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>{t("houseAreas.allHouses.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("houseAreas.allHouses.subtitle")}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {allHouses.map((houseData) => {
              const signColor = ELEMENT_COLORS[SIGN_ELEMENTS[houseData.sign]]?.text;
              return (
                <div
                  key={`house-full-${houseData.house}`}
                  className="rounded-md border bg-background/30 p-3 space-y-2"
                >
                  <p className="text-sm font-semibold">
                    {houseData.house} {t("houseAreas.houseShort")}:{" "}
                    {t(`houseAreas.houseNames.${houseData.house}`)}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(`houseAreas.houseDescriptions.${houseData.house}`)}
                  </p>
                  <p className="text-sm" style={{ color: signColor }}>
                    <span className="text-muted-foreground">{t("houseAreas.table.cusp")}: </span>
                    {formatSign(houseData.sign, houseData.degreeInSign)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("houseAreas.table.ruler")}: </span>
                    {formatPlanet(houseData.ruler)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("houseAreas.almutenLabel")}: </span>
                    {houseData.almuten.map(formatPlanet).join(" / ")}
                    <span className="text-muted-foreground"> ({houseData.score})</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("houseAreas.table.planets")}: </span>
                    {houseData.planetsInHouse.length > 0
                      ? houseData.planetsInHouse.map(formatPlanet).join(", ")
                      : "\u2014"}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>{t("houseAreas.people.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("houseAreas.people.communication")}
              </p>
              <p className="text-sm mt-1">
                3 {t("houseAreas.houseShort")}: {formatSign(peopleInsights.house3.sign, peopleInsights.house3.degreeInSign)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("houseAreas.almutenLabel")}: {peopleInsights.house3.almuten.map(formatPlanet).join(" / ")}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("houseAreas.people.partnership")}
              </p>
              <p className="text-sm mt-1">
                7 {t("houseAreas.houseShort")}: {formatSign(peopleInsights.house7.sign, peopleInsights.house7.degreeInSign)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("houseAreas.almutenLabel")}: {peopleInsights.house7.almuten.map(formatPlanet).join(" / ")}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("houseAreas.people.groups")}
              </p>
              <p className="text-sm mt-1">
                11 {t("houseAreas.houseShort")}: {formatSign(peopleInsights.house11.sign, peopleInsights.house11.degreeInSign)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("houseAreas.almutenLabel")}: {peopleInsights.house11.almuten.map(formatPlanet).join(" / ")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("houseAreas.people.keyAspects")}
            </p>
            <div className="space-y-2">
              {peopleInsights.aspects.map((aspect) =>
                renderAspectItem(`people-${aspect.a}-${aspect.b}-${aspect.type}`, aspect),
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {areas.map((area) => (
        <Card key={area.key} className="glass-card">
          <CardHeader>
            <CardTitle>{t(`houseAreas.sections.${area.key}`)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">{t("houseAreas.almutenLabel")}: </span>
                {area.areaAlmuten.map(formatPlanet).join(" / ")}
                <span className="text-muted-foreground"> ({area.areaScore})</span>
              </p>
              <p className="text-muted-foreground mt-1">
                {t("houseAreas.topScores")}: {formatTopScores(area.areaScores)}
              </p>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("houseAreas.table.house")}</TableHead>
                    <TableHead>{t("houseAreas.table.cusp")}</TableHead>
                    <TableHead>{t("houseAreas.table.ruler")}</TableHead>
                    <TableHead>{t("houseAreas.table.almuten")}</TableHead>
                    <TableHead>{t("houseAreas.table.planets")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {area.houses.map((houseData) => {
                    const signColor = ELEMENT_COLORS[SIGN_ELEMENTS[houseData.sign]]?.text;
                    return (
                      <TableRow key={`${area.key}-${houseData.house}`} className="hover:bg-muted/50">
                        <TableCell>{houseData.house}</TableCell>
                        <TableCell style={{ color: signColor }}>
                          {formatSign(houseData.sign, houseData.degreeInSign)}
                        </TableCell>
                        <TableCell>{formatPlanet(houseData.ruler)}</TableCell>
                        <TableCell>
                          {houseData.almuten.map(formatPlanet).join(" / ")}
                          <span className="text-muted-foreground"> ({houseData.score})</span>
                        </TableCell>
                        <TableCell>
                          {houseData.planetsInHouse.length > 0
                            ? houseData.planetsInHouse.map(formatPlanet).join(", ")
                            : "\u2014"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("houseAreas.keyAspects")}
              </p>
              {area.relevantAspects.length > 0 ? (
                <div className="space-y-2">
                  {area.relevantAspects.map((aspect) =>
                    renderAspectItem(
                      `${area.key}-${aspect.a}-${aspect.b}-${aspect.type}`,
                      aspect,
                    ),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("houseAreas.noAspects")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
