"use client";

/**
 * Massive outlined "ghost" typography sitting behind the floating player.
 * Renders the player's last name in ~360px display type, transparent fill,
 * stroke colored to the accent at low opacity. Wide letter-spacing, all-caps.
 */
export function GhostText({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
    >
      <span
        className="font-[var(--font-display)] uppercase font-bold whitespace-nowrap"
        style={{
          fontSize: "clamp(140px, 22vw, 360px)",
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: "transparent",
          WebkitTextStroke: "1.5px color-mix(in srgb, var(--nike-accent, #FF2D6F) 35%, transparent)",
          transition: "all 600ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {text}
      </span>
    </div>
  );
}
