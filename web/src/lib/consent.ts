/**
 * Analytics consent store (REQ-001, Basic Consent Mode, DEC-002).
 * The choice is persisted in localStorage under one key and can be reopened and
 * changed at any time. Until the user grants consent nothing analytics-related
 * is loaded or sent.
 */

export const CONSENT_KEY = "astroweb.analyticsConsent";
export type ConsentChoice = "granted" | "denied";
export type ConsentState = ConsentChoice | "unknown";

export interface ConsentSnapshot {
  consent: ConsentState;
  /** True while the banner is shown: no decision yet, or the user reopened it. */
  bannerOpen: boolean;
}

const listeners = new Set<() => void>();

function readStored(): ConsentState {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : "unknown";
  } catch {
    // Storage blocked (private mode etc.): behave as undecided, nothing loads.
    return "unknown";
  }
}

let snapshot: ConsentSnapshot | null = null;

function current(): ConsentSnapshot {
  if (!snapshot) {
    const consent = readStored();
    snapshot = { consent, bannerOpen: consent === "unknown" };
  }
  return snapshot;
}

function update(next: ConsentSnapshot): void {
  snapshot = next;
  listeners.forEach((fn) => fn());
}

/** Stable snapshot for useSyncExternalStore. */
export function getConsentSnapshot(): ConsentSnapshot {
  return current();
}

export function getConsent(): ConsentState {
  return current().consent;
}

export function subscribeConsent(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Persist the user's choice and close the banner. */
export function setConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* choice still applies for this page load */
  }
  update({ consent: choice, bannerOpen: false });
}

/** Reopen the banner (footer / privacy page control) without changing the stored choice. */
export function openConsentChoice(): void {
  update({ ...current(), bannerOpen: true });
}

export function closeConsentChoice(): void {
  update({ ...current(), bannerOpen: false });
}

/** Test helper: forget the in-memory snapshot so the next read re-reads storage. */
export function resetConsentForTests(): void {
  snapshot = null;
  listeners.clear();
}
