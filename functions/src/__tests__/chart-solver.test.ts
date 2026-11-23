import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  computeHouseCusps,
  computeJulianDay,
} from '../astro/ephemeris';
import {
  latitudeForAsc,
  localBirthData,
  longitudeForMc,
  solveBirth,
  type ChartReadingInput,
  type ReadLongitude,
  type SolverBody,
} from '../astro/chartSolver';
import { FIXTURE_DIR, loadAstroSeek, loadDatasets, referencePoints, type ParityDataset } from './helpers/natalParity';

/**
 * The solver must find the birth moment and place of the four known-answer datasets
 * (docs/verification/natal-chart-parity.md) from their positions as a chart prints them.
 */

const BODIES: SolverBody[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const datasets = loadDatasets();

/** The reading of a dataset as a chart prints it: truncated to whole arcminutes (or whole degrees). */
function readingOf(ds: ParityDataset, resolution: 'minute' | 'degree' = 'minute'): ChartReadingInput {
  const reading: ChartReadingInput = { bodies: {} };
  for (const point of referencePoints(loadAstroSeek(ds.id, 'default-orbs'))) {
    const read: ReadLongitude =
      resolution === 'minute'
        ? { longitude: Math.floor(point.shownArcseconds / 60) / 60, resolution: 1 / 60 }
        : { longitude: Math.floor(point.shownArcseconds / 3600), resolution: 1 };
    if (point.id === 'ASC') reading.asc = read;
    else if (point.id === 'MC') reading.mc = read;
    else if ((BODIES as string[]).includes(point.id)) reading.bodies[point.id as SolverBody] = read;
  }
  return reading;
}

/** The reading of an original screenshot, transcribed by hand (fixtures/natal-parity/screenshots.json). */
function screenshotReading(id: 'A' | 'B'): ChartReadingInput {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'screenshots.json'), 'utf8'));
  const toRead = (sign: string, degree: number, minute: number): ReadLongitude => ({
    longitude: SIGNS.indexOf(sign) * 30 + degree + minute / 60,
    resolution: 1 / 60,
  });
  const reading: ChartReadingInput = { bodies: {} };
  for (const [name, sign, degree, minute] of raw[id].points as [string, string, number, number][]) {
    if ((BODIES as string[]).includes(name)) reading.bodies[name as SolverBody] = toRead(sign, degree, minute);
  }
  for (const [name, sign, degree, minute] of raw[id].angles as [string, string, number, number][]) {
    if (name === 'ASC') reading.asc = toRead(sign, degree, minute);
    if (name === 'MC') reading.mc = toRead(sign, degree, minute);
  }
  return reading;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const minutesApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;
const clockMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function expectRecovered(ds: ParityDataset, reading: ChartReadingInput) {
  const solved = solveBirth(reading);
  expect(solved.status, ds.id).toBe('matched');
  expect(solved.timeKnown && solved.placeKnown).toBe(true);
  // The true moment lies inside the reported window, and the window is a couple of minutes.
  expect(minutesApart(solved.utc as string, ds.utc), ds.id).toBeLessThanOrEqual((solved.timeAccuracyMinutes as number) + 0.05);
  expect(solved.timeAccuracyMinutes as number).toBeLessThan(2);
  // The true place lies inside the reported radius, and the radius is a city's size.
  const km = distanceKm(solved.lat as number, solved.lng as number, ds.lat, ds.lng);
  expect(km, ds.id).toBeLessThanOrEqual(solved.placeAccuracyKm as number);
  expect(solved.placeAccuracyKm as number).toBeLessThan(75);
  // The clock and calendar of the place: the time zone, the date and the minute.
  const local = localBirthData(solved);
  expect(local?.timezone).toBe(ds.timezone);
  expect(local?.birthDate).toBe(ds.birthDate);
  expect(Math.abs(clockMinutes(local?.birthTime as string) - clockMinutes(ds.birthTime))).toBeLessThanOrEqual(1);
  expect(solved.points.every((p) => p.matched)).toBe(true);
  return solved;
}

describe('solveBirth on the known-answer charts', () => {
  for (const ds of datasets) {
    it(`recovers ${ds.label} from its positions read to the arcminute`, () => {
      expectRecovered(ds, readingOf(ds));
    });
  }

  it('recovers datasets A and B from the hand-transcribed original screenshots', () => {
    expectRecovered(datasets.find((d) => d.id === 'A') as ParityDataset, screenshotReading('A'));
    expectRecovered(datasets.find((d) => d.id === 'B') as ParityDataset, screenshotReading('B'));
  });
});

describe('solveBirth with less information', () => {
  const C = datasets.find((d) => d.id === 'C') as ParityDataset;

  it('finds the day and an hour-wide time from positions read to whole degrees, and says how wide', () => {
    const solved = solveBirth(readingOf(C, 'degree'));
    expect(solved.status).not.toBe('no_match');
    expect(solved.timeAccuracyMinutes as number).toBeGreaterThan(30);
    expect(minutesApart(solved.utc as string, C.utc)).toBeLessThanOrEqual(solved.timeAccuracyMinutes as number);
    expect(localBirthData(solved)?.birthDate).toBe(C.birthDate);
    const km = distanceKm(solved.lat as number, solved.lng as number, C.lat, C.lng);
    expect(km).toBeLessThanOrEqual(solved.placeAccuracyKm as number);
  });

  it('gives the date and the time but no place without ASC and MC', () => {
    const reading = { ...readingOf(C), asc: null, mc: null };
    const solved = solveBirth(reading);
    expect(solved.status).toBe('matched');
    expect(solved.placeKnown).toBe(false);
    expect(solved.lat).toBeNull();
    expect(solved.placeAccuracyKm).toBeNull();
    expect(minutesApart(solved.utc as string, C.utc)).toBeLessThanOrEqual(2);
    expect(localBirthData(solved)).toEqual({ birthDate: '1985-07-12', birthTime: null, timezone: null });
  });

  it('gives only the day without the Moon', () => {
    const reading = readingOf(C);
    delete reading.bodies.Moon;
    const solved = solveBirth({ ...reading, asc: null, mc: null });
    expect(solved.status).toBe('matched');
    expect(solved.timeKnown).toBe(false);
    expect(solved.timeAccuracyMinutes).toBeNull();
    expect(minutesApart(solved.utc as string, C.utc)).toBeLessThan(24 * 60);
    expect(localBirthData(solved)?.birthTime).toBeNull();
  });

  it('still solves the chart when one planet was misread, and names that planet', () => {
    const reading = readingOf(C);
    const mars = reading.bodies.Mars as ReadLongitude;
    reading.bodies.Mars = { ...mars, longitude: (mars.longitude + 30) % 360 };
    const solved = solveBirth(reading);
    expect(solved.status).toBe('partial');
    expect(solved.points.filter((p) => !p.matched).map((p) => p.id)).toEqual(['Mars']);
    expect(minutesApart(solved.utc as string, C.utc)).toBeLessThanOrEqual(2);
  });
});

describe('solveBirth refuses what is not a chart', () => {
  it('finds no moment for positions that belong to no moment', () => {
    const bodies: ChartReadingInput['bodies'] = {};
    BODIES.forEach((body, index) => {
      bodies[body] = { longitude: (index * 97 + 13) % 360, resolution: 1 / 60 };
    });
    const solved = solveBirth({ bodies });
    expect(solved.status).toBe('no_match');
    expect(solved.utc).toBeNull();
  });

  it('needs the Sun and at least three other bodies', () => {
    const reading = readingOf(datasets[0]);
    const withoutSun = { ...reading, bodies: { ...reading.bodies } };
    delete withoutSun.bodies.Sun;
    expect(solveBirth(withoutSun).reason).toBe('missing_sun');
    const few = { bodies: { Sun: reading.bodies.Sun, Moon: reading.bodies.Moon, Mars: reading.bodies.Mars } };
    expect(solveBirth(few).reason).toBe('too_few_points');
  });

  it('does not invent a birth outside the searched years', () => {
    const C = datasets.find((d) => d.id === 'C') as ParityDataset;
    expect(solveBirth(readingOf(C), { fromYear: 1990, toYear: 2030 }).status).toBe('no_match');
  });
});

describe('place from the angles', () => {
  it('finds back the longitude from MC and the latitude from ASC for places around the world', () => {
    const jd = computeJulianDay(1990, 6, 15, 7.25);
    for (const [lat, lng] of [
      [55.75, 37.62],
      [-33.93, 18.42],
      [40.71, -74.0],
      [64.13, -21.9],
      [-45.87, 170.5],
      [1.29, 103.85],
    ]) {
      const angles = computeHouseCusps(jd, lat, lng, 'W');
      const foundLng = longitudeForMc(jd, angles.mc);
      const foundLat = latitudeForAsc(jd, foundLng, angles.ascendant) as number;
      expect(foundLng).toBeCloseTo(lng, 6);
      expect(foundLat).toBeCloseTo(lat, 6);
    }
  });
});
