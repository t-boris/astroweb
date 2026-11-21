/** Colours of the four elements on the dark profile wheel and in the element summaries. */

export const ELEMENT_COLORS = {
  fire: {
    fill: "rgba(239, 68, 68, 0.08)",
    stroke: "#ef4444",
    text: "#fca5a5",
  },
  earth: {
    fill: "rgba(34, 197, 94, 0.08)",
    stroke: "#22c55e",
    text: "#86efac",
  },
  air: {
    fill: "rgba(234, 179, 8, 0.08)",
    stroke: "#eab308",
    text: "#fde047",
  },
  water: {
    fill: "rgba(59, 130, 246, 0.08)",
    stroke: "#3b82f6",
    text: "#93c5fd",
  },
};

/** "#rrggbb" or "#rgb" as an `rgba(...)` colour with the given opacity. */
export function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

