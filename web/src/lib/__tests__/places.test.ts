import { describe, expect, it } from "vitest";
import { formatPlaceName, reverseGeocode } from "@/lib/places";

/** Place names from Photon, shared by the place search and the place recovered from a chart picture. */

describe("formatPlaceName", () => {
  it("joins the name, the region and the country that are present, each once", () => {
    expect(formatPlaceName({ name: "Cape Town", state: "Western Cape", country: "South Africa" })).toBe(
      "Cape Town, Western Cape, South Africa",
    );
    expect(formatPlaceName({ name: "Moscow", state: "Moscow", country: "Russia" })).toBe("Moscow, Russia");
    expect(formatPlaceName({ name: "Monaco", country: "Monaco" })).toBe("Monaco");
    expect(formatPlaceName({})).toBe("");
  });
});

describe("reverseGeocode", () => {
  it("asks Photon's /reverse (not /api/reverse, which is a 404) for the nearest town, in English", async () => {
    const urls: string[] = [];
    const name = await reverseGeocode(-33.913, 18.335, async (url) => {
      urls.push(url);
      return { features: [{ properties: { name: "Cape Town", type: "city", state: "Western Cape", country: "South Africa" } }] };
    });
    expect(name).toBe("Cape Town, Western Cape, South Africa");
    expect(urls).toEqual(["https://photon.komoot.io/reverse?lat=-33.913&lon=18.335&lang=en&radius=25&layer=city"]);
  });

  it("falls back to the town of the nearest object, not its own name (a house or a shop)", async () => {
    const urls: string[] = [];
    const name = await reverseGeocode(50.45, 30.52, async (url) => {
      urls.push(url);
      return url.includes("layer=city")
        ? { features: [] }
        : { features: [{ properties: { name: "Some Garage", type: "house", city: "Kyiv", country: "Ukraine" } }] };
    });
    expect(name).toBe("Kyiv, Ukraine");
    expect(urls).toHaveLength(2);
    expect(urls[1]).not.toContain("layer=");
  });

  it("gives null when there is no place, no name, or no answer", async () => {
    expect(await reverseGeocode(46, -30, async () => ({ features: [] }))).toBeNull();
    expect(await reverseGeocode(0, 0, async () => ({ features: [{ properties: {} }] }))).toBeNull();
    expect(await reverseGeocode(0, 0, async () => null)).toBeNull();
    expect(
      await reverseGeocode(0, 0, async () => {
        throw new Error("offline");
      }),
    ).toBeNull();
  });
});
