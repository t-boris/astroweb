import { constants } from 'sweph';
import { BODIES } from './constants';
import {
  PlanetPosition,
  calcChironPosition,
  calcPlanetPosition,
  computeHouseCusps,
} from './ephemeris';
import { findHouseForLongitude } from './houses';
import { longitudeToZodiac } from './zodiac';
import type { ChartAngles, ChartPosition, PositionId } from '../types/index';

/** Step for the numeric daily rate of the angle-derived points (one minute, central difference). */
const RATE_STEP_DAYS = 1 / 1440;

export function normalizeLongitude(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** Signed shortest difference b - a in (-180, 180]. */
export function signedDifference(a: number, b: number): number {
  const d = normalizeLongitude(b - a);
  return d > 180 ? d - 360 : d;
}

/** Longitudes of the points derived from the birth place and time. */
interface AngleDerived {
  asc: number;
  mc: number;
  vertex: number;
  fortune: number;
}

/**
 * Whole-sign calls are used because ASC, MC and Vertex do not depend on the
 * house system and a quadrant system can fail at extreme latitudes.
 */
function angleDerivedAt(jd: number, lat: number, lng: number): AngleDerived {
  const h = computeHouseCusps(jd, lat, lng, 'W');
  const sun = calcPlanetPosition(jd, constants.SE_SUN).longitude;
  const moon = calcPlanetPosition(jd, constants.SE_MOON).longitude;
  return {
    asc: h.ascendant,
    mc: h.mc,
    vertex: h.vertex,
    fortune: partOfFortune(h.ascendant, sun, moon),
  };
}

/**
 * Part of Fortune (DEC-016). The chart is a day chart when the Sun is above the
 * true horizon, which means its longitude lies 180-360 degrees after the ASC.
 * Day: ASC + Moon - Sun. Night: ASC + Sun - Moon.
 */
export function partOfFortune(asc: number, sun: number, moon: number): number {
  const sunAboveHorizon = normalizeLongitude(sun - asc) >= 180;
  return normalizeLongitude(sunAboveHorizon ? asc + moon - sun : asc + sun - moon);
}

export interface ExtendedPoints {
  positions: ChartPosition[];
  angles: ChartAngles | null;
  /** Daily rate in degrees for every point id and for ASC, DSC, MC, IC; used for applying or separating. */
  rates: Record<string, number>;
  /** Longitudes of all points that can take part in aspects, including the angles. */
  longitudes: Record<string, number>;
  chironAvailable: boolean;
}

export interface ExtendedPointsInput {
  jd: number;
  lat: number;
  lng: number;
  timeKnown: boolean;
  /** The ten standard bodies in BODIES order. */
  bodies: PlanetPosition[];
  /** Cusps of the house system in use; ignored when the time is unknown. */
  cusps: number[];
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Build the extended point list of DEC-014: the ten bodies plus the lunar nodes,
 * Black Moon Lilith, Chiron, Part of Fortune and Vertex, with retrograde and speed.
 *
 * Conventions (DEC-010, DEC-016, verified against Astro-Seek in docs/verification/natal-chart-parity.md):
 * mean North Node with the South Node 180 degrees opposite, mean Black Moon Lilith,
 * Part of Fortune by horizon, Vertex from the Swiss Ephemeris house calculation.
 * With an unknown birth time the houses, angles, Fortune and Vertex are left out.
 */
export function computeExtendedPoints(input: ExtendedPointsInput): ExtendedPoints {
  const { jd, lat, lng, timeKnown, bodies, cusps } = input;
  const positions: ChartPosition[] = [];
  const rates: Record<string, number> = {};
  const longitudes: Record<string, number> = {};

  const houseOf = (lon: number): number | null => (timeKnown ? findHouseForLongitude(lon, cusps) : null);

  const push = (
    id: PositionId,
    kind: ChartPosition['kind'],
    lon: number,
    speed: number | null,
    rate: number
  ) => {
    const zodiac = longitudeToZodiac(lon);
    positions.push({
      id,
      kind,
      lon,
      sign: zodiac.sign,
      degreeInSign: zodiac.degreeInSign,
      house: houseOf(lon),
      retrograde: speed === null ? null : speed < 0,
      speed: speed === null ? null : round(speed, 6),
    });
    rates[id] = rate;
    longitudes[id] = lon;
  };

  BODIES.forEach((body, index) => {
    const pos = bodies[index];
    push(body.name as PositionId, 'planet', pos.longitude, pos.longitudeSpeed, pos.longitudeSpeed);
  });

  const node = calcPlanetPosition(jd, constants.SE_MEAN_NODE);
  push('NorthNode', 'node', node.longitude, node.longitudeSpeed, node.longitudeSpeed);
  push(
    'SouthNode',
    'node',
    normalizeLongitude(node.longitude + 180),
    node.longitudeSpeed,
    node.longitudeSpeed
  );

  const lilith = calcPlanetPosition(jd, constants.SE_MEAN_APOG);
  push('Lilith', 'point', lilith.longitude, lilith.longitudeSpeed, lilith.longitudeSpeed);

  const chiron = calcChironPosition(jd);
  if (chiron) {
    push('Chiron', 'point', chiron.longitude, chiron.longitudeSpeed, chiron.longitudeSpeed);
  }

  let angles: ChartAngles | null = null;
  if (timeKnown) {
    const now = angleDerivedAt(jd, lat, lng);
    const before = angleDerivedAt(jd - RATE_STEP_DAYS, lat, lng);
    const after = angleDerivedAt(jd + RATE_STEP_DAYS, lat, lng);
    const rate = (key: keyof AngleDerived) =>
      signedDifference(before[key], after[key]) / (2 * RATE_STEP_DAYS);

    angles = {
      asc: now.asc,
      dsc: normalizeLongitude(now.asc + 180),
      mc: now.mc,
      ic: normalizeLongitude(now.mc + 180),
    };
    push('Fortune', 'point', now.fortune, null, rate('fortune'));
    push('Vertex', 'point', now.vertex, null, rate('vertex'));

    longitudes.ASC = angles.asc;
    longitudes.DSC = angles.dsc;
    longitudes.MC = angles.mc;
    longitudes.IC = angles.ic;
    rates.ASC = rate('asc');
    rates.DSC = rates.ASC;
    rates.MC = rate('mc');
    rates.IC = rates.MC;
  }

  return { positions, angles, rates, longitudes, chironAvailable: chiron !== null };
}
