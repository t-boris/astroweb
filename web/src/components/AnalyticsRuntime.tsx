import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ADMIN_EMAIL } from "@/lib/admin";
import { getConsentSnapshot, subscribeConsent } from "@/lib/consent";
import {
  resetPageViewDedupe,
  setAnalyticsUser,
  setInternalTraffic,
  startConsentWatcher,
  trackPageView,
} from "@/lib/analytics";

/**
 * Wires consent -> analytics: one page_view per route change, user_id for
 * signed-in users, and the internal-traffic marker for the admin. Renders nothing.
 */
export default function AnalyticsRuntime() {
  const { pathname } = useLocation();
  const { consent } = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getConsentSnapshot);

  useEffect(() => startConsentWatcher(), []);

  // A fresh grant must count the page the visitor is already on.
  useEffect(() => {
    if (consent === "granted") resetPageViewDedupe();
  }, [consent]);

  useEffect(() => {
    if (consent === "granted") trackPageView(pathname);
  }, [pathname, consent]);

  useEffect(() => {
    if (consent !== "granted") return;
    return onAuthStateChanged(auth, (user) => {
      setAnalyticsUser(user?.uid ?? null);
      setInternalTraffic(user?.email === ADMIN_EMAIL);
    });
  }, [consent]);

  return null;
}
