import { describe, expect, it } from "vitest";
import { loadFixtures } from "./chartFixtures";
import { CHART_LAYOUT, CUSP_ANGLE_TOLERANCE_DEG, OUTER_LABEL_GAP_DEG, POINT_LABEL_GAP_DEG, SCALE_TICK_LENGTH } from "../constants";
import { ALL_ASPECT_TYPES, DEFAULT_ASPECT_TYPES, filterAspects } from "../aspectFilters";
import { eclipticToSvgAngle, polarToCartesian, signedAngleDelta } from "../chartMath";
import { getAngles, getPositions, getSharedAspects, splitLongitude, wheelRotation } from "../positions";
import {
  angleEntries,
  angleLabelCenter,
  aspectSegments,
  aspectStrokeOpacity,
  aspectStrokeWidth,
  connectedIds,
  cuspLabelCenter,
  cuspLabels,
  degreeScaleTicks,
  houseMidLongitude,
  placePoints,
  signGlyph,
} from "../wheelLayout";
import { pointGlyph } from "../viewModel";

const { charts } = loadFixtures();
const { cx, cy, aspectRadius, outerRadius, signInner, size } = CHART_LAYOUT;

function distanceFromCentre(p: { x: number; y: number }): number {
  return Math.hypot(p.x - cx, p.y - cy);
}

function signText(lon: number): string {
  const { sign, degree, minute } = splitLongitude(lon);
  return `${degree}°${String(minute).padStart(2, "0")}′ ${sign}`;
}

describe("degreeScaleTicks", () => {
  it("has one tick per degree: 288 short, 36 at every 5, 36 at every 10", () => {
    const ticks = degreeScaleTicks(0);
    expect(ticks).toHaveLength(360);
    expect(ticks.filter((t) => t.kind === "degree")).toHaveLength(288);
    expect(ticks.filter((t) => t.kind === "five")).toHaveLength(36);
    expect(ticks.filter((t) => t.kind === "ten")).toHaveLength(36);
  });

  it("makes the 5 and 10 degree ticks longer, hanging inwards from the sign band", () => {
    const ticks = degreeScaleTicks(0);
    const length = (kind: string) => {
      const t = ticks.find((tick) => tick.kind === kind)!;
      return Math.hypot(t.to.x - t.from.x, t.to.y - t.from.y);
    };
    expect(length("degree")).toBeCloseTo(SCALE_TICK_LENGTH.degree, 6);
    expect(length("five")).toBeCloseTo(SCALE_TICK_LENGTH.five, 6);
    expect(length("ten")).toBeCloseTo(SCALE_TICK_LENGTH.ten, 6);
    expect(length("degree")).toBeLessThan(length("five"));
    expect(length("five")).toBeLessThan(length("ten"));
    for (const t of ticks) {
      expect(distanceFromCentre(t.from)).toBeCloseTo(signInner, 6);
      expect(distanceFromCentre(t.to)).toBeLessThan(signInner);
    }
  });

  it("follows the rotation: the tick at the rotation longitude is on the left axis", () => {
    const rotation = 305;
    const tick = degreeScaleTicks(rotation).find((t) => t.longitude === 305)!;
    expect(tick.kind).toBe("five");
    expect(tick.from.y).toBeCloseTo(cy, 9);
    expect(tick.from.x).toBeLessThan(cx);
  });

  it("puts a 10 degree tick on every sign boundary", () => {
    const ticks = degreeScaleTicks(0);
    for (let sign = 0; sign < 12; sign++) expect(ticks[sign * 30].kind).toBe("ten");
  });
});

describe("houseMidLongitude", () => {
  it("is the middle between two cusps, also across 0 degrees", () => {
    expect(houseMidLongitude([0, 30, 60], 0)).toBe(15);
    expect(houseMidLongitude([340, 10, 60], 0)).toBe(355);
    expect(houseMidLongitude([340, 10, 60], 2)).toBeCloseTo(60 + 280 / 2, 9); // last house wraps to the first cusp
  });

  it("uses the calculated cusps, which need not be 30 degrees apart (Koch)", () => {
    const koch = charts.C.houses.cusps;
    expect(houseMidLongitude(koch, 0)).toBeCloseTo((koch[0] + koch[1]) / 2, 9);
    expect(koch[1] - koch[0]).not.toBeCloseTo(30, 0);
  });
});

describe("placePoints", () => {
  it("keeps every calculated point, in order, for every fixture", () => {
    for (const chart of Object.values(charts)) {
      const positions = getPositions(chart);
      const placed = placePoints(positions);
      expect(placed.map((p) => p.id)).toEqual(positions.map((p) => p.id));
    }
  });

  it("includes both nodes, Lilith, Chiron, Fortune and Vertex with a known birth time", () => {
    const ids = placePoints(getPositions(charts.B)).map((p) => p.id);
    for (const id of ["NorthNode", "SouthNode", "Lilith", "Chiron", "Fortune", "Vertex"]) expect(ids).toContain(id);
  });

  it("has no Fortune or Vertex without a birth time", () => {
    const ids = placePoints(getPositions(charts.unknownTime)).map((p) => p.id);
    expect(ids).not.toContain("Fortune");
    expect(ids).not.toContain("Vertex");
    expect(ids).toContain("NorthNode");
  });

  it("gives every point a glyph", () => {
    for (const chart of Object.values(charts)) {
      for (const p of placePoints(getPositions(chart))) expect(p.glyph).not.toBe("");
    }
    expect(pointGlyph("Vertex")).toBe("Vx");
  });

  it("marks exactly the retrograde points", () => {
    const retrograde = (name: keyof typeof charts) =>
      placePoints(getPositions(charts[name]))
        .filter((p) => p.retrograde)
        .map((p) => p.id);
    // Dataset A: Pluto and the nodes (SRC-002)
    expect(retrograde("A")).toEqual(["Pluto", "NorthNode", "SouthNode"]);
    // Dataset B: Jupiter, Saturn, Uranus, Neptune and the nodes (SRC-003)
    expect(retrograde("B")).toEqual(["Jupiter", "Saturn", "Uranus", "Neptune", "NorthNode", "SouthNode"]);
    // Fortune and Vertex carry no motion
    for (const p of placePoints(getPositions(charts.B))) {
      if (p.id === "Fortune" || p.id === "Vertex") expect(p.retrograde).toBe(false);
    }
  });

  it("shows the sign, degree and minute of the reference table (SRC-002, dataset A)", () => {
    const expected: Record<string, string> = {
      Sun: "9°10′ Aries",
      Moon: "27°35′ Libra",
      Mercury: "0°50′ Aries",
      Venus: "27°16′ Aries",
      Mars: "19°55′ Taurus",
      Jupiter: "6°54′ Cancer",
      Saturn: "10°15′ Gemini",
      Uranus: "27°12′ Aquarius",
      Neptune: "10°27′ Aquarius",
      Pluto: "17°36′ Sagittarius",
      NorthNode: "21°41′ Gemini",
      Lilith: "24°33′ Pisces",
      Chiron: "8°54′ Capricorn",
    };
    for (const p of placePoints(getPositions(charts.A))) {
      if (expected[p.id]) expect(`${p.degree}°${String(p.minute).padStart(2, "0")}′ ${p.sign}`).toBe(expected[p.id]);
    }
  });

  it("shows the sign, degree and minute of the additional points (SRC-003, dataset B)", () => {
    const expected: Record<string, string> = {
      NorthNode: "10°14′ Leo",
      Lilith: "12°30′ Sagittarius",
      Chiron: "0°15′ Sagittarius",
      Fortune: "20°12′ Aries",
      Vertex: "5°19′ Cancer",
    };
    for (const p of placePoints(getPositions(charts.B))) {
      if (expected[p.id]) expect(`${p.degree}°${String(p.minute).padStart(2, "0")}′ ${p.sign}`).toBe(expected[p.id]);
    }
  });

  it("keeps label stacks at least one gap apart in every fixture, with a leader for each moved label", () => {
    for (const [name, chart] of Object.entries(charts)) {
      const placed = placePoints(getPositions(chart));
      const positions = placed.map((p) => p.displayLon).sort((a, b) => a - b);
      positions.forEach((value, i) => {
        const next = i === positions.length - 1 ? positions[0] + 360 : positions[i + 1];
        expect(next - value, `${name} gap after ${value}`).toBeGreaterThanOrEqual(POINT_LABEL_GAP_DEG - 1e-6);
      });
      for (const p of placed) {
        // A point whose label is not at its longitude is flagged so that the leader is drawn dashed.
        const moved = Math.abs(((p.displayLon - p.lon + 540) % 360) - 180) > 0.05;
        expect(p.displaced).toBe(moved);
      }
    }
  });

  it("does not move a point that has room", () => {
    const placed = placePoints(getPositions(charts.A));
    const moon = placed.find((p) => p.id === "Moon")!;
    expect(moon.displaced).toBe(false);
    expect(moon.displayLon).toBe(moon.lon);
  });
});

describe("angleEntries", () => {
  it("lists ASC, DSC, MC and IC at their calculated longitudes", () => {
    for (const name of ["A", "B", "C", "D"] as const) {
      const angles = getAngles(charts[name])!;
      const entries = angleEntries(angles);
      expect(entries.map((e) => e.id)).toEqual(["ASC", "DSC", "MC", "IC"]);
      expect(entries.map((e) => e.lon)).toEqual([angles.asc, angles.dsc, angles.mc, angles.ic]);
      expect(entries.map((e) => e.label)).toEqual(["ASC", "DSC", "MC", "IC"]);
    }
  });

  it("shows the ASC and MC of the reference charts (SRC-002 and SRC-003)", () => {
    const a = angleEntries(getAngles(charts.A)!);
    expect(signText(a[0].lon)).toBe("24°58′ Aquarius");
    expect(signText(a[2].lon)).toBe("20°37′ Scorpio");
    const b = angleEntries(getAngles(charts.B)!);
    expect(signText(b[0].lon)).toBe("23°43′ Libra");
    expect(signText(b[2].lon)).toBe("24°19′ Cancer");
  });

  it("has the DSC opposite the ASC and the IC opposite the MC", () => {
    const [asc, dsc, mc, ic] = angleEntries(getAngles(charts.D)!);
    expect((asc.lon + 180) % 360).toBeCloseTo(dsc.lon, 9);
    expect((mc.lon + 180) % 360).toBeCloseTo(ic.lon, 9);
  });

  it("are independent of the house cusps in Whole Sign", () => {
    const chart = charts.A;
    const cusp1 = chart.houses.cusps[0];
    const [asc] = angleEntries(getAngles(chart)!);
    expect(asc.lon).not.toBeCloseTo(cusp1, 1);
    // The ASC is inside house 1: between cusp 1 and cusp 2.
    expect(asc.lon).toBeGreaterThan(cusp1);
    expect(asc.lon).toBeLessThan(chart.houses.cusps[1]);
  });
});

describe("angleLabelCenter", () => {
  it("keeps the label block clear of the sign band and inside the view box at every angle", () => {
    const half = { width: 22, height: 26 };
    for (let angle = 0; angle < 360; angle += 3) {
      const c = angleLabelCenter(angle);
      const rad = (angle * Math.PI) / 180;
      const supportAlongRay = Math.abs(Math.cos(rad)) * half.width + Math.abs(Math.sin(rad)) * half.height;
      // The block's nearest extent towards the wheel is outside the ring.
      expect(distanceFromCentre(c) - supportAlongRay).toBeGreaterThanOrEqual(outerRadius + 7.99);
      expect(c.x - half.width).toBeGreaterThanOrEqual(0);
      expect(c.x + half.width).toBeLessThanOrEqual(size);
      expect(c.y - half.height).toBeGreaterThanOrEqual(0);
      expect(c.y + half.height).toBeLessThanOrEqual(size);
    }
  });

  it("is on the axis it labels", () => {
    const angle = 204.98;
    const c = angleLabelCenter(angle);
    const onRay = polarToCartesian(cx, cy, distanceFromCentre(c), angle);
    expect(c.x).toBeCloseTo(onRay.x, 9);
    expect(c.y).toBeCloseTo(onRay.y, 9);
  });
});

describe("cuspLabels", () => {
  const angleLons = (chart: (typeof charts)[keyof typeof charts]) => {
    const a = getAngles(chart)!;
    return [a.asc, a.dsc, a.mc, a.ic];
  };

  it("labels all twelve cusps of a Whole Sign chart, each at its sign boundary", () => {
    for (const name of ["A", "B"] as const) {
      const chart = charts[name];
      const labels = cuspLabels(chart.houses.cusps, getAngles(chart)!);
      expect(labels.map((l) => l.house), name).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      for (const label of labels) {
        expect(label.degree, `${name} ${label.house}`).toBe(0);
        expect(label.minute, `${name} ${label.house}`).toBe(0);
        expect(label.lon, `${name} ${label.house}`).toBe(chart.houses.cusps[label.house - 1]);
      }
    }
  });

  it("gives the sign, degree and minute of the cusp, truncated like every other view", () => {
    const chart = charts.C;
    for (const label of cuspLabels(chart.houses.cusps, getAngles(chart)!)) {
      expect(label).toMatchObject(splitLongitude(chart.houses.cusps[label.house - 1]));
    }
  });

  it("leaves out the cusps that are an angle (Koch and Placidus: 1, 4, 7, 10) and labels the other eight", () => {
    for (const name of ["C", "D"] as const) {
      const chart = charts[name];
      const labels = cuspLabels(chart.houses.cusps, getAngles(chart)!);
      expect(labels.map((l) => l.house), name).toEqual([2, 3, 5, 6, 8, 9, 11, 12]);
      for (const label of labels) {
        for (const angle of angleLons(chart)) expect(Math.abs(signedAngleDelta(angle, label.lon))).toBeGreaterThan(CUSP_ANGLE_TOLERANCE_DEG);
      }
    }
  });

  it("keeps a cusp that is almost, but not exactly, an angle", () => {
    const angles = { asc: 100, dsc: 280, mc: 10, ic: 190 };
    const cusps = [100.02, 130, 160, 190.009, 220, 250, 280.5, 310, 340, 10, 40, 70];
    const labelled = cuspLabels(cusps, angles).map((l) => l.house);
    expect(labelled).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 11, 12]);
  });

  it("keeps every label clear of the others and of the angle labels, at their exact place when there is room", () => {
    for (const name of ["A", "B", "C", "D"] as const) {
      const chart = charts[name];
      const labels = cuspLabels(chart.houses.cusps, getAngles(chart)!);
      const shown = [...labels.map((l) => l.displayLon), ...angleLons(chart)];
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          expect(Math.abs(signedAngleDelta(shown[i], shown[j])), `${name} ${i} ${j}`).toBeGreaterThanOrEqual(OUTER_LABEL_GAP_DEG - 1e-6);
        }
      }
      for (const label of labels) {
        expect(label.displaced).toBe(Math.abs(signedAngleDelta(label.lon, label.displayLon)) > 0.05);
      }
    }
  });

  it("moves a Whole Sign cusp label that is too close to an angle, and never moves the angle", () => {
    // Fixture A: the ASC is 24.98 degrees into house 1, so cusp 2 is 5.02 degrees after it.
    const chart = charts.A;
    const angles = getAngles(chart)!;
    const cusp2 = cuspLabels(chart.houses.cusps, angles).find((l) => l.house === 2)!;
    expect(cusp2.displaced).toBe(true);
    expect(Math.abs(signedAngleDelta(angles.asc, cusp2.displayLon))).toBeCloseTo(OUTER_LABEL_GAP_DEG, 6);
    // The label moved away from the ASC, so the cusp still sits on its own side of it.
    expect(signedAngleDelta(angles.asc, cusp2.displayLon)).toBeGreaterThan(0);
  });

  it("spreads cusps that lie close together instead of hiding any (narrow houses near the pole)", () => {
    const angles = { asc: 0, dsc: 180, mc: 270, ic: 90 };
    const cusps = [0, 2, 4, 6, 8, 10, 180, 182, 184, 186, 188, 190];
    const labels = cuspLabels(cusps, angles);
    expect(labels.map((l) => l.house)).toEqual([2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    const shown = [...labels.map((l) => l.displayLon), ...Object.values(angles)];
    for (let i = 0; i < shown.length; i++) {
      for (let j = i + 1; j < shown.length; j++) {
        expect(Math.abs(signedAngleDelta(shown[i], shown[j]))).toBeGreaterThanOrEqual(OUTER_LABEL_GAP_DEG - 1e-6);
      }
    }
    // Neighbouring cusps keep their order
    const order = labels.filter((l) => l.lon < 20).map((l) => l.displayLon);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("cuspLabelCenter", () => {
  it("is outside the sign band and inside the view box for every direction", () => {
    for (let angle = 0; angle < 360; angle += 5) {
      const centre = cuspLabelCenter(angle);
      expect(distanceFromCentre(centre)).toBeGreaterThan(outerRadius);
      expect(centre.x - 18).toBeGreaterThanOrEqual(0);
      expect(centre.x + 18).toBeLessThanOrEqual(size);
      expect(centre.y - 15).toBeGreaterThanOrEqual(0);
      expect(centre.y + 15).toBeLessThanOrEqual(size);
    }
  });

  it("is nearer to the wheel than the angle label in the same direction: the cusp label is the smaller one", () => {
    for (const angle of [0, 45, 90, 180, 270]) {
      expect(distanceFromCentre(cuspLabelCenter(angle))).toBeLessThan(distanceFromCentre(angleLabelCenter(angle)));
    }
  });
});

describe("aspectSegments", () => {
  it("draws every aspect of the shared set between its calculated endpoints on the aspect circle", () => {
    for (const name of ["A", "B", "C", "D"] as const) {
      const chart = charts[name];
      const shared = getSharedAspects(chart);
      const rotation = wheelRotation(chart);
      const segments = aspectSegments(chart, shared, rotation);
      expect(segments).toHaveLength(shared.length);
      for (const s of segments) {
        expect(distanceFromCentre(s.from)).toBeCloseTo(aspectRadius, 6);
        expect(distanceFromCentre(s.to)).toBeCloseTo(aspectRadius, 6);
      }
    }
  });

  it("ends an ASC or MC aspect at the angle's own longitude", () => {
    const chart = charts.A;
    const rotation = wheelRotation(chart);
    const angles = getAngles(chart)!;
    const shared = getSharedAspects(chart);
    const withAngles = shared.filter((a) => a.a === "ASC" || a.b === "ASC" || a.a === "MC" || a.b === "MC");
    expect(withAngles.length).toBeGreaterThan(0);
    const segments = aspectSegments(chart, withAngles, rotation);
    segments.forEach((segment, i) => {
      const aspect = withAngles[i];
      const lonOf = (id: string) => (id === "ASC" ? angles.asc : id === "MC" ? angles.mc : undefined);
      for (const [id, end] of [
        [aspect.a, segment.from],
        [aspect.b, segment.to],
      ] as const) {
        const lon = lonOf(id);
        if (lon === undefined) continue;
        const expected = polarToCartesian(cx, cy, aspectRadius, eclipticToSvgAngle(lon, rotation));
        expect(end.x).toBeCloseTo(expected.x, 9);
        expect(end.y).toBeCloseTo(expected.y, 9);
      }
    });
  });

  it("never draws an aspect of the South Node", () => {
    for (const name of ["A", "B", "C", "D", "unknownTime"] as const) {
      const shared = getSharedAspects(charts[name]);
      const segments = aspectSegments(charts[name], shared, wheelRotation(charts[name]));
      expect(segments.some((s) => s.a === "SouthNode" || s.b === "SouthNode")).toBe(false);
    }
  });

  it("has no angle endpoints without a birth time", () => {
    const chart = charts.unknownTime;
    const segments = aspectSegments(chart, getSharedAspects(chart), wheelRotation(chart));
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.some((s) => ["ASC", "DSC", "MC", "IC"].includes(s.a) || ["ASC", "DSC", "MC", "IC"].includes(s.b))).toBe(false);
  });

  it("leaves out an aspect whose endpoint has no longitude", () => {
    const chart = charts.unknownTime;
    const fake = { ...getSharedAspects(chart)[0], a: "ASC" };
    expect(aspectSegments(chart, [fake], 0)).toEqual([]);
  });

  it("tells major from minor aspects", () => {
    const chart = charts.D;
    const segments = aspectSegments(chart, getSharedAspects(chart), wheelRotation(chart));
    expect(segments.some((s) => s.major)).toBe(true);
    expect(segments.some((s) => !s.major)).toBe(true);
    for (const s of segments) expect(s.major).toBe(!["semi-sextile", "semi-square", "quintile", "sesquiquadrate", "bi-quintile", "quincunx"].includes(s.type));
  });

  it("moves the glyph of a diameter off the wheel centre, so oppositions do not pile up", () => {
    const chart = charts.A;
    const oppositions = aspectSegments(
      chart,
      getSharedAspects(chart).filter((a) => a.type === "opposition"),
      wheelRotation(chart),
    );
    expect(oppositions.length).toBeGreaterThan(0);
    for (const s of oppositions) expect(distanceFromCentre(s.symbol)).toBeGreaterThan(20);
    const others = aspectSegments(
      chart,
      getSharedAspects(chart).filter((a) => a.type === "square"),
      wheelRotation(chart),
    );
    for (const s of others) {
      // A chord far from the centre keeps its glyph in the middle.
      if (distanceFromCentre(s.mid) > 60) {
        expect(s.symbol.x).toBeCloseTo(s.mid.x, 9);
        expect(s.symbol.y).toBeCloseTo(s.mid.y, 9);
      }
    }
  });
});

describe("filters only hide aspects (DEC-011)", () => {
  it("never change the shared set or its values", () => {
    const shared = getSharedAspects(charts.D);
    const snapshot = JSON.parse(JSON.stringify(shared));
    const majors = filterAspects(shared, new Set(DEFAULT_ASPECT_TYPES));
    const all = filterAspects(shared, new Set(ALL_ASPECT_TYPES));
    const none = filterAspects(shared, new Set());
    expect(shared).toEqual(snapshot);
    expect(all).toEqual(shared);
    expect(none).toEqual([]);
    expect(majors.length).toBeLessThan(shared.length);
    // Every visible aspect is the very same object of the shared set.
    for (const aspect of majors) expect(shared).toContain(aspect);
  });

  it("show the minor aspects only when their types are switched on", () => {
    const chart = charts.D;
    const rotation = wheelRotation(chart);
    const defaults = aspectSegments(chart, filterAspects(getSharedAspects(chart), new Set(DEFAULT_ASPECT_TYPES)), rotation);
    const everything = aspectSegments(chart, filterAspects(getSharedAspects(chart), new Set(ALL_ASPECT_TYPES)), rotation);
    expect(defaults.every((s) => s.major)).toBe(true);
    expect(everything.some((s) => !s.major)).toBe(true);
    expect(everything.length).toBeGreaterThan(defaults.length);
    // The drawn majors are the same lines in both views.
    expect(everything.filter((s) => s.major)).toEqual(defaults);
  });
});

describe("line weight", () => {
  it("grows with the tightness of the orb and stays within bounds", () => {
    expect(aspectStrokeWidth(0)).toBeLessThan(aspectStrokeWidth(0.5));
    expect(aspectStrokeWidth(0.5)).toBeLessThan(aspectStrokeWidth(1));
    expect(aspectStrokeWidth(-1)).toBe(aspectStrokeWidth(0));
    expect(aspectStrokeWidth(2)).toBe(aspectStrokeWidth(1));
    expect(aspectStrokeOpacity(0.2)).toBeLessThan(aspectStrokeOpacity(0.9));
  });

  it("follows the shared exactness of each aspect", () => {
    const chart = charts.A;
    const shared = getSharedAspects(chart);
    const segments = aspectSegments(chart, shared, wheelRotation(chart));
    const tight = segments.reduce((best, s) => (s.exactness > best.exactness ? s : best));
    const loose = segments.reduce((worst, s) => (s.exactness < worst.exactness ? s : worst));
    expect(aspectStrokeWidth(tight.exactness)).toBeGreaterThan(aspectStrokeWidth(loose.exactness));
  });
});

describe("connectedIds", () => {
  it("is null without a focus and otherwise holds the focus and its aspect partners", () => {
    const shared = getSharedAspects(charts.A);
    expect(connectedIds(null, shared)).toBeNull();
    const sun = connectedIds("Sun", shared)!;
    expect(sun.has("Sun")).toBe(true);
    for (const a of shared) {
      if (a.a === "Sun") expect(sun.has(a.b)).toBe(true);
      if (a.b === "Sun") expect(sun.has(a.a)).toBe(true);
    }
  });
});

describe("signGlyph", () => {
  it("asks for the text form of the glyph", () => {
    expect(signGlyph("Aries")).toBe("♈︎");
    expect(signGlyph("Pisces")).toBe("♓︎");
  });
});
