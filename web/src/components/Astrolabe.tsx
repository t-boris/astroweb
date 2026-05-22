import { motion } from "framer-motion";

export function Astrolabe({ className = "" }: { className?: string }) {
  // We create a mystical multi-layered SVG astrolabe/zodiac wheel
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.5, ease: "easeOut" }}
      className={className}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Outer Glow */}
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl" />

        {/* Outer Ring (Slow Reverse Spin) */}
        <svg
          viewBox="0 0 500 500"
          className="absolute inset-0 h-full w-full animate-spin-reverse-slow text-primary/30 pointer-events-none"
        >
          <circle cx="250" cy="250" r="240" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="10 15" />
          <circle cx="250" cy="250" r="230" fill="none" stroke="currentColor" strokeWidth="1" />
          {/* Zodiac markers simulation */}
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={i}
              x1="250"
              y1="10"
              x2="250"
              y2="30"
              stroke="currentColor"
              strokeWidth="2"
              transform={`rotate(${i * 30} 250 250)`}
            />
          ))}
        </svg>

        {/* Middle Ring (Slow Spin) */}
        <svg
          viewBox="0 0 500 500"
          className="absolute inset-0 h-full w-full animate-spin-slow text-primary/40 pointer-events-none"
        >
          <circle cx="250" cy="250" r="180" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx="250" cy="250" r="160" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 5" />
          {/* Sacred Geometry Star */}
          <polygon
            points="250,70 300,160 400,160 320,220 350,320 250,260 150,320 180,220 100,160 200,160"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.5"
          />
          <polygon
            points="250,430 200,340 100,340 180,280 150,180 250,240 350,180 320,280 400,340 300,340"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.3"
          />
        </svg>

        {/* Inner Core (Static or Pulse) */}
        <svg viewBox="0 0 500 500" className="absolute inset-0 h-full w-full text-primary/50 pointer-events-none">
          <circle cx="250" cy="250" r="80" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="250" cy="250" r="60" fill="none" stroke="currentColor" strokeWidth="1" />
          {/* Center dot */}
          <circle cx="250" cy="250" r="5" fill="currentColor" />
          {/* Cross */}
          <line x1="170" y1="250" x2="330" y2="250" stroke="currentColor" strokeWidth="1" />
          <line x1="250" y1="170" x2="250" y2="330" stroke="currentColor" strokeWidth="1" />
        </svg>

        {/* Zodiac Glyphs Ring */}
        <div className="absolute inset-0 h-full w-full animate-spin-slow pointer-events-none">
          {["♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓"].map((glyph, i) => {
            const angle = (i * 30 - 90) * (Math.PI / 180);
            const radius = 205; // Placed between outer and middle rings
            return (
              <span
                key={i}
                className="absolute text-2xl text-primary/60 font-serif"
                style={{
                  left: `calc(50% + ${radius * Math.cos(angle)}px)`,
                  top: `calc(50% + ${radius * Math.sin(angle)}px)`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {glyph}
              </span>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
