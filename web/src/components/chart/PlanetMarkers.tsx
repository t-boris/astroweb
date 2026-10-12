import { useMemo } from "react";
import { eclipticToSvgAngle, polarToCartesian } from "./utils/chartMath";
import { PLANET_GLYPHS, CHART_LAYOUT } from "./utils/constants";
import type { ChartPoint } from "@/types";

interface PlanetMarkersProps {
  points: ChartPoint[];
  ascDegree: number;
  hoveredPlanet: string | null;
  hoveredPlanetAspects: Set<string> | null;
  onPlanetHover: (body: string | null) => void;
  onPlanetSelect?: (body: string) => void;
  revealed: boolean;
}

interface PlacedPlanet {
  body: string;
  lon: number;
  degreeInSign: number;
  svgAngle: number;
  placedAngle: number;
  radius: number;
  hasLeader: boolean;
}

const MIN_SEPARATION_DEG = 8;
const OFFSET_STEP = 30;

function resolvePlanetCollisions(
  points: ChartPoint[],
  ascDegree: number,
): PlacedPlanet[] {
  const { planetRadius } = CHART_LAYOUT;

  // Convert each planet's lon to SVG angle and sort
  const sorted = points
    .map((p) => ({
      body: p.body,
      lon: p.lon,
      degreeInSign: p.degreeInSign,
      svgAngle: eclipticToSvgAngle(p.lon, ascDegree),
    }))
    .sort((a, b) => a.svgAngle - b.svgAngle);

  const placed: PlacedPlanet[] = [];

  for (const planet of sorted) {
    let radius = planetRadius;
    let hasLeader = false;

    // Check collision with already-placed planets at the same radius
    for (const existing of placed) {
      const angleDiff = Math.abs(planet.svgAngle - existing.placedAngle);
      if (angleDiff < MIN_SEPARATION_DEG && radius === existing.radius) {
        radius += OFFSET_STEP;
        hasLeader = true;
      }
    }

    placed.push({
      body: planet.body,
      lon: planet.lon,
      degreeInSign: planet.degreeInSign,
      svgAngle: planet.svgAngle,
      placedAngle: planet.svgAngle,
      radius,
      hasLeader,
    });
  }

  return placed;
}

export default function PlanetMarkers({
  points,
  ascDegree,
  hoveredPlanet,
  hoveredPlanetAspects,
  onPlanetHover,
  onPlanetSelect,
  revealed,
}: PlanetMarkersProps) {
  const { cx, cy, planetRadius, zodiacInner } = CHART_LAYOUT;

  const placedPlanets = useMemo(
    () => resolvePlanetCollisions(points, ascDegree),
    [points, ascDegree],
  );

  return (
    <g className="planet-markers">
      {placedPlanets.map((placed, index) => {
        const pos = polarToCartesian(cx, cy, placed.radius, placed.placedAngle);
        const degLabelPos = polarToCartesian(
          cx,
          cy,
          placed.radius + 18,
          placed.placedAngle,
        );
        const glyph = PLANET_GLYPHS[placed.body] ?? "?";

        // Leader line endpoints (from true ecliptic position to placed position)
        const truePos = placed.hasLeader
          ? polarToCartesian(cx, cy, planetRadius, placed.svgAngle)
          : null;

        // Hover opacity logic — when hover is active, skip animation styles
        const isHoverActive = hoveredPlanet !== null;
        let opacity: number | undefined;
        if (isHoverActive) {
          if (
            placed.body === hoveredPlanet ||
            hoveredPlanetAspects?.has(placed.body)
          ) {
            opacity = 1;
          } else {
            opacity = 0.15;
          }
        } else if (!revealed) {
          opacity = 0;
        }

        const isHovered = placed.body === hoveredPlanet;

        // Animation style — only when hover is not active
        const animationStyle: React.CSSProperties = isHoverActive
          ? { opacity }
          : {
              animation: revealed
                ? `chart-fade-in 0.5s ease-out ${1.5 + index * 0.08}s forwards, chart-glow-pulse 3s ease-in-out ${2.5 + index * 0.08}s infinite`
                : "none",
              opacity: revealed ? undefined : 0,
            };

        // Tick line from the sign band toward the planet marker (prototype style)
        const tickStart = polarToCartesian(cx, cy, zodiacInner - 6, placed.placedAngle);
        const tickEnd = polarToCartesian(cx, cy, placed.radius + 22, placed.placedAngle);

        return (
          <g
            key={placed.body}
            className="planet-group transition-opacity duration-200"
            data-planet={placed.body}
            style={{ ...animationStyle, cursor: "pointer" }}
            onPointerEnter={() => onPlanetHover(placed.body)}
            onPointerLeave={() => onPlanetHover(null)}
            onClick={() => onPlanetSelect?.(placed.body)}
          >
            {/* Tick line linking the sign band to the planet */}
            <line
              x1={tickStart.x}
              y1={tickStart.y}
              x2={tickEnd.x}
              y2={tickEnd.y}
              stroke="rgba(143, 182, 255, 0.4)"
              strokeWidth={1}
            />

            {/* Leader line connecting offset planet to true ecliptic position */}
            {placed.hasLeader && truePos && (
              <line
                x1={truePos.x}
                y1={truePos.y}
                x2={pos.x}
                y2={pos.y}
                stroke="rgba(143, 182, 255, 0.25)"
                strokeWidth={0.5}
              />
            )}

            {/* Planet disc */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={isHovered ? 32 : 29}
              fill="#0b1124"
              stroke={isHovered ? "#8fb6ff" : "rgba(143, 182, 255, 0.55)"}
              strokeWidth={isHovered ? 1.6 : 1}
              className="transition-all duration-200"
            />

            {/* Planet glyph */}
            <text
              x={pos.x}
              y={pos.y}
              fontSize={isHovered ? 26 : 22}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#dfeaff"
              fontFamily="serif"
              filter="url(#glow)"
              className="transition-[font-size] duration-200"
            >
              {glyph}
            </text>

            {/* Invisible touch target */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={32}
              fill="transparent"
              pointerEvents="all"
              data-planet={placed.body}
            />

            {/* Degree label */}
            <text
              x={degLabelPos.x}
              y={degLabelPos.y}
              fontSize={10}
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(143, 182, 255, 0.55)"
            >
              {`${Math.floor(placed.degreeInSign)}\u00B0`}
            </text>
          </g>
        );
      })}
    </g>
  );
}
