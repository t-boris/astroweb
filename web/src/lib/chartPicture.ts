/**
 * Explain my natal chart: the picture the user chose, made ready to send. It is decoded in the browser (so a
 * file that is not a picture is caught before any star is spent), sent unchanged when it is small enough, and
 * otherwise drawn smaller and sent as a JPEG. The browser services are injected so the steps run in tests.
 */

/** The types the server reads; anything else the browser can decode (HEIC on Safari, GIF, BMP) is re-encoded. */
export const SENT_UNCHANGED_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** Longer side of the picture sent, at most: the printed minutes stay legible, and the upload stays quick. */
export const MAX_PICTURE_SIDE_PX = 2000;

/** Largest file sent unchanged. The server takes at most 5 MiB of base64, which is about 3.9 MB of bytes. */
export const MAX_UNCHANGED_BYTES = 3_000_000;

/** A larger file is not opened at all. */
export const MAX_SOURCE_BYTES = 40_000_000;

export const JPEG_QUALITY = 0.9;

/** Why a picture could not be prepared. */
export class PictureError extends Error {
  readonly reason: "too_large" | "unreadable";

  constructor(reason: "too_large" | "unreadable") {
    super(reason);
    this.reason = reason;
  }
}

export interface PreparedPicture {
  /** data:image/...;base64,... as the server takes it. */
  dataUrl: string;
  width: number;
  height: number;
  /** True when the picture was drawn smaller or re-encoded. */
  resized: boolean;
}

/** The part of a 2D canvas context the preparation uses; `CanvasRenderingContext2D` satisfies it. */
export interface PictureContext {
  fillStyle: unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

/** The part of a canvas the preparation uses; `HTMLCanvasElement` satisfies it. */
export interface PictureCanvas {
  getContext(contextId: "2d"): PictureContext | null;
  toDataURL(type: string, quality: number): string;
}

export interface DecodedPicture {
  width: number;
  height: number;
  /** What `drawImage` takes. */
  source: unknown;
}

export interface PictureDeps {
  readDataUrl(file: Blob): Promise<string>;
  decode(dataUrl: string): Promise<DecodedPicture>;
  createCanvas(width: number, height: number): PictureCanvas;
}

/** The size that fits inside a square of `maxSide`, keeping the proportions; unchanged when it already fits. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= maxSide) return { width, height };
  const scale = maxSide / longer;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Whether the file can be sent as it is. Sending the same bytes lets the server recognise a picture it has
 * read before, which is then free.
 */
export function canSendUnchanged(file: { type: string; size: number }, size: { width: number; height: number }): boolean {
  return (
    SENT_UNCHANGED_TYPES.includes(file.type) &&
    file.size <= MAX_UNCHANGED_BYTES &&
    Math.max(size.width, size.height) <= MAX_PICTURE_SIDE_PX
  );
}

export async function preparePicture(file: Blob, deps: PictureDeps = browserPictureDeps): Promise<PreparedPicture> {
  if (file.size > MAX_SOURCE_BYTES) throw new PictureError("too_large");
  let original: string;
  let decoded: DecodedPicture;
  try {
    original = await deps.readDataUrl(file);
    decoded = await deps.decode(original);
  } catch {
    throw new PictureError("unreadable");
  }
  if (decoded.width < 1 || decoded.height < 1) throw new PictureError("unreadable");
  if (canSendUnchanged(file, decoded)) {
    return { dataUrl: original, width: decoded.width, height: decoded.height, resized: false };
  }
  const size = fitWithin(decoded.width, decoded.height, MAX_PICTURE_SIDE_PX);
  const canvas = deps.createCanvas(size.width, size.height);
  const context = canvas.getContext("2d");
  if (!context) throw new PictureError("unreadable");
  // A transparent picture would turn black in a JPEG; charts are drawn on white or on their own background.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(decoded.source, 0, 0, size.width, size.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), width: size.width, height: size.height, resized: true };
}

export const browserPictureDeps: PictureDeps = {
  readDataUrl: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
      reader.readAsDataURL(file);
    }),
  decode: (dataUrl) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, source: image });
      image.onerror = () => reject(new Error("The picture could not be decoded"));
      image.src = dataUrl;
    }),
  createCanvas: (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
};
