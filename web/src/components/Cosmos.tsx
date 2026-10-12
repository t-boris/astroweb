import { useMemo, type CSSProperties } from "react";

// Deterministic pseudo-random so layouts are stable across renders.
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const ZODIAC = ["♈︎","♉︎","♊︎","♋︎","♌︎","♍︎","♎︎","♏︎","♐︎","♑︎","♒︎","♓︎"];

export function StarField({ count = 150, color = "#bcd4ff", seed = 7, maxSize = 2.6, opacity = 1 }: {
  count?: number; color?: string; seed?: number; maxSize?: number; opacity?: number;
}) {
  const stars = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, (_, i) => {
      const big = r() > 0.86;
      return {
        id: i, left: r() * 100, top: r() * 100,
        size: big ? maxSize : maxSize * (0.4 + r() * 0.4),
        delay: r() * 6, dur: 3 + r() * 4, op: 0.25 + r() * 0.6,
      };
    });
  }, [count, seed, maxSize]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity }}>
      {stars.map((s) => (
        <span key={s.id} className="ax-star" style={{
          left: s.left + "%", top: s.top + "%", width: s.size, height: s.size,
          background: color, boxShadow: `0 0 ${s.size * 2.5}px ${color}`,
          opacity: s.op, animation: `ax-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

export function Constellation({ top, left, right, bottom, width = 200, rotate = 0, color = "rgba(160,190,250,0.5)", points }: {
  top?: string; left?: string; right?: string; bottom?: string; width?: number; rotate?: number;
  color?: string; points?: number[][];
}) {
  const pts = points || [[8,38],[26,60],[46,34],[58,64],[80,46],[92,70]];
  const path = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  return (
    <svg viewBox="0 0 100 80" width={width} height={width * 0.8}
      style={{ position: "absolute", top, left, right, bottom, transform: `rotate(${rotate}deg)`,
        pointerEvents: "none", animation: "ax-constellation 7s ease-in-out infinite", overflow: "visible" }}>
      <path d={path} fill="none" stroke={color} strokeWidth="0.5" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i % 2 ? 1 : 1.5} fill="#dfeaff"
          style={{ filter: "drop-shadow(0 0 3px rgba(150,190,255,0.9))" }} />
      ))}
    </svg>
  );
}

export function Meteors({ color = "#cfe0ff", count = 4 }: { color?: string; count?: number }) {
  const list = useMemo(() => {
    const r = rng(99);
    return Array.from({ length: count }, () => {
      const fromRight = r() > 0.5;
      const ang = fromRight ? 146 + r() * 8 : 30 + r() * 8;
      const dist = 440 + r() * 280;
      const a = (ang * Math.PI) / 180;
      return {
        top: r() * 55 + "%", left: 8 + r() * 84 + "%", w: 120 + r() * 130,
        mx: Math.round(Math.cos(a) * dist), my: Math.round(Math.sin(a) * dist),
        ang, dur: 16 + r() * 12, delay: r() * 22,
      };
    });
  }, [count]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {list.map((m, i) => (
        <span key={i} className="ax-meteor" style={{
          top: m.top, left: m.left, width: m.w,
          background: `linear-gradient(90deg, ${color}00 0%, ${color}f2 88%, #ffffff 100%)`,
          "--mx": m.mx + "px", "--my": m.my + "px", "--ang": m.ang + "deg",
          animationDuration: m.dur + "s", animationDelay: m.delay + "s",
        } as CSSProperties} />
      ))}
    </div>
  );
}

export function Mandala({ stroke = "#6f9af0", glyphColor = "#a9c6ff", baseOpacity = 0.28, glyphSize = 22 }: {
  stroke?: string; glyphColor?: string; baseOpacity?: number; glyphSize?: number;
}) {
  const ticks = Array.from({ length: 36 });
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", inset: "22%", borderRadius: "50%",
        background: `radial-gradient(circle, ${stroke}22 0%, transparent 70%)`,
        animation: "ax-glow-pulse 8s ease-in-out infinite" }} />
      <svg viewBox="0 0 500 500" style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
        color: stroke, opacity: baseOpacity, animation: "ax-spin-rev 120s linear infinite" }}>
        <circle cx="250" cy="250" r="242" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 10" />
        <circle cx="250" cy="250" r="230" fill="none" stroke="currentColor" strokeWidth="0.7" />
        {ticks.map((_, i) => (
          <line key={i} x1="250" y1="14" x2="250" y2={i % 3 === 0 ? 30 : 22}
            stroke="currentColor" strokeWidth="0.8" transform={`rotate(${i * 10} 250 250)`} />
        ))}
      </svg>
      <svg viewBox="0 0 500 500" style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
        color: stroke, opacity: baseOpacity * 0.85, animation: "ax-spin 150s linear infinite" }}>
        <circle cx="250" cy="250" r="178" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <circle cx="250" cy="250" r="158" fill="none" stroke="currentColor" strokeWidth="0.7" strokeDasharray="3 6" />
        <polygon points="250,82 304,168 404,168 322,228 352,326 250,268 148,326 178,228 96,168 196,168"
          fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.6" />
        <polygon points="250,418 196,332 96,332 178,272 148,174 250,232 352,174 322,272 404,332 304,332"
          fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.4" />
      </svg>
      <svg viewBox="0 0 500 500" style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
        color: stroke, opacity: baseOpacity * 1.1 }}>
        <circle cx="250" cy="250" r="92" fill="none" stroke="currentColor" strokeWidth="0.8" />
        <circle cx="250" cy="250" r="70" fill="none" stroke="currentColor" strokeWidth="0.6" />
        <circle cx="250" cy="250" r="4" fill="currentColor" />
        <line x1="158" y1="250" x2="342" y2="250" stroke="currentColor" strokeWidth="0.5" />
        <line x1="250" y1="158" x2="250" y2="342" stroke="currentColor" strokeWidth="0.5" />
      </svg>
      <div style={{ position: "absolute", inset: 0, animation: "ax-spin-rev 150s linear infinite" }}>
        {ZODIAC.map((g, i) => (
          <div key={i} style={{ position: "absolute", inset: 0, transform: `rotate(${i * 30}deg)` }}>
            <span style={{ position: "absolute", top: "5%", left: "50%",
              transform: `translateX(-50%) rotate(${-i * 30}deg)`,
              fontSize: glyphSize, color: glyphColor, opacity: 0.55, fontFamily: "serif" }}>{g}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Fixed full-screen ambient backdrop used app-wide. */
export default function Cosmos() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <StarField count={150} color="#bcd4ff" seed={7} opacity={0.95} />
      <Constellation top="12%" left="6%" width={230} rotate={-6} />
      <Constellation top="20%" right="7%" width={190} rotate={9}
        points={[[10,20],[30,40],[40,68],[64,52],[88,30]]} />
      <Constellation bottom="22%" left="9%" width={200} rotate={4}
        points={[[6,30],[28,18],[40,46],[66,38],[82,66]]} />
      <Constellation bottom="14%" right="10%" width={170} rotate={-8}
        points={[[8,40],[26,60],[46,34],[58,64],[80,46]]} />
      <Meteors color="#cfe0ff" count={4} />
    </div>
  );
}
