/** Width of the docked profiles panel (px): what the user may drag it to, and how the choice is remembered. */

export const PANEL_MIN = 220;
export const PANEL_MAX = 440;
export const PANEL_DEFAULT = 240;
/** Arrow key step, and the step with Shift held. */
export const PANEL_STEP = 16;
export const PANEL_STEP_BIG = 48;

export const PANEL_STORAGE_KEY = "astroweb:profilesPanelWidth:v1";

/** The panel never takes more than 40% of the window, so the page next to it stays usable. */
export function maxPanelWidth(viewportWidth: number): number {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.round(viewportWidth * 0.4)));
}

export function clampPanelWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return PANEL_DEFAULT;
  return Math.min(maxPanelWidth(viewportWidth), Math.max(PANEL_MIN, Math.round(width)));
}

/** The width after a key press on the resize handle, or null when the key does nothing. */
export function widthAfterKey(key: string, width: number, shift: boolean, viewportWidth: number): number | null {
  const step = shift ? PANEL_STEP_BIG : PANEL_STEP;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clampPanelWidth(width + step, viewportWidth);
    case "ArrowLeft":
    case "ArrowDown":
      return clampPanelWidth(width - step, viewportWidth);
    case "Home":
      return PANEL_MIN;
    case "End":
      return maxPanelWidth(viewportWidth);
    default:
      return null;
  }
}

/** The remembered width, or the default when nothing usable is stored (storage can be missing or blocked). */
export function readStoredPanelWidth(storage: Pick<Storage, "getItem"> | null): number {
  try {
    const raw = storage?.getItem(PANEL_STORAGE_KEY);
    if (raw === null || raw === undefined) return PANEL_DEFAULT;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(value))) : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

export function storePanelWidth(storage: Pick<Storage, "setItem" | "removeItem"> | null, width: number): void {
  try {
    if (width === PANEL_DEFAULT) storage?.removeItem(PANEL_STORAGE_KEY);
    else storage?.setItem(PANEL_STORAGE_KEY, String(width));
  } catch {
    // Not remembering the width is harmless.
  }
}
