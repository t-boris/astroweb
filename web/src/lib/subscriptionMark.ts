import type { ProfileSubscription } from "@/types";

/** Colour of the subscription mark by state: gold while letters are written, dimmer and cooler otherwise. */
export const SUBSCRIPTION_COLOURS: Record<ProfileSubscription["state"], string> = {
  active: "#e8c969",
  ending: "#d9a441",
  paused: "#94a3b8",
  past_due: "#f87171",
};

/** Translation key of a cadence ("every_2_days") in `hub.cad*`; null for a cadence this app does not know. */
export function cadenceTextKey(cadence: string): string | null {
  const suffix: Record<string, string> = {
    daily: "Daily",
    every_2_days: "Every2",
    every_5_days: "Every5",
    weekly: "Weekly",
    every_2_weeks: "Every2w",
  };
  return suffix[cadence] ? `hub.cad${suffix[cadence]}` : null;
}
