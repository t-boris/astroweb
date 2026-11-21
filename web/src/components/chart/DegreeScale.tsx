import { useMemo } from "react";
import { CHART_LAYOUT, degreeScaleTicks, type ScaleTickKind } from "@astroweb/chart-core";

interface DegreeScaleProps {
  /** Longitude drawn on the left (9 o'clock) axis. */
  rotation: number;
  revealed: boolean;
}

const KIND_STYLE: Record<ScaleTickKind, { stroke: string; strokeWidth: number }> = {
  degree: { stroke: "rgba(255,255,255,0.3)", strokeWidth: 0.8 },
  five: { stroke: "rgba(255,255,255,0.55)", strokeWidth: 1.1 },
  ten: { stroke: "rgba(255,255,255,0.85)", strokeWidth: 1.6 },
};

const KINDS: ScaleTickKind[] = ["degree", "five", "ten"];

/**
 * The graduated ring between the sign band and the planet zone: a tick every degree, longer every
 * 5 and every 10 degrees. The 360 ticks are drawn as three paths, one per tick length.
 */
export default function DegreeScale({ rotation, revealed }: DegreeScaleProps) {
  const { cx, cy, signInner, zodiacInner } = CHART_LAYOUT;

  const paths = useMemo(() => {
    const ticks = degreeScaleTicks(rotation);
    return KINDS.map((kind) => ({
      kind,
      d: ticks
        .filter((tick) => tick.kind === kind)
        .map((tick) => `M${tick.from.x.toFixed(2)} ${tick.from.y.toFixed(2)}L${tick.to.x.toFixed(2)} ${tick.to.y.toFixed(2)}`)
        .join(""),
    }));
  }, [rotation]);

  return (
    <g
      data-layer="degree-scale"
      style={{
        animation: revealed ? "chart-fade-in 0.6s ease-out 0.4s forwards" : "none",
        opacity: revealed ? undefined : 0,
      }}
    >
      <circle cx={cx} cy={cy} r={signInner} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={zodiacInner} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
      {paths.map(({ kind, d }) => (
        <path
          key={kind}
          data-scale={kind}
          d={d}
          fill="none"
          stroke={KIND_STYLE[kind].stroke}
          strokeWidth={KIND_STYLE[kind].strokeWidth}
        />
      ))}
    </g>
  );
}
