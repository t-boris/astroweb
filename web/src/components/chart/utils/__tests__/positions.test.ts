import { describe, expect, it } from "vitest";
import type { ChartResult } from "@/types";
import {
  formatDegreeMinute,
  formatOrb,
  getAngles,
  getHouseSystemInfo,
  getPositions,
  getSharedAspects,
  isTimeEstimated,
  splitLongitude,
  wheelRotation,
} from "../positions";

const legacy: ChartResult = {
  meta: { houseSystem: "koch", zodiac: "tropical", timeUsed: "03:30", timezoneUsed: "Africa/Johannesburg" },
  points: [
    { body: "Sun", lon: 9.1722903, sign: "Aries", degreeInSign: 9.1722903, house: 3 },
    { body: "Moon", lon: 207.5883535, sign: "Libra", degreeInSign: 27.5883535, house: 9 },
  ],
  houses: { system: "koch", cusps: [324.5, 354.9, 24, 50, 70, 90, 144.5, 174.9, 204, 230.6, 250, 270], asc: 324.98, mc: 230.62 },
  aspects: [{ a: "Sun", b: "Moon", type: "square", orb: 2.25, exactness: 0.62 }],
};

describe("splitLongitude / formatDegreeMinute", () => {
  it("truncates minutes like the reference charts", () => {
    // 14°33.972' is shown as 14°33' by Astro-Seek
    expect(splitLongitude(30 * 3 + 14 + 33.972 / 60)).toMatchObject({ sign: "Cancer", degree: 14, minute: 33 });
    expect(formatDegreeMinute(9 + 10.34 / 60)).toBe("9°10′");
  });

  it("does not leak into the previous sign at sign boundaries", () => {
    expect(splitLongitude(29.99999999999)).toMatchObject({ sign: "Taurus", degree: 0, minute: 0 });
    expect(splitLongitude(359.99999999999)).toMatchObject({ sign: "Aries", degree: 0, minute: 0 });
    expect(splitLongitude(-0.5)).toMatchObject({ sign: "Pisces", degree: 29, minute: 30 });
  });

  it("formats an orb in degrees and minutes", () => {
    expect(formatOrb(-8.3194)).toBe("8°19′");
  });
});

describe("result accessors", () => {
  it("fall back to the legacy fields for a result without the additive fields", () => {
    expect(getPositions(legacy).map((p) => p.id)).toEqual(["Sun", "Moon"]);
    expect(getAngles(legacy)).toMatchObject({ asc: 324.98, mc: 230.62 });
    expect(getSharedAspects(legacy)[0]).toMatchObject({ a: "Sun", b: "Moon", applying: null });
  });

  it("prefer the additive fields", () => {
    const full: ChartResult = {
      ...legacy,
      positions: [{ id: "NorthNode", kind: "node", lon: 81.69, sign: "Gemini", degreeInSign: 21.69, house: 5, retrograde: true, speed: -0.05 }],
      angles: null,
      sharedAspects: [],
    };
    expect(getPositions(full)).toHaveLength(1);
    expect(getAngles(full)).toBeNull();
    expect(getSharedAspects(full)).toEqual([]);
  });
});

describe("chart context", () => {
  it("rotates the wheel to the house 1 cusp, or to 0° Aries when the time is unknown", () => {
    expect(wheelRotation(legacy)).toBe(324.5);
    const unknown: ChartResult = { ...legacy, meta: { ...legacy.meta, timeUsed: null } };
    expect(isTimeEstimated(unknown)).toBe(true);
    expect(wheelRotation(unknown)).toBe(0);
  });

  it("tells the requested system from the one actually used", () => {
    expect(getHouseSystemInfo(legacy)).toEqual({ requested: "koch", used: "koch", fellBack: false });
    const fell = {
      ...legacy,
      context: {
        calcVersion: 2,
        requestedHouseSystem: "placidus",
        usedHouseSystem: "whole-sign",
        utc: "2002-03-30T01:30:00.000Z",
        lat: 0, lng: 0, timezone: "UTC", timeEstimated: false,
        conventions: { node: "mean", lilith: "mean", fortune: "by-horizon" },
        chironAvailable: true,
      },
    } as ChartResult;
    expect(getHouseSystemInfo(fell)).toEqual({ requested: "placidus", used: "whole-sign", fellBack: true });
  });
});
