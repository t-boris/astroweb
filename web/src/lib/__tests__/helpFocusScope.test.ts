import { describe, expect, it } from "vitest";
import { HelpFocusScope } from "@/lib/helpFocusScope";

/** Registers `count` elements for one key and returns what each of them was last told. */
function register(scope: HelpFocusScope, key: string, count: number) {
  const told: boolean[] = Array(count).fill(true);
  const releases = told.map((_, i) => scope.claim(key, (first) => { told[i] = first; }));
  return { told, releases };
}

describe("help tab stops (REQ-005)", () => {
  it("only the first element of a key is a tab stop", () => {
    const { told } = register(new HelpFocusScope(), "planets.Sun", 4);
    expect(told).toEqual([true, false, false, false]);
  });

  it("different keys do not affect each other", () => {
    const scope = new HelpFocusScope();
    const a = register(scope, "planets.Sun", 2);
    const b = register(scope, "planets.Moon", 2);
    expect(a.told).toEqual([true, false]);
    expect(b.told).toEqual([true, false]);
  });

  it("when the first element goes away the next one takes over", () => {
    const { told, releases } = register(new HelpFocusScope(), "terms.orb", 3);
    releases[0]();
    expect(told.slice(1)).toEqual([true, false]);
    releases[1]();
    expect(told[2]).toBe(true);
  });

  it("a release that is not the first leaves the first as it was", () => {
    const { told, releases } = register(new HelpFocusScope(), "terms.orb", 3);
    releases[2]();
    expect(told.slice(0, 2)).toEqual([true, false]);
  });

  it("a release is safe to call twice", () => {
    const { releases } = register(new HelpFocusScope(), "terms.orb", 2);
    releases[0]();
    expect(() => releases[0]()).not.toThrow();
  });

  it("an element added later does not steal the tab stop", () => {
    const scope = new HelpFocusScope();
    const { told } = register(scope, "houses.1", 1);
    const later: boolean[] = [true];
    scope.claim("houses.1", (first) => { later[0] = first; });
    expect(told).toEqual([true]);
    expect(later).toEqual([false]);
  });
});
