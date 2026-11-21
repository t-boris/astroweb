import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpBubble } from "@/components/HelpBubble";
import SignInNotice from "@/components/SignInNotice";
import { SubscriptionPill, SubscriptionSparkle } from "@/components/SubscriptionBadge";
import { SUBSCRIPTION_COLOURS } from "@/lib/subscriptionMark";
import {
  PANEL_DEFAULT,
  PANEL_MIN,
  clampPanelWidth,
  maxPanelWidth,
  readStoredPanelWidth,
  storePanelWidth,
  widthAfterKey,
} from "@/lib/panelWidth";
import type { Profile } from "@/types";

interface ProfilesMenuProps {
  profiles: Profile[];
  deviceId: string;
  onDelete: (id: string) => void;
  onUnarchive: (id: string) => void;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The width of the docked panel: remembered between visits, kept inside the window. */
function usePanelWidth() {
  const [stored, setStored] = useState(() => readStoredPanelWidth(storage()));
  // 1280 is the first docked width; it is only used where there is no window (the server-rendered tests).
  const [viewport, setViewport] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const width = clampPanelWidth(stored, viewport);
  const change = (next: number, remember: boolean) => {
    const clamped = clampPanelWidth(next, viewport);
    setStored(clamped);
    if (remember) storePanelWidth(storage(), clamped);
  };
  return { width, viewport, change };
}

/** A card's outline: a gold accent when the profile has a subscription. */
function cardStyle(profile: Profile) {
  if (!profile.subscription) return undefined;
  const colour = SUBSCRIPTION_COLOURS[profile.subscription.state];
  return { borderColor: `${colour}66`, background: `linear-gradient(135deg, ${colour}14, transparent 60%)` };
}

/**
 * Left-side profiles menu. Docked on wide screens (xl+) where its edge can be dragged to change the width
 * (or moved with the arrow keys; a double click restores the default), and an off-canvas drawer toggled by a
 * button on smaller screens — so it never covers the central hero artwork. The scroll bar is hidden; the list
 * still scrolls. A profile with a subscription carries a gold sparkle, an accent and a pill with the wording.
 */
export default function ProfilesMenu({ profiles, deviceId, onDelete, onUnarchive }: ProfilesMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { width, viewport, change } = usePanelWidth();
  const dragging = useRef(false);

  const active = profiles.filter((p) => !p.archived);
  const archived = profiles.filter((p) => p.archived);
  if (profiles.length === 0) return null;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone; the drag still follows the moves that arrive.
    }
    event.preventDefault();
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    // The panel starts at the left edge of the window, so the pointer position is the width.
    if (dragging.current) change(event.clientX, false);
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Nothing was captured.
    }
    change(event.clientX, true);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = widthAfterKey(event.key, width, event.shiftKey, viewport);
    if (next === null) return;
    event.preventDefault();
    change(next, true);
  }

  return (
    <>
      {/* Toggle (hidden on xl, where the sidebar is always shown) */}
      <div className="fixed left-3 top-20 z-50 flex items-center gap-1 xl:hidden">
        <HelpBubble helpKey="home.menu" actionable label={t("landing.profiles.title")}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={t("landing.profiles.title")}
            className="rounded-md border border-primary/30 bg-background/80 p-2 text-primary backdrop-blur-sm"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </HelpBubble>
      </div>

      {/* Backdrop on mobile when open */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 xl:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        style={{ ["--panel-w" as string]: `${width}px` }}
        className={`fixed left-0 top-14 z-40 flex h-[calc(100vh-3.5rem)] w-60 max-w-[85vw] flex-col border-r border-primary/15 bg-background/85 px-3 py-5 backdrop-blur-md transition-transform duration-300 xl:w-[var(--panel-w)] xl:max-w-none xl:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drag handle on the right edge (docked layout only) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("home.panelResize")}
          aria-valuenow={width}
          aria-valuemin={PANEL_MIN}
          aria-valuemax={maxPanelWidth(viewport)}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          onDoubleClick={() => change(PANEL_DEFAULT, true)}
          data-panel-handle
          className="group absolute -right-1.5 top-0 z-10 hidden h-full w-3 cursor-col-resize touch-none select-none xl:block"
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary group-active:bg-primary" />
        </div>

        <h2 className="mb-3 px-1 font-serif text-xs uppercase tracking-[0.15em] text-primary/70">
          {t("landing.profiles.title")}
        </h2>
        <SignInNotice deviceId={deviceId} profileCount={profiles.length} />
        <Button
          size="sm"
          className="mb-4 w-full border border-primary bg-primary/20 text-primary hover:bg-primary/30"
          asChild
        >
          <Link to="/profile/new" onClick={() => setOpen(false)}>
            {t("home.createProfile")}
          </Link>
        </Button>
        <div className="scrollbar-hidden flex flex-col gap-2 overflow-y-auto">
          {active.map((profile) => (
            <div key={profile.id} className="group relative">
              <Link
                to={`/profile/${profile.id}`}
                onClick={() => setOpen(false)}
                style={cardStyle(profile)}
                data-subscription-card={profile.subscription?.state}
                className="ds-card block p-2.5 pr-9 pointer-coarse:pr-16 transition-colors hover:border-primary/60"
              >
                <p className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate font-serif text-sm text-primary">{profile.name}</span>
                  {profile.subscription && <SubscriptionSparkle subscription={profile.subscription} />}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{profile.birthDate}</p>
                <p className="truncate text-[11px] text-muted-foreground">{profile.birthPlace}</p>
                {profile.subscription && <SubscriptionPill subscription={profile.subscription} />}
              </Link>
              <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                <HelpBubble helpKey="home.archive" actionable label={t("common.archive")}>
                  <button
                    type="button"
                    onClick={() => onDelete(profile.id)}
                    aria-label={t("common.archive")}
                    className="rounded-md border border-border/60 bg-background/60 p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </HelpBubble>
              </div>
            </div>
          ))}

          {archived.length > 0 && (
            <div className="mt-4 border-t border-primary/10 pt-3">
              <h3 className="mb-2 px-1 font-serif text-[11px] uppercase tracking-[0.15em] text-muted-foreground/70">
                {t("home.archivedSection")}
              </h3>
              {archived.map((profile) => (
                <div key={profile.id} className="group relative mb-2">
                  <Link
                    to={`/profile/${profile.id}`}
                    onClick={() => setOpen(false)}
                    className="ds-card block p-2.5 pr-9 pointer-coarse:pr-16 opacity-55 transition-opacity hover:opacity-100"
                  >
                    <p className="truncate font-serif text-sm text-muted-foreground">{profile.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground/70">{profile.birthDate}</p>
                  </Link>
                  <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                    <HelpBubble helpKey="home.restore" actionable label={t("common.unarchive")}>
                      <button
                        type="button"
                        onClick={() => onUnarchive(profile.id)}
                        aria-label={t("common.unarchive")}
                        className="rounded-md border border-border/60 bg-background/60 p-1.5 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      </button>
                    </HelpBubble>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
