import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown, Clock } from "lucide-react";
import { ZODIAC_GLYPHS } from "@astroweb/chart-core";
import { HelpBubble } from "@/components/HelpBubble";
import { signLabel } from "@/lib/signs";
import { elementHelpKey, planetHelpKey, signHelpKey } from "@/lib/helpKeys";
import { buildBigThree, type BigThreeId, type BigThreeItem } from "./bigThreeModel";
import { ELEMENT_COLORS, hexToRgba } from "./utils/elementColors";
import type { ChartResult } from "@/types";

const NEUTRAL = "#8fb6ff";

/** Seconds of one turn of the orbit around each glyph: three different speeds keep the strip from looking mechanical. */
const ORBIT_SECONDS: Record<BigThreeId, number> = { sun: 22, moon: 14, rising: 34 };

function colourOf(item: BigThreeItem): string {
  return item.element ? ELEMENT_COLORS[item.element].stroke : NEUTRAL;
}

/** The glyph inside a thin dashed ring with one small dot travelling around it. */
function GlyphOrbit({ item, colour, selected }: { item: BigThreeItem; colour: string; selected: boolean }) {
  const unknown = item.sign === null;
  return (
    <div className="relative mx-auto h-10 w-10" aria-hidden="true">
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full">
        <circle
          cx="20"
          cy="20"
          r="18"
          fill={hexToRgba(colour, selected ? 0.14 : 0.06)}
          stroke={hexToRgba(colour, selected ? 0.75 : 0.4)}
          strokeWidth="1.2"
          strokeDasharray={unknown ? "2 4" : undefined}
        />
      </svg>
      {!unknown && (
        <div className="bt-orbit absolute inset-0" style={{ ["--bt-orbit-s" as string]: `${ORBIT_SECONDS[item.id]}s` }}>
          <span
            className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: colour, boxShadow: `0 0 8px ${colour}` }}
          />
        </div>
      )}
      <div
        className="absolute inset-0 flex items-center justify-center font-serif text-xl"
        style={{ color: unknown ? hexToRgba(NEUTRAL, 0.7) : colour }}
      >
        {unknown ? "?" : item.glyph}
      </div>
    </div>
  );
}

interface BigThreeProps {
  chart: ChartResult;
  /** Opens the Interpretation tab, where the full reading of each sign is. */
  onOpenReading: () => void;
  /** Where the birth time is entered; offered when the Rising sign cannot be worked out. */
  editHref: string;
  /** Start with the details open (the page starts closed to stay compact). */
  defaultExpanded?: boolean;
}

/**
 * The Sun, Moon and Rising signs as three compact cards with a one-line explanation of the picked one. "Details"
 * opens its element, modality, house and the sign's own reading. Without a birth time the Rising card says why the
 * time is needed. The orbit and the glow are CSS and stop with the system "reduce motion" setting.
 */
export function BigThree({ chart, onOpenReading, editHref, defaultExpanded = false }: BigThreeProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const items = buildBigThree(chart);
  const [selectedId, setSelectedId] = useState<BigThreeId>("sun");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const selected = items.find((i) => i.id === selectedId) ?? items[0];
  const colour = colourOf(selected);
  const readingText = selected.textKey ? t(`${selected.textKey}.text`, "") : "";

  return (
    <section className="ds-card rounded-xl px-4 py-3" aria-labelledby="big-three-title">
      <HelpBubble helpKey="terms.bigThree">
        <h3 id="big-three-title" className="font-serif text-lg text-[#8fb6ff]">
          {t("profile.detail.bigThree", "The Big Three")}
        </h3>
      </HelpBubble>

      <div className="mt-2.5 grid grid-cols-3 gap-2" role="group" aria-label={t("bigThree.pick")}>
        {items.map((item, index) => {
          const c = colourOf(item);
          const active = item.id === selectedId;
          return (
            <motion.button
              key={item.id}
              type="button"
              aria-pressed={active}
              aria-controls="big-three-detail"
              onClick={() => setSelectedId(item.id)}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.08 * index, ease: "easeOut" }}
              className={`min-w-0 rounded-2xl border px-1.5 py-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
                active ? "bt-glow" : "hover:brightness-125"
              }`}
              style={{
                ["--bt-c" as string]: hexToRgba(c, 0.55),
                outlineColor: c,
                borderColor: hexToRgba(c, active ? 0.8 : 0.28),
                background: `linear-gradient(160deg, ${hexToRgba(c, active ? 0.2 : 0.07)}, ${hexToRgba(c, 0.02)})`,
              }}
            >
              <GlyphOrbit item={item} colour={c} selected={active} />
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t(`bigThree.role.${item.id}.label`)}
              </div>
              {item.sign ? (
                <div className="flex items-center justify-center gap-1 font-serif text-sm text-[var(--ink)]">
                  <span style={{ color: c }}>{ZODIAC_GLYPHS[item.sign]}</span>
                  <span className="truncate">{signLabel(t, item.sign)}</span>
                </div>
              ) : (
                <div className="font-serif text-sm text-muted-foreground">{t("bigThree.rising.unknownShort")}</div>
              )}
            </motion.button>
          );
        })}
      </div>

      <div id="big-three-detail" aria-live="polite" className="mt-2.5 min-h-[2.75rem]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected.id}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
            className="rounded-xl border-l-2 px-3 py-2"
            style={{ borderColor: hexToRgba(colour, 0.7), background: hexToRgba(colour, 0.05) }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-xs leading-snug">
                <HelpBubble helpKey={planetHelpKey(selected.body)}>
                  <span className="font-serif text-sm" style={{ color: colour }}>
                    {t(`bigThree.role.${selected.id}.title`)}
                  </span>
                </HelpBubble>{" "}
                <span className="text-muted-foreground">— {t(`bigThree.role.${selected.id}.about`)}</span>
              </p>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls="big-three-more"
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex flex-none items-center gap-0.5 whitespace-nowrap text-xs hover:underline"
                style={{ color: colour }}
              >
                {expanded ? t("bigThree.less") : t("bigThree.more")}
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            </div>

            <div id="big-three-more">
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    key="more"
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    {selected.sign && selected.element && selected.modality ? (
                      <>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          <HelpBubble helpKey={signHelpKey(selected.sign)}>
                            <Chip colour={colour}>
                              {ZODIAC_GLYPHS[selected.sign]} {signLabel(t, selected.sign)} {selected.degree}
                            </Chip>
                          </HelpBubble>
                          <HelpBubble helpKey={elementHelpKey(selected.element)}>
                            <Chip colour={colour}>{t(`interpretation.overview.elements.${selected.element}`)}</Chip>
                          </HelpBubble>
                          <Chip colour={colour}>{t(`natalChart.summary.modalities.${selected.modality}`)}</Chip>
                          {selected.house !== null && <Chip colour={colour}>{t("bigThree.house", { n: selected.house })}</Chip>}
                        </div>
                        {readingText && (
                          <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-[var(--ink)]/85">{readingText}</p>
                        )}
                        <button
                          type="button"
                          onClick={onOpenReading}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs hover:underline"
                          style={{ color: colour }}
                        >
                          {t("bigThree.fullReading")}
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--ink)]/85">{t("bigThree.rising.unknownText")}</p>
                        <Link
                          to={editHref}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs hover:underline"
                          style={{ color: NEUTRAL }}
                        >
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {t("bigThree.rising.addTime")}
                        </Link>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function Chip({ colour, children }: { colour: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5"
      style={{ borderColor: hexToRgba(colour, 0.35), background: hexToRgba(colour, 0.08), color: "var(--ink)" }}
    >
      {children}
    </span>
  );
}
