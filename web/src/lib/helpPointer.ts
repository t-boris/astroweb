import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * Is the primary pointer coarse (a finger)? Decides whether an actionable element gets a "?" button next to it
 * (DEC-002). On pointer devices nothing extra is rendered, so desktop markup and spacing stay exactly as they were.
 */
export type PointerKind = "fine" | "coarse";

/** Forces the pointer kind (tests, previews). Unset in the app. */
export const HelpPointerContext = createContext<PointerKind | null>(null);

const COARSE_QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(COARSE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readCoarse(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COARSE_QUERY).matches;
}

export function useCoarsePointer(): boolean {
  const forced = useContext(HelpPointerContext);
  const media = useSyncExternalStore(subscribe, readCoarse, () => false);
  return forced ? forced === "coarse" : media;
}
