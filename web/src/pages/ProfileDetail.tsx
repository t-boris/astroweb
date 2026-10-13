import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FirebaseError } from "firebase/app";
import { useDeviceId } from "@/hooks/useDeviceId";
import { getProfile, archiveProfile, updateProfile } from "@/api/profiles";
import { getChart } from "@/api/charts";
import { createCheckoutSession } from "@/api/stripe";
import { STAR_PACKS } from "@/lib/tokens";
import { getCheckoutAnalytics, trackEvent, trackOnce } from "@/lib/analytics";
import { auth } from "@/lib/firebase";
import { ensureSignedIn } from "@/lib/contentSync";
import { PROFILE_TABS, type ProfileTab } from "@/lib/analyticsEvents";
import { getWalletInfo } from "@/api/wallet";
import { signLabel } from "@/lib/signs";
import { planetHelpKey, signHelpKey, tabHelpKey } from "@/lib/helpKeys";
import { motion } from "framer-motion";
import PlaceSearch from "@/components/PlaceSearch";
import { HelpBubble } from "@/components/HelpBubble";
import NatalChart from "@/components/chart/NatalChart";
import { ForecastView } from "@/components/chart/ForecastView";
import { PlanetsTable } from "@/components/chart/PlanetsTable";
import { AspectsTable } from "@/components/chart/AspectsTable";
import { InterpretationView } from "@/components/chart/InterpretationView";
import { HouseAreasView } from "@/components/chart/HouseAreasView";
import { RelationshipView } from "@/components/chart/RelationshipView";
import AstrologerPanel from "@/components/AstrologerPanel";
import LettersInbox from "@/components/LettersInbox";
import { listLetters } from "@/api/letters";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Profile, ChartResult } from "@/types";

interface StoredRelocation {
  enabled: boolean;
  place: string;
  lat: number;
  lng: number;
}

function getRelocationStorageKey(profileId: string): string {
  return `astroweb:relocation:v1:${profileId}`;
}

function isCompleteRelocation(value: Partial<StoredRelocation>): value is StoredRelocation {
  return (
    typeof value.place === "string" &&
    value.place.trim().length > 0 &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

function getProfileRelocation(profile: Profile): StoredRelocation | null {
  const relocation = {
    enabled: Boolean(profile.relocationEnabled),
    place: profile.currentPlace,
    lat: profile.currentLat,
    lng: profile.currentLng,
  };

  return isCompleteRelocation(relocation) ? relocation : null;
}

function readStoredRelocation(profileId: string): StoredRelocation | null {
  try {
    const raw = localStorage.getItem(getRelocationStorageKey(profileId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredRelocation>;
    return isCompleteRelocation(parsed)
      ? { ...parsed, enabled: Boolean(parsed.enabled) }
      : null;
  } catch {
    return null;
  }
}

const SIGN_ORDER = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
function signFromLongitude(lon: number): string {
  const n = ((lon % 360) + 360) % 360;
  return SIGN_ORDER[Math.floor(n / 30)];
}

export default function ProfileDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const deviceId = useDeviceId();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartResult | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartRetryCount, setChartRetryCount] = useState(0);
  const [relocationEnabled, setRelocationEnabled] = useState(false);
  const [relocationPlace, setRelocationPlace] = useState("");
  const [relocationLat, setRelocationLat] = useState<number | null>(null);
  const [relocationLng, setRelocationLng] = useState<number | null>(null);
  const [relocationSaving, setRelocationSaving] = useState(false);
  const [relocationSaveError, setRelocationSaveError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const validTabs = ["chart", "planets", "aspects", "houses", "interpretation", "oracle", "compatibility", "transits", "astrologer", "premium"];
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabParam && validTabs.includes(tabParam) ? tabParam : "chart",
  );

  // Keep the active tab in sync with the ?tab= query param. Without this, the
  // top-nav links (Oracle / Transits / Compatibility) only change the URL when
  // we're already on a profile page — the component never remounts, so the
  // useState initializer above doesn't re-run and the tab wouldn't switch.
  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  // Funnel: one chart_viewed each time a tab becomes active (re-renders do not
  // repeat it) once the profile is loaded; the Premium tab is also the
  // paywall/store view.
  const lastViewedTab = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || !id || !(PROFILE_TABS as readonly string[]).includes(activeTab)) return;
    const key = `${id}:${activeTab}`;
    if (lastViewedTab.current === key) return;
    lastViewedTab.current = key;
    trackEvent("chart_viewed", { tab: activeTab as ProfileTab });
    if (activeTab === "premium") trackOnce(id, "paywall_viewed", { feature: "premium_store" });
  }, [profile, id, activeTab]);

  // One-time first-reading discount eligibility (drives the store price label).
  const [firstReadingAvailable, setFirstReadingAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getWalletInfo(deviceId)
      .then((w) => {
        if (!cancelled) setFirstReadingAvailable(w.firstReadingAvailable);
      })
      .catch(() => {
        if (!cancelled) setFirstReadingAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  // Unread astrologer letters → badge on the Astrologer tab. Silently 0 when
  // the user isn't signed in or has no letters (listLetters throws/empty).
  const [unreadLetters, setUnreadLetters] = useState(0);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    listLetters(id)
      .then((letters) => {
        if (!cancelled) setUnreadLetters(letters.filter((l) => l.status !== "read").length);
      })
      .catch(() => {
        if (!cancelled) setUnreadLetters(0);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Opening the tab renders the inbox, which marks every letter read — so clear
  // the badge immediately for a consistent UI.
  useEffect(() => {
    if (activeTab === "astrologer") setUnreadLetters(0);
  }, [activeTab]);

  function getErrorMessage(err: unknown, fallbackKey: string): string {
    if (err instanceof FirebaseError) {
      if (err.message.includes("not-found")) return t("errors.profileNotFound");
      if (err.message.includes("permission-denied")) return t("errors.permissionDenied");
      if (err.message.includes("invalid-argument")) return t("errors.profileSaveFailed");
    }
    return t(fallbackKey);
  }

  // Fetch profile
  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      if (!id) {
        setError(t("errors.profileNotFound"));
        setLoading(false);
        return;
      }

      try {
        const data = await getProfile(id, deviceId);
        if (!cancelled) {
          setProfile(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (
            err instanceof FirebaseError &&
            err.message.includes("not-found")
          ) {
            setError(t("errors.profileNotFound"));
          } else {
            setError(getErrorMessage(err, "errors.unknownError"));
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, deviceId]);

  // Re-fetch the profile after an unlock so token balance + flags update.
  async function reloadProfile() {
    if (!id) return;
    try {
      const data = await getProfile(id, deviceId);
      setProfile(data);
    } catch {
      /* ignore */
    }
  }

  // Fetch chart (after profile loads, or on chart retry)
  useEffect(() => {
    if (!profile || !id) return;
    let cancelled = false;

    async function fetchChart() {
      // Relocation on but no place picked yet: don't dead-end the screen — fall
      // back to the base natal chart so the tabs (and the place picker inside
      // the Chart tab) still render. A gentle prompt there asks for a place.
      setChartLoading(true);
      setChartError(null);
      try {
        const { chart } = await getChart(
          id!,
          deviceId,
          "koch",
          relocationEnabled && relocationLat !== null && relocationLng !== null
            ? { lat: relocationLat, lng: relocationLng }
            : null,
        );
        if (!cancelled) setChartData(chart);
      } catch {
        if (!cancelled) setChartError(t("errors.chartLoadFailed"));
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }

    fetchChart();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, id, deviceId, chartRetryCount, relocationEnabled, relocationLat, relocationLng]);

  useEffect(() => {
    if (!id || !profile) return;

    const profileRelocation = getProfileRelocation(profile);
    if (profileRelocation) {
      setRelocationEnabled(profileRelocation.enabled);
      setRelocationPlace(profileRelocation.place);
      setRelocationLat(profileRelocation.lat);
      setRelocationLng(profileRelocation.lng);
      saveRelocation(
        id,
        profileRelocation.enabled,
        profileRelocation.place,
        profileRelocation.lat,
        profileRelocation.lng,
      );
      return;
    }

    const storedRelocation = readStoredRelocation(id);
    if (storedRelocation) {
      setRelocationEnabled(storedRelocation.enabled);
      setRelocationPlace(storedRelocation.place);
      setRelocationLat(storedRelocation.lat);
      setRelocationLng(storedRelocation.lng);
      void persistRelocation(
        storedRelocation.enabled,
        storedRelocation.place,
        storedRelocation.lat,
        storedRelocation.lng,
      );
      return;
    }

    setRelocationEnabled(false);
    setRelocationPlace("");
    setRelocationLat(null);
    setRelocationLng(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profile]);

  function saveRelocation(profileId: string, enabled: boolean, place: string, lat: number | null, lng: number | null) {
    try {
      if (lat === null || lng === null || !place) {
        localStorage.removeItem(getRelocationStorageKey(profileId));
        return;
      }
      const payload: StoredRelocation = { enabled, place, lat, lng };
      localStorage.setItem(getRelocationStorageKey(profileId), JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  }

  async function persistRelocation(
    enabled: boolean,
    place: string,
    lat: number | null,
    lng: number | null,
  ) {
    if (!id) return;

    saveRelocation(id, enabled, place, lat, lng);

    const updates: Parameters<typeof updateProfile>[1] = {
      ownerDeviceId: deviceId,
      relocationEnabled: enabled,
    };

    if (place && lat !== null && lng !== null) {
      updates.currentPlace = place;
      updates.currentLat = lat;
      updates.currentLng = lng;
    } else if (enabled) {
      return;
    }

    setRelocationSaving(true);
    setRelocationSaveError(null);
    try {
      const updated = await updateProfile(id, updates);
      setProfile(updated);
    } catch (err) {
      setRelocationSaveError(getErrorMessage(err, "errors.profileSaveFailed"));
    } finally {
      setRelocationSaving(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);

    try {
      await archiveProfile(id, deviceId, true);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err, "errors.profileDeleteFailed"));
      setShowDeleteDialog(false);
      setDeleting(false);
    }
  }

  async function handleBuyPack(packId: string) {
    if (!id) return;
    // Buying stars needs an account (REQ-006, DEC-001): the popup opens in this
    // click, the device's profiles and wallet are claimed, then checkout goes on.
    if (!auth.currentUser) {
      if (!(await ensureSignedIn(deviceId))) return;
      void reloadProfile();
    }
    setCheckoutLoading(packId);
    try {
      const pack = STAR_PACKS.find((p) => p.id === packId);
      const price = pack ? (pack.firstPriceUsd && firstReadingAvailable ? pack.firstPriceUsd : pack.priceUsd) : 0;
      trackEvent("begin_checkout", { pack_id: packId, value: price, currency: "USD", items: [{ item_id: packId }] });
      const analytics = await getCheckoutAnalytics();
      const { url } = await createCheckoutSession({ profileId: id, ownerDeviceId: deviceId, packId, analytics });
      window.location.href = url;
    } catch (err) {
      console.error("Checkout failed:", err);
      // fallback error handling
    } finally {
      setCheckoutLoading(null);
    }
  }

  function handleRelocationSelect(place: {
    name: string;
    lat: number;
    lng: number;
  }) {
    setRelocationPlace(place.name);
    setRelocationLat(place.lat);
    setRelocationLng(place.lng);
    const newEnabled = true;
    if (!relocationEnabled) {
      setRelocationEnabled(true);
    }
    if (id) {
      saveRelocation(id, newEnabled, place.name, place.lat, place.lng);
    }
    void persistRelocation(newEnabled, place.name, place.lat, place.lng);
    setChartRetryCount((c) => c + 1);
  }

  function handleRelocationToggle(checked: boolean) {
    setRelocationEnabled(checked);
    if (id) {
      saveRelocation(id, checked, relocationPlace, relocationLat, relocationLng);
    }
    if (!checked) {
      setChartError(null);
    }
    if (!checked || (relocationPlace && relocationLat !== null && relocationLng !== null)) {
      void persistRelocation(checked, relocationPlace, relocationLat, relocationLng);
    }
    setChartRetryCount((c) => c + 1);
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("profile.detail.title")}
        </h1>
        <p className="text-muted-foreground">{t("profile.detail.loading")}</p>
      </div>
    );
  }

  // Error state (covers not-found and generic errors)
  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("profile.detail.title")}
        </h1>
        <p className="text-destructive">{error}</p>
        <Button variant="outline" asChild>
          <Link to="/">{t("profile.detail.back")}</Link>
        </Button>
      </div>
    );
  }

  // No profile loaded (shouldn't happen after loading, but safe guard)
  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="mb-1 text-xs uppercase tracking-[0.28em] text-[#8fb6ff]">
          ✦ {t("profile.detail.title")}
        </div>
        <h1 className="font-serif text-4xl tracking-tight text-foreground">{profile.name}</h1>
      </motion.div>

      {/* Compact birth-info strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span>📅 {profile.birthDate}</span>
        <HelpBubble helpKey="profile.birthTime">
          <span>🕐 {profile.timeUnknown ? t("profile.detail.timeUnknown") : profile.birthTime}</span>
        </HelpBubble>
        <span>📍 {profile.birthPlace}</span>
        <HelpBubble helpKey="profile.coordinates">
          <span>🌐 {profile.lat.toFixed(2)}, {profile.lng.toFixed(2)}</span>
        </HelpBubble>
      </div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="flex flex-wrap gap-2"
      >
        <Button className="border border-primary/50 text-primary hover:bg-primary/10" variant="outline" asChild>
          <Link to={`/profile/${id}/edit`}>{t("profile.detail.edit")}</Link>
        </Button>
        <Button
          variant="outline"
          className="border border-border text-muted-foreground hover:border-primary hover:text-foreground"
          onClick={() => setShowDeleteDialog(true)}
        >
          {t("profile.detail.archive", "Archive")}
        </Button>
        <Button variant="outline" className="border border-primary/50 text-primary hover:bg-primary/10" asChild>
          <Link to="/">{t("profile.detail.back")}</Link>
        </Button>
      </motion.div>

      {/* Chart / Data Tabs */}
      {chartLoading && (
        <p className="text-muted-foreground text-center">
          {t("profile.detail.chartLoading")}
        </p>
      )}
      {chartError && (
        <div className="text-center space-y-2">
          <p className="text-destructive">{chartError}</p>
          <Button variant="outline" size="sm" onClick={() => { setChartError(null); setChartLoading(true); setChartRetryCount(c => c + 1); }}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {chartData && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full gap-4">
          <TabsList className="flex h-auto w-full flex-wrap items-start justify-start gap-1.5 rounded-none border-b border-border/40 bg-transparent p-0 pb-3 group-data-[orientation=horizontal]/tabs:h-auto">
            {[
              ["chart", t("tabs.chart")],
              ["planets", t("tabs.planets")],
              ["aspects", t("tabs.aspects")],
              ["houses", t("tabs.houses")],
              ["interpretation", t("tabs.interpretation")],
              ["oracle", t("tabs.oracle", "Oracle")],
              ["transits", t("tabs.transits", "Transits")],
              ["compatibility", t("tabs.compatibility")],
              ["astrologer", t("tabs.astrologer", "✦ Astrologer")],
            ].map(([v, label]) => (
              <HelpBubble key={v} helpKey={tabHelpKey(v)} actionable label={label.replace("✦ ", "")}>
                <TabsTrigger
                  value={v}
                  className="h-auto flex-none grow-0 rounded-full border border-border/50 bg-transparent px-3 py-1.5 text-[13px] text-muted-foreground shadow-none transition-colors after:hidden hover:border-primary/60 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary/15 data-[state=active]:text-[#8fb6ff] data-[state=active]:shadow-none"
                >
                  {label}
                  {v === "astrologer" && unreadLetters > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e8c969] px-1 text-[10px] font-semibold leading-none text-[#1a1606]">
                      {unreadLetters}
                    </span>
                  )}
                </TabsTrigger>
              </HelpBubble>
            ))}
          </TabsList>

          <TabsContent value="chart">
            <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_0.85fr]">
              <Card className="ds-card">
                <CardContent className="pt-6">
                  <NatalChart chart={chartData} />
                </CardContent>
              </Card>
              <div className="space-y-5">
                <Card className="ds-card">
                  <CardHeader className="border-b border-border/40">
                    <HelpBubble helpKey="terms.bigThree">
                      <CardTitle className="font-serif text-lg text-[#8fb6ff]">{t("profile.detail.bigThree", "The Big Three")}</CardTitle>
                    </HelpBubble>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    {[
                      { body: "Sun", glyph: "☉", label: t("profile.detail.sun", "Sun"), sign: chartData.points.find((p) => p.body === "Sun")?.sign },
                      { body: "Moon", glyph: "☽", label: t("profile.detail.moon", "Moon"), sign: chartData.points.find((p) => p.body === "Moon")?.sign },
                      { body: "ASC", glyph: "↑", label: t("profile.detail.rising", "Rising"), sign: chartData.houses.asc !== null && !profile.timeUnknown ? signFromLongitude(chartData.houses.asc) : undefined },
                    ].map((b) => {
                      const signText = <div className="font-serif text-lg">{signLabel(t, b.sign)}</div>;
                      return (
                        <div key={b.label} className="flex items-center gap-3">
                          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-primary/40 font-serif text-lg text-[#8fb6ff]">{b.glyph}</div>
                          <div>
                            <HelpBubble helpKey={planetHelpKey(b.body)}>
                              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{b.label}</div>
                            </HelpBubble>
                            {b.sign ? (
                              <HelpBubble helpKey={signHelpKey(b.sign)}>{signText}</HelpBubble>
                            ) : b.body === "ASC" ? (
                              <HelpBubble helpKey="profile.risingUnknown">{signText}</HelpBubble>
                            ) : (
                              signText
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card className="ds-card">
                  <CardHeader className="border-b border-border/40">
                    <HelpBubble helpKey="chart.mode">
                      <CardTitle className="font-serif text-lg text-[#8fb6ff]">{t("profile.detail.chartModeTitle")}</CardTitle>
                    </HelpBubble>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-5">
                    {/* Current residence — always visible (place of living, used by transits/letters) */}
                    <div className="space-y-2">
                      <HelpBubble helpKey="chart.residence">
                        <Label>{t("profile.detail.residenceLabel", "Current residence (where you live now)")}</Label>
                      </HelpBubble>
                      <PlaceSearch
                        onSelect={handleRelocationSelect}
                        initialValue={relocationPlace || undefined}
                        selectedLat={relocationLat}
                        selectedLng={relocationLng}
                      />
                      {relocationPlace && relocationLat !== null && relocationLng !== null ? (
                        <p className="text-sm text-muted-foreground">
                          {t("profile.detail.relocationCurrent")}: {relocationPlace} ({relocationLat.toFixed(4)}, {relocationLng.toFixed(4)})
                        </p>
                      ) : (
                        <HelpBubble helpKey="chart.residenceHint">
                          <p className="text-xs text-muted-foreground">
                            {t("profile.detail.residenceHint", "Not set — defaults to your birthplace. Set it for accurate transits, weather and local news.")}
                          </p>
                        </HelpBubble>
                      )}
                      {relocationSaving && <p className="text-sm text-muted-foreground">{t("profile.detail.relocationSaving")}</p>}
                      {relocationSaveError && <p className="text-sm text-destructive">{relocationSaveError}</p>}
                    </div>

                    {/* Relocate the displayed chart to the current residence */}
                    <div className="flex items-center gap-3 border-t border-border/40 pt-3">
                      <HelpBubble
                        helpKey="chart.relocationSwitch"
                        actionable
                        label={relocationEnabled ? t("profile.detail.relocationMode") : t("profile.detail.natalMode")}
                      >
                        <Switch id="relocation-mode" checked={relocationEnabled} onCheckedChange={handleRelocationToggle} />
                      </HelpBubble>
                      <Label htmlFor="relocation-mode">
                        {relocationEnabled ? t("profile.detail.relocationMode") : t("profile.detail.natalMode")}
                      </Label>
                    </div>
                    <HelpBubble helpKey="chart.relocationHint">
                      <p className="text-xs text-muted-foreground">
                        {relocationEnabled ? t("profile.detail.relocationHintOn") : t("profile.detail.relocationHintOff")}
                      </p>
                    </HelpBubble>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="planets">
            <Card className="ds-card">
              <CardContent className="pt-6">
                <PlanetsTable points={chartData.points} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="aspects">
            <Card className="ds-card">
              <CardContent className="pt-6">
                <AspectsTable aspects={chartData.aspects} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="houses">
            <Card className="ds-card">
              <CardContent className="pt-6">
                <HouseAreasView chart={chartData} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interpretation">
            <Card className="ds-card">
              <CardContent className="pt-6">
                <InterpretationView
                  mode="interpretation"
                  chart={chartData}
                  profileId={id!}
                  profileName={profile.name}
                  ownerDeviceId={deviceId}
                  tokens={profile.tokens || 0}
                  interpretationsUnlocked={profile.hasPremiumPdf || false}
                  onUnlocked={reloadProfile}
                  relocationLat={relocationEnabled ? relocationLat : null}
                  relocationLng={relocationEnabled ? relocationLng : null}
                  onPurchasePremium={() => setActiveTab("premium")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="oracle">
            <Card className="ds-card">
              <CardContent className="pt-6">
                <InterpretationView
                  mode="oracle"
                  chart={chartData}
                  profileId={id!}
                  profileName={profile.name}
                  ownerDeviceId={deviceId}
                  tokens={profile.tokens || 0}
                  interpretationsUnlocked={profile.hasPremiumPdf || false}
                  onUnlocked={reloadProfile}
                  relocationLat={relocationEnabled ? relocationLat : null}
                  relocationLng={relocationEnabled ? relocationLng : null}
                  onPurchasePremium={() => setActiveTab("premium")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transits">
            <ForecastView profileId={id!} ownerDeviceId={deviceId} />
          </TabsContent>

          <TabsContent value="compatibility">
            <Card className="ds-card">
              <CardContent className="pt-6">
                <RelationshipView
                  profileId={id!}
                  ownerDeviceId={deviceId}
                  relocationLat={relocationEnabled ? relocationLat : null}
                  relocationLng={relocationEnabled ? relocationLng : null}
                  tokens={profile.tokens || 0}
                  compatibilityIncluded={profile.hasPremiumCompatibility || false}
                  onUnlocked={reloadProfile}
                  onPurchasePremium={() => setActiveTab("premium")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="astrologer">
            <div className="space-y-6">
              <AstrologerPanel profileId={id!} />
              <LettersInbox profileId={id!} />
            </div>
          </TabsContent>

          <TabsContent value="premium">
            <Card className="ds-card border-[#e8c969]/40 p-5 sm:p-7">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#e8c969]/10 ring-2 ring-[#e8c969]/50 shadow-[0_0_30px_rgba(232,201,105,0.2)]">
                  <span className="text-3xl text-[#e8c969]">✦</span>
                </div>
                <HelpBubble helpKey={tabHelpKey("premium")}>
                  <h3 className="mb-2 font-serif text-2xl font-bold tracking-tight text-gold-gradient sm:text-3xl">
                    {t("premium.title", "Unlock Your Cosmic Destiny")}
                  </h3>
                </HelpBubble>
                <HelpBubble helpKey="premium.balance">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#e8c969]/30 bg-[#e8c969]/10 px-4 py-1.5 text-sm font-medium text-[#e8c969]">
                    <span>✦</span>
                    {t("premium.balance", { count: profile.tokens || 0, defaultValue: `Stars: ${profile.tokens || 0}` })}
                  </div>
                </HelpBubble>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                  {t("premium.storeDescription", "Pick what you want — readings unlock per profile, stars never expire.")}
                </p>
                <HelpBubble helpKey="premium.trust">
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="text-[#8fb6ff]">✓</span>{t("premium.trust1", "One-time payment")}</span>
                    <span className="inline-flex items-center gap-1"><span className="text-[#8fb6ff]">✓</span>{t("premium.trust2", "Stars never expire")}</span>
                    <span className="inline-flex items-center gap-1"><span className="text-[#8fb6ff]">✓</span>{t("premium.trust3", "Unlocks forever")}</span>
                  </div>
                </HelpBubble>
              </div>

              {window.location.search.includes("checkout=success") && (
                <div className="mt-5 rounded-md border border-green-500/30 bg-green-500/20 px-4 py-3 text-center text-sm text-green-400">
                  {t("premium.success", "Purchase successful! Your premium features have been updated.")}
                </div>
              )}

              {firstReadingAvailable && (
                <HelpBubble helpKey="premium.firstOffer" actionable label={t("premium.firstBannerTitle", "First reading just $1.99")}>
                  <button
                    type="button"
                    onClick={() => handleBuyPack("reading")}
                    disabled={checkoutLoading !== null}
                    className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-[#e8c969]/60 bg-gradient-to-r from-[#e8c969]/15 to-transparent p-4 text-left transition-colors hover:from-[#e8c969]/25"
                  >
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#e8c969]/20 text-xl">🎁</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#e8c969]">{t("premium.firstBannerTitle", "First reading just $1.99")}</span>
                      <span className="block text-xs text-muted-foreground">{t("premium.firstBannerDesc", "Full chart reading + dig deeper + PDF — one-time welcome price.")}</span>
                    </span>
                    <span className="flex-none text-right leading-none">
                      <span className="font-serif text-xl font-bold text-[#e8c969]">$1.99</span>
                      <span className="ml-1 text-xs text-muted-foreground line-through">$3.99</span>
                    </span>
                  </button>
                </HelpBubble>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {STAR_PACKS.map((pack, index) => {
                  const showFirst = Boolean(pack.firstPriceUsd && firstReadingAvailable);
                  const price = showFirst ? pack.firstPriceUsd! : pack.priceUsd;
                  return (
                    <div
                      key={pack.id}
                      className={`relative flex flex-col rounded-2xl border p-4 ${
                        pack.popular
                          ? "border-[#e8c969]/60 bg-[#e8c969]/[0.07] shadow-[0_0_30px_-12px_rgba(232,201,105,0.5)] sm:col-span-2"
                          : "border-border/60 bg-background/30"
                      }`}
                    >
                      {pack.popular && (
                        <HelpBubble helpKey="premium.popular">
                          <span className="absolute -top-2.5 left-4 rounded-full bg-[#e8c969] px-2.5 py-0.5 text-[11px] font-semibold text-[#1a1606]">
                            {t("premium.popular", "Most popular")}
                          </span>
                        </HelpBubble>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-serif text-base text-foreground">
                            {t(`premium.packs.${pack.id}.title`, pack.id)}
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {t(`premium.packs.${pack.id}.desc`, "")}
                          </p>
                          <p className="mt-1.5 text-xs font-medium text-[#e8c969]">
                            {index === 0 ? (
                              <HelpBubble helpKey="premium.packStars">
                                <span>✦{pack.stars}</span>
                              </HelpBubble>
                            ) : (
                              <>✦{pack.stars}</>
                            )}
                            {pack.bonusStars ? (
                              <>
                                {" "}
                                <HelpBubble helpKey="premium.bonusStar">
                                  <span>+{pack.bonusStars} {t("premium.bonusStar", "bonus")}</span>
                                </HelpBubble>
                              </>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex-none text-right">
                          {showFirst && (
                            <HelpBubble helpKey="premium.firstOffer">
                              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#e8c969]">
                                {t("premium.firstOffer", "First reading")}
                              </div>
                            </HelpBubble>
                          )}
                          <div className="leading-none">
                            <span className="font-serif text-xl font-bold text-foreground">
                              ${price.toFixed(2)}
                            </span>
                            {showFirst && (
                              <span className="ml-1.5 text-sm text-muted-foreground line-through">
                                ${pack.priceUsd.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => handleBuyPack(pack.id)}
                        disabled={checkoutLoading !== null}
                        className={`mt-3 ${
                          pack.popular
                            ? "bg-[#e8c969] text-[#1a1606] shadow-[0_0_15px_rgba(232,201,105,0.5)] hover:bg-[#f2dd9a]"
                            : "bg-[#e8c969]/15 text-[#e8c969] border border-[#e8c969]/40 hover:bg-[#e8c969]/25"
                        }`}
                      >
                        {checkoutLoading === pack.id
                          ? t("premium.redirecting", "Redirecting...")
                          : t("premium.buy", "Get it")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) setShowDeleteDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("profile.detail.archiveConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("profile.detail.archiveConfirmMessage", {
                name: profile.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("profile.detail.deleteConfirmCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
            >
              {t("profile.detail.archiveConfirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
