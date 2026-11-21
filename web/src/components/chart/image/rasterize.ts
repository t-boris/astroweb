import type { ChartImage } from "./imageCommon";

/** The PNG is drawn as large as this: its longer side is this many pixels (about 10 megapixels at most, which phones can decode). */
export const MAX_IMAGE_SIDE_PX = 3200;

/** How long the blob URL of a download stays valid. */
export const BLOB_URL_LIFETIME_MS = 60_000;

/** The part of a canvas the export uses; `HTMLCanvasElement` satisfies it. */
export interface RasterCanvas {
  getContext(contextId: "2d"): { drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void } | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

/** The browser services the export needs, so the steps can run against stand-ins in tests. */
export interface RasterDeps {
  loadImage(src: string): Promise<unknown>;
  createCanvas(width: number, height: number): RasterCanvas;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** Run `callback` after `ms` milliseconds. */
  defer(callback: () => void, ms: number): void;
  /** Start the browser download of a blob URL under a file name. */
  download(url: string, fileName: string): void;
}

export const browserRasterDeps: RasterDeps = {
  loadImage: (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The chart image could not be decoded"));
      image.src = src;
    }),
  createCanvas: (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  defer: (callback, ms) => {
    window.setTimeout(callback, ms);
  },
  download: (url, fileName) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
};

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Pixel scale of the PNG for an SVG of this size: the picture is always rendered at the maximum size (the SVG stays sharp at any scale). */
export function rasterScale(width: number, height: number): number {
  return MAX_IMAGE_SIDE_PX / Math.max(width, height);
}

/** Draw the SVG onto a canvas at the raster scale and download it as a PNG file. */
export async function downloadSvgAsPng(image: ChartImage, fileName: string, deps: RasterDeps = browserRasterDeps): Promise<void> {
  const scale = rasterScale(image.width, image.height);
  const pixelWidth = Math.round(image.width * scale);
  const pixelHeight = Math.round(image.height * scale);

  const decoded = await deps.loadImage(svgDataUrl(image.svg));
  const canvas = deps.createCanvas(pixelWidth, pixelHeight);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D canvas is not available");
  context.drawImage(decoded, 0, 0, pixelWidth, pixelHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("The PNG could not be encoded"))), "image/png");
  });

  const url = deps.createObjectURL(blob);
  try {
    deps.download(url, fileName);
  } catch (error) {
    deps.revokeObjectURL(url);
    throw error;
  }
  // The browser reads the blob after the click returns; Safari and Firefox fail the download when the URL is
  // revoked at once, so it is released a minute later.
  deps.defer(() => deps.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
}

export type ImageDownloadState = "idle" | "busy" | "error";

/** Build the image, rasterize it and download it, reporting the state the button shows. */
export async function runImageDownload(
  build: () => Promise<ChartImage>,
  fileName: string,
  onState: (state: ImageDownloadState) => void,
  deps: RasterDeps = browserRasterDeps,
): Promise<void> {
  onState("busy");
  try {
    await downloadSvgAsPng(await build(), fileName, deps);
    onState("idle");
  } catch (error) {
    console.error("Chart image download failed:", error);
    onState("error");
  }
}
