import { DateTime } from 'luxon';
import { logger } from 'firebase-functions/v2';
import { BODIES } from './constants';
import { calcPlanetPosition, computeJulianDay } from './ephemeris';
import { longitudeToZodiac } from './zodiac';
import { detectAllAspects, AspectPoint } from './aspects';
import { calculateHouses, findHouseForLongitude } from './houses';
import { ChartResult, ChartPoint, ChartMeta, ChartHouses } from '../types/index';

/** Input parameters for computing a natal chart */
export interface ComputeChartInput {
  birthDate: string;        // YYYY-MM-DD
  birthTime: string | null; // HH:mm or null
  timeUnknown: boolean;
  lat: number;
  lng: number;
  timezone: string;         // IANA timezone
  houseSystem: 'placidus' | 'whole-sign';
}

/**
 * Compute a full natal chart from birth data.
 *
 * Pipeline: local time -> UTC -> Julian Day -> planetary positions ->
 * house cusps -> house placement -> aspect detection -> ChartResult.
 *
 * When timeUnknown is true, noon is used as the default birth time and
 * house assignments, ASC, and MC are set to null.
 */
export function computeNatalChart(input: ComputeChartInput): ChartResult {
  // ---- Step 1: Convert local time to UTC ----
  const [year, month, day] = input.birthDate.split('-').map(Number);
  let hour = 12; // default noon for unknown time
  let minute = 0;

  if (!input.timeUnknown && input.birthTime) {
    const parts = input.birthTime.split(':').map(Number);
    hour = parts[0];
    minute = parts[1];
  }

  const localDt = DateTime.fromObject(
    { year, month, day, hour, minute },
    { zone: input.timezone }
  );
  const utcDt = localDt.toUTC();
  const utcYear = utcDt.year;
  const utcMonth = utcDt.month;
  const utcDay = utcDt.day;
  const decimalHour = utcDt.hour + utcDt.minute / 60 + utcDt.second / 3600;

  // ---- Step 2: Compute Julian Day ----
  const jd = computeJulianDay(utcYear, utcMonth, utcDay, decimalHour);

  // ---- Step 3: Compute planetary positions ----
  const points: ChartPoint[] = BODIES.map((body) => {
    const pos = calcPlanetPosition(jd, body.id);
    const zodiac = longitudeToZodiac(pos.longitude);
    return {
      body: body.name,
      lon: pos.longitude,
      sign: zodiac.sign,
      degreeInSign: zodiac.degreeInSign,
      house: null, // filled in step 5
    };
  });

  // ---- Step 4: Compute house cusps ----
  let houses: ChartHouses;
  try {
    houses = calculateHouses(jd, input.lat, input.lng, input.houseSystem);
  } catch (err) {
    // Placidus at extreme latitudes may fail; fall back to Whole Sign
    logger.warn("Placidus failed, falling back to whole-sign", { lat: input.lat, lng: input.lng });
    houses = calculateHouses(jd, input.lat, input.lng, 'whole-sign');
  }

  if (input.timeUnknown) {
    houses = { ...houses, asc: null, mc: null };
  }

  // ---- Step 5: Assign planets to houses ----
  if (!input.timeUnknown) {
    for (const point of points) {
      point.house = findHouseForLongitude(point.lon, houses.cusps);
    }
  }

  // ---- Step 6: Detect aspects ----
  const aspectPoints: AspectPoint[] = points.map((p) => ({
    name: p.body,
    lon: p.lon,
  }));

  if (!input.timeUnknown && houses.asc !== null && houses.mc !== null) {
    aspectPoints.push({ name: 'ASC', lon: houses.asc });
    aspectPoints.push({ name: 'MC', lon: houses.mc });
  }

  const aspects = detectAllAspects(aspectPoints);

  // ---- Step 7: Build ChartResult ----
  const meta: ChartMeta = {
    houseSystem: houses.system,
    zodiac: 'tropical',
    timeUsed: input.timeUnknown ? null : input.birthTime,
    timezoneUsed: input.timezone,
  };

  return {
    meta,
    points,
    houses,
    aspects,
  };
}
