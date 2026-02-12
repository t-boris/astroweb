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
}: PlanetMarkersProps) {
  const { cx, cy, planetRadius } = CHART_LAYOUT;

  const placedPlanets = useMemo(
    () => resolvePlanetCollisions(points, ascDegree),
    [points, ascDegree],
  );

  return (
    <g className="planet-markers">
      {placedPlanets.map((placed) => {
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

        // Hover opacity logic
        let opacity = 1;
        if (hoveredPlanet) {
          if (
            placed.body === hoveredPlanet ||
            hoveredPlanetAspects?.has(placed.body)
          ) {
            opacity = 1;
          } else {
            opacity = 0.15;
          }
        }

        const isHovered = placed.body === hoveredPlanet;

        return (
          <g
            key={placed.body}
            className="planet-group transition-opacity duration-200"
            data-planet={placed.body}
            style={{ opacity }}
            onPointerEnter={() => onPlanetHover(placed.body)}
            onPointerLeave={() => onPlanetHover(null)}
          >
            {/* Leader line connecting offset planet to true ecliptic position */}
            {placed.hasLeader && truePos && (
              <line
                x1={truePos.x}
                y1={truePos.y}
                x2={pos.x}
                y2={pos.y}
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth={0.5}
              />
            )}

            {/* Planet glyph */}
            <text
              x={pos.x}
              y={pos.y}
              fontSize={isHovered ? 26 : 22}
              textAnchor="middle"
              dominantBaseline="central"
              fill="white"
              filter="url(#glow)"
              className="transition-[font-size] duration-200"
            >
              {glyph}
            </text>

            {/* Invisible touch target */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={20}
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
              fill="rgba(255, 255, 255, 0.5)"
            >
              {`${Math.floor(placed.degreeInSign)}\u00B0`}
            </text>
          </g>
        );
      })}
    </g>
  );
}
