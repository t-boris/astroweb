import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useDeviceId } from "@/hooks/useDeviceId";
import { listProfiles } from "@/api/profiles";
import { getWallet } from "@/api/wallet";
import { claimProfiles } from "@/api/claim";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import Cosmos from "@/components/Cosmos";
import ConsentBanner from "@/components/ConsentBanner";
import SiteFooter from "@/components/SiteFooter";
import { HelpBubble } from "@/components/HelpBubble";
import { HelpFocusScope, HelpFocusScopeContext } from "@/lib/helpFocusScope";
import AnalyticsRuntime from "@/components/AnalyticsRuntime";
import { syncHeadForPath } from "@/seo/head";
import { homePath, publicRoute } from "@/seo/routes";
import { toAppLanguage } from "@/lib/language";
import type { Profile } from "@/types";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = toAppLanguage(i18n.language);
  const home = homePath(lang);

  // Per-route <head> for SPA navigation (the static HTML already carries it for first loads).
  useEffect(() => {
    syncHeadForPath(location.pathname, lang);
  }, [location.pathname, lang]);

  // The ✦ stars pill is the Premium entry point: clicking it opens the Premium
  // (buy stars) tab of the current profile, or the first profile otherwise.
  function openPremium() {
    const m = location.pathname.match(/^\/profile\/([^/]+)/);
    const target = m && m[1] !== "new" ? m[1] : profiles[0]?.id;
    if (target) navigate(`/profile/${target}?tab=premium`);
    else navigate(home);
  }
  // One scope per page: the first element of each help term is a tab stop (REQ-005), the repeats are not.
  const helpFocusScope = useMemo(() => new HelpFocusScope(), []);
  const deviceId = useDeviceId();
  const isHome = publicRoute(location.pathname)?.kind === "landing";
  const [stars, setStars] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); }), []);

  // Total stars + first profile — by account when signed in, else by device.
  // `refreshTick` is bumped by the "astroweb:stars-changed" event so the header
  // re-fetches the balance right after a star is spent (oracle, unlock, …).
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const onChanged = () => setRefreshTick((n) => n + 1);
    window.addEventListener("astroweb:stars-changed", onChanged);
    return () => window.removeEventListener("astroweb:stars-changed", onChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // First profile (for the nav quick-links) comes from the profile list;
    // the star balance is the shared per-user wallet, not a per-profile sum.
    listProfiles(deviceId)
      .then((ps) => {
        if (!cancelled) setProfiles(ps.filter((p) => !p.archived));
      })
      .catch(() => {});
    getWallet(deviceId)
      .then((tokens) => {
        if (!cancelled) setStars(tokens);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [deviceId, location.pathname, user?.uid, refreshTick]);

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      // Migrate this device's anonymous profiles into the account, then reload
      // so everything re-fetches under the account.
      try { await claimProfiles(deviceId); } catch { /* ignore */ }
      window.location.reload();
    } catch {
      /* user cancelled */
    }
  }

  const navLink = "cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground";

  return (
    <div className="ds relative min-h-screen bg-background text-foreground">
      <Cosmos />
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
          <Link to={home} className="flex flex-none items-baseline gap-1">
            <span
              className="font-serif text-base uppercase tracking-[0.14em] text-foreground sm:text-xl sm:tracking-[0.16em]"
              style={{ fontFamily: "Marcellus, serif" }}
            >
              Astro<span className="text-[#8fb6ff]">Web</span>
            </span>
            <span className="hidden text-[10px] font-normal tracking-wide text-muted-foreground/70 sm:inline">
              v{__APP_VERSION__}
            </span>
          </Link>
          {/* Profile switcher — available while viewing or editing, not on Home */}
          {!isHome && (
            <div className="mr-auto min-w-0 pl-1 sm:ml-2 sm:pl-2">
              <ProfileSwitcher profiles={profiles} />
            </div>
          )}
          <div className="flex flex-none items-center gap-2 sm:gap-4">
            <nav className="hidden items-center gap-6 md:flex">
              <Link to={home} className={`${navLink} ${isHome ? "text-foreground" : ""}`}>
                {t("nav.charts", "Charts")}
              </Link>
            </nav>
            {stars !== null && (
              <HelpBubble helpKey="nav.stars" actionable badge label={t("nav.stars", "Stars")}>
                <button
                  type="button"
                  onClick={openPremium}
                  aria-label={`${t("nav.stars", "Stars")}: ${stars}`}
                  className="inline-flex flex-none items-center gap-1 rounded-full border border-[#e8c969]/40 bg-[#e8c969]/10 px-2.5 py-1.5 text-[13px] font-semibold text-[#e8c969] transition-colors hover:bg-[#e8c969]/20"
                >
                  ✦ {stars} <span className="hidden sm:inline">{t("nav.stars", "Stars")}</span>
                </button>
              </HelpBubble>
            )}
            <LanguageSwitcher />
            {authReady && (
              user ? (
                <HelpBubble helpKey="nav.account" actionable badge label={t("nav.account", "Account")}>
                  <Link
                    to="/account"
                    className="flex items-center gap-2"
                    aria-label={user.email ? `${t("nav.account", "Account")}: ${user.email}` : t("nav.account", "Account")}
                  >
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="h-7 w-7 rounded-full border border-border" />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">{(user.email ?? "?")[0]?.toUpperCase()}</span>
                    )}
                    <span className={`${navLink} hidden sm:inline`}>{t("nav.account", "Account")}</span>
                  </Link>
                </HelpBubble>
              ) : (
                <HelpBubble helpKey="nav.signIn" actionable badge label={t("nav.signIn", "Sign in")}>
                  <Button
                    size="sm"
                    onClick={handleSignIn}
                    className="rounded-full bg-primary px-4 text-primary-foreground hover:bg-[#8fb6ff]"
                  >
                    {t("nav.signIn", "Sign in")}
                  </Button>
                </HelpBubble>
              )
            )}
          </div>
        </div>
      </header>
      <main className={`relative z-10 ${isHome ? "" : "mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10"}`}>
        <HelpFocusScopeContext.Provider value={helpFocusScope}>
          <Outlet />
        </HelpFocusScopeContext.Provider>
      </main>
      {location.pathname !== "/admin" && <SiteFooter />}
      <ConsentBanner />
      <AnalyticsRuntime />
    </div>
  );
}
