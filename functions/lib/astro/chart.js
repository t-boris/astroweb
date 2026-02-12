"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNatalChart = computeNatalChart;
const luxon_1 = require("luxon");
const v2_1 = require("firebase-functions/v2");
const constants_1 = require("./constants");
const ephemeris_1 = require("./ephemeris");
const zodiac_1 = require("./zodiac");
const aspects_1 = require("./aspects");
const houses_1 = require("./houses");
/**
 * Compute a full natal chart from birth data.
 *
 * Pipeline: local time -> UTC -> Julian Day -> planetary positions ->
 * house cusps -> house placement -> aspect detection -> ChartResult.
 *
 * When timeUnknown is true, noon is used as the default birth time and
 * house assignments, ASC, and MC are set to null.
 */
function computeNatalChart(input) {
    // ---- Step 1: Convert local time to UTC ----
    const [year, month, day] = input.birthDate.split('-').map(Number);
    let hour = 12; // default noon for unknown time
    let minute = 0;
    if (!input.timeUnknown && input.birthTime) {
        const parts = input.birthTime.split(':').map(Number);
        hour = parts[0];
        minute = parts[1];
    }
    const localDt = luxon_1.DateTime.fromObject({ year, month, day, hour, minute }, { zone: input.timezone });
    const utcDt = localDt.toUTC();
    const utcYear = utcDt.year;
    const utcMonth = utcDt.month;
    const utcDay = utcDt.day;
    const decimalHour = utcDt.hour + utcDt.minute / 60 + utcDt.second / 3600;
    // ---- Step 2: Compute Julian Day ----
    const jd = (0, ephemeris_1.computeJulianDay)(utcYear, utcMonth, utcDay, decimalHour);
    // ---- Step 3: Compute planetary positions ----
    const points = constants_1.BODIES.map((body) => {
        const pos = (0, ephemeris_1.calcPlanetPosition)(jd, body.id);
        const zodiac = (0, zodiac_1.longitudeToZodiac)(pos.longitude);
        return {
            body: body.name,
            lon: pos.longitude,
            sign: zodiac.sign,
            degreeInSign: zodiac.degreeInSign,
            house: null, // filled in step 5
        };
    });
    // ---- Step 4: Compute house cusps ----
    let houses;
    try {
        houses = (0, houses_1.calculateHouses)(jd, input.lat, input.lng, input.houseSystem);
    }
    catch (err) {
        // Some quadrant systems may fail at extreme latitudes; fall back to Whole Sign
        v2_1.logger.warn("House system failed, falling back to whole-sign", {
            lat: input.lat,
            lng: input.lng,
            requestedSystem: input.houseSystem,
        });
        houses = (0, houses_1.calculateHouses)(jd, input.lat, input.lng, 'whole-sign');
    }
    if (input.timeUnknown) {
        houses = { ...houses, asc: null, mc: null };
    }
    // ---- Step 5: Assign planets to houses ----
    if (!input.timeUnknown) {
        for (const point of points) {
            point.house = (0, houses_1.findHouseForLongitude)(point.lon, houses.cusps);
        }
    }
    // ---- Step 6: Detect aspects ----
    const aspectPoints = points.map((p) => ({
        name: p.body,
        lon: p.lon,
    }));
    if (!input.timeUnknown && houses.asc !== null && houses.mc !== null) {
        aspectPoints.push({ name: 'ASC', lon: houses.asc });
        aspectPoints.push({ name: 'MC', lon: houses.mc });
    }
    const aspects = (0, aspects_1.detectAllAspects)(aspectPoints);
    // ---- Step 7: Build ChartResult ----
    const meta = {
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
