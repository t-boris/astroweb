import { useContext, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { HelpFocusScopeContext } from "@/lib/helpFocusScope";
import { useCoarsePointer } from "@/lib/helpPointer";
import { lastInputWasKeyboard, trackInputModality } from "@/lib/inputModality";
import {
  HELP_CLOSE_DELAY_MS,
  HELP_OPEN_DELAY_MS,
  helpReducer,
  helpRole,
  isHoverPointer,
  opensOnFocus,
  opensOnTap,
  takesFocus,
  type HelpState,
} from "@/lib/helpBubble";

export interface HelpBubbleProps {
  /** Key under `help.` in the translation files, e.g. "tabs.chart" (see lib/helpKeys.ts). */
  helpKey: string;
  /** The element the help describes. Exactly one element: it is the hover, focus and tap target. */
  children: ReactElement;
  /**
   * True when tapping the element already does something (tab, filter, button).
   * Touch devices then get a small "?" button next to it, so help never hijacks the tap (DEC-002).
   * Pointer devices render nothing extra: the DOM stays the element alone.
   */
  actionable?: boolean;
  /** Name of the described thing; labels the "?" button and the bubble for screen readers. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  /**
   * Classes for the touch-only wrapper that holds an actionable element and its "?" button (it is an inline flex box).
   * Wide controls pass `flex` so the "?" sits beside them instead of shrinking them.
   */
  wrapperClassName?: string;
  /**
   * False renders the element untouched. Words that repeat on every card or row get their bubble on the first
   * one only, so a list of identical labels does not turn into a list of identical bubbles.
   */
  enabled?: boolean;
  /**
   * Touch only. Draws the "?" as a small badge on the corner of the element instead of a button beside it, for tight
   * places (the page header) where a button beside it would not fit. The hit area is still 24px.
   */
  badge?: boolean;
}

/**
 * The one help component of the app (REQ-005). It wraps the element it describes:
 * - mouse: opens after a short hover, closes when the pointer leaves;
 * - keyboard: opens on focus, closes on blur or Escape;
 * - touch: a tap on a non-actionable element opens it; an actionable element gets a
 *   "?" button instead; a tap outside closes it.
 * The text is static and generic (DEC-004), always on (DEC-005) and never tracked (DEC-006).
 * A missing key renders the element untouched, so a gap in the texts can never break a screen.
 */
export function HelpBubble({ helpKey, children, actionable = false, label, side = "bottom", wrapperClassName, enabled = true, badge = false }: HelpBubbleProps) {
  const { t } = useTranslation();
  const coarse = useCoarsePointer();
  const text = t(`help.${helpKey}`, { defaultValue: "" });

  const [state, dispatch] = useReducer(helpReducer, null as HelpState);
  const open = state !== null;
  const contentId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openedBy = useRef<HelpState>(null);
  const lastPointer = useRef("mouse");
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state) openedBy.current = state;
  }, [state]);

  useEffect(() => trackInputModality(), []);

  // Only the first element of each help key in a scope is a tab stop (lib/helpFocusScope.ts).
  const focusScope = useContext(HelpFocusScopeContext);
  const [isTabStop, setIsTabStop] = useState(true);
  const tracksTabStop = Boolean(focusScope) && !actionable && enabled && text !== "";
  useLayoutEffect(
    () => (tracksTabStop && focusScope ? focusScope.claim(helpKey, setIsTabStop) : undefined),
    [tracksTabStop, focusScope, helpKey],
  );

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  if (!text || !enabled) return children;

  function startHover(pointerType: string) {
    lastPointer.current = pointerType;
    if (!isHoverPointer(pointerType)) return;
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => dispatch({ type: "hoverStart" }), HELP_OPEN_DELAY_MS);
  }

  function endHover(pointerType: string) {
    if (!isHoverPointer(pointerType)) return;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => dispatch({ type: "hoverEnd" }), HELP_CLOSE_DELAY_MS);
  }

  // Keys are left out, never set to undefined: Radix items (tabs) spread their props after their own
  // tabIndex, so an explicit `tabIndex: undefined` would remove their roving focus.
  const anchorProps = {
    ref: anchorRef,
    ...(open ? { "aria-describedby": contentId } : {}),
    ...(actionable
      ? {}
      : {
          ...(isTabStop ? { tabIndex: 0 } : {}),
          className: "cursor-help pointer-coarse:underline pointer-coarse:decoration-dotted pointer-coarse:underline-offset-4",
        }),
    onPointerEnter: (e: React.PointerEvent) => startHover(e.pointerType),
    onPointerLeave: (e: React.PointerEvent) => endHover(e.pointerType),
    onPointerDown: (e: React.PointerEvent) => {
      lastPointer.current = e.pointerType;
      if (isHoverPointer(e.pointerType)) {
        // Using the element ends the hover help (a click on a tab should not leave a bubble behind).
        window.clearTimeout(openTimer.current);
        dispatch({ type: "hoverEnd" });
      }
    },
    onClick: () => {
      if (opensOnTap(lastPointer.current, actionable)) dispatch({ type: "tap" });
    },
    onFocus: () => {
      if (opensOnFocus(lastInputWasKeyboard())) dispatch({ type: "focusVisible" });
    },
    onBlur: (e: React.FocusEvent) => {
      // Focus moving into the bubble itself (a tapped one) must not close it.
      if (contentRef.current?.contains(e.relatedTarget as Node | null)) return;
      dispatch({ type: "blur" });
    },
  };

  const bubble = (
    <Popover open={open} onOpenChange={(next) => !next && dispatch({ type: "dismiss" })}>
      <PopoverAnchor asChild {...anchorProps}>
        {children}
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        id={contentId}
        role={helpRole(state)}
        aria-label={helpRole(state) === "dialog" ? label ?? t("help.ui.title") : undefined}
        side={side}
        sideOffset={8}
        collisionPadding={12}
        className="w-auto max-w-[min(20rem,var(--radix-popover-content-available-width))] px-3.5 py-3 text-[13px] leading-relaxed"
        onOpenAutoFocus={(e) => {
          if (!takesFocus(state)) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          // Radix returns focus to a Trigger, which we do not use: give it back to the "?" button or the element.
          e.preventDefault();
          if (openedBy.current === "tap") (questionRef.current ?? anchorRef.current)?.focus({ preventScroll: true });
        }}
        onInteractOutside={(e) => {
          const target = e.target as Node | null;
          // The element and its "?" button handle their own taps; do not let "outside" fight them.
          if (target && (anchorRef.current?.contains(target) || questionRef.current?.contains(target))) e.preventDefault();
        }}
        onPointerEnter={() => window.clearTimeout(closeTimer.current)}
        onPointerLeave={(e) => endHover(e.pointerType)}
      >
        <p>{text}</p>
      </PopoverContent>
    </Popover>
  );

  // Pointer devices: the element alone. Touch devices: the element with a "?" button beside it.
  if (!actionable || !coarse) return bubble;

  return (
    <span className={cn(badge ? "relative inline-flex" : "inline-flex items-center gap-1", wrapperClassName)}>
      {bubble}
      <button
        ref={questionRef}
        type="button"
        aria-label={label ? t("help.ui.openFor", { term: label }) : t("help.ui.open")}
        aria-expanded={state === "tap"}
        onClick={() => dispatch({ type: "tap" })}
        className={cn(
          "inline-flex flex-none items-center justify-center rounded-full border border-border/60 font-semibold leading-none text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
          badge
            ? "absolute -right-1.5 -top-1.5 z-10 size-4 bg-background text-[9px] before:absolute before:-inset-1 before:content-['']"
            : "size-6 text-[11px]",
        )}
      >
        <span aria-hidden="true">?</span>
      </button>
    </span>
  );
}
