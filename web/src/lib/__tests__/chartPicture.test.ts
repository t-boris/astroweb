import { describe, expect, it } from "vitest";
import {
  JPEG_QUALITY,
  MAX_PICTURE_SIDE_PX,
  MAX_SOURCE_BYTES,
  MAX_UNCHANGED_BYTES,
  PictureError,
  canSendUnchanged,
  fitWithin,
  preparePicture,
  type PictureDeps,
} from "@/lib/chartPicture";

/** The chart picture made ready to send: sent unchanged when it can be, else drawn smaller as a JPEG. */

interface Calls {
  read: number;
  canvas: { width: number; height: number } | null;
  ops: string[];
  encoded: { type: string; quality: number } | null;
}

function deps(picture: { width: number; height: number } | "broken", calls: Calls): PictureDeps {
  return {
    readDataUrl: async () => {
      calls.read += 1;
      return "data:image/png;base64,ORIGINAL";
    },
    decode: async () => {
      if (picture === "broken") throw new Error("not a picture");
      return { ...picture, source: "decoded" };
    },
    createCanvas: (width, height) => {
      calls.canvas = { width, height };
      return {
        getContext: () => ({
          fillStyle: "",
          fillRect: () => calls.ops.push("fill"),
          drawImage: (image, _x, _y, w, h) => calls.ops.push(`draw ${String(image)} ${w}x${h}`),
        }),
        toDataURL: (type, quality) => {
          calls.encoded = { type, quality };
          return "data:image/jpeg;base64,SMALLER";
        },
      };
    },
  };
}

const fresh = (): Calls => ({ read: 0, canvas: null, ops: [], encoded: null });
const file = (type: string, size: number) => ({ type, size }) as Blob;

describe("fitWithin", () => {
  it("keeps a picture that fits and shrinks a larger one in proportion", () => {
    expect(fitWithin(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000 });
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1000, 5000, 2000)).toEqual({ width: 400, height: 2000 });
    expect(fitWithin(10000, 3, 2000)).toEqual({ width: 2000, height: 1 });
  });
});

describe("canSendUnchanged", () => {
  it("sends the server's types unchanged while small enough", () => {
    expect(canSendUnchanged({ type: "image/png", size: 500_000 }, { width: 1500, height: 1000 })).toBe(true);
    expect(canSendUnchanged({ type: "image/webp", size: 90_000 }, { width: 900, height: 900 })).toBe(true);
    expect(canSendUnchanged({ type: "image/jpeg", size: MAX_UNCHANGED_BYTES + 1 }, { width: 1500, height: 1000 })).toBe(false);
    expect(canSendUnchanged({ type: "image/png", size: 500_000 }, { width: MAX_PICTURE_SIDE_PX + 1, height: 100 })).toBe(false);
    expect(canSendUnchanged({ type: "image/heic", size: 500_000 }, { width: 1500, height: 1000 })).toBe(false);
  });

  it("keeps the unchanged limit inside the server's 5 MiB of base64", () => {
    expect(Math.ceil(MAX_UNCHANGED_BYTES / 3) * 4).toBeLessThan(5 * 1024 * 1024);
  });
});

describe("preparePicture", () => {
  it("sends a small PNG as it is, so the same picture is recognised and free the second time", async () => {
    const calls = fresh();
    const out = await preparePicture(file("image/png", 90_000), deps({ width: 1200, height: 900 }, calls));
    expect(out).toEqual({ dataUrl: "data:image/png;base64,ORIGINAL", width: 1200, height: 900, resized: false });
    expect(calls.canvas).toBeNull();
  });

  it("draws a large picture at 2000 px on a white ground and sends a JPEG", async () => {
    const calls = fresh();
    const out = await preparePicture(file("image/png", 2_000_000), deps({ width: 4000, height: 3000 }, calls));
    expect(out).toEqual({ dataUrl: "data:image/jpeg;base64,SMALLER", width: 2000, height: 1500, resized: true });
    expect(calls.canvas).toEqual({ width: 2000, height: 1500 });
    expect(calls.ops).toEqual(["fill", "draw decoded 2000x1500"]);
    expect(calls.encoded).toEqual({ type: "image/jpeg", quality: JPEG_QUALITY });
  });

  it("re-encodes a type the server does not take (a HEIC photo opened by Safari)", async () => {
    const calls = fresh();
    const out = await preparePicture(file("image/heic", 1_000_000), deps({ width: 1500, height: 1000 }, calls));
    expect(out.resized).toBe(true);
    expect(out.dataUrl).toBe("data:image/jpeg;base64,SMALLER");
    expect(calls.canvas).toEqual({ width: 1500, height: 1000 });
  });

  it("refuses a file that is not a picture, and a huge file without reading it", async () => {
    await expect(preparePicture(file("application/pdf", 10_000), deps("broken", fresh()))).rejects.toEqual(new PictureError("unreadable"));
    const calls = fresh();
    const error = await preparePicture(file("image/png", MAX_SOURCE_BYTES + 1), deps({ width: 10, height: 10 }, calls)).catch((e) => e);
    expect(error).toBeInstanceOf(PictureError);
    expect((error as PictureError).reason).toBe("too_large");
    expect(calls.read).toBe(0);
  });
});
