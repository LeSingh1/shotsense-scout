"use client";

import Link from "next/link";

/**
 * The Nike-style top navigation bar. Logo pill left, nav center, search + icons right.
 * Decorative search field & icons mirror the Nike Impact 4 reference; the nav anchors
 * jump to in-page sections on the home route, with /watch as the only real route.
 */
export function NikeTopbar() {
  return (
    <header className="relative z-50 flex items-center justify-between px-8 py-5 text-white/90">
      <Link
        href="/#hero"
        className="rounded-full border border-white/20 px-4 py-1.5 text-xs uppercase tracking-[0.18em] font-semibold backdrop-blur-sm bg-white/[0.04]"
      >
        NBA xFG%
      </Link>

      <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium tracking-wide">
        <Link href="/#hero"             className="hover:text-white text-white/70">Home</Link>
        <Link href="/#where-they-shot"  className="hover:text-white text-white/70">Shot Map</Link>
        <Link href="/#every-shot"       className="hover:text-white text-white/70">Replay</Link>
        <Link href="/#watch-a-shot"     className="hover:text-white text-white/70">Watch a Shot</Link>
        <Link href="/#leaderboards"     className="hover:text-white text-white/70">Leaderboards</Link>
        <Link href="/#methodology"      className="hover:text-white text-white/70">Methodology</Link>
      </nav>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 bg-white/[0.04]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/60">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search players"
            className="bg-transparent text-xs placeholder:text-white/40 focus:outline-none w-32"
          />
        </div>
        <button aria-label="Info" className="w-8 h-8 rounded-full border border-white/15 grid place-items-center text-white/70 hover:text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
        </button>
        <button aria-label="Menu" className="w-8 h-8 rounded-full border border-white/15 grid place-items-center text-white/70 hover:text-white">
          <div className="grid grid-cols-2 gap-[3px]">
            <span className="w-1 h-1 bg-current rounded-full" />
            <span className="w-1 h-1 bg-current rounded-full" />
            <span className="w-1 h-1 bg-current rounded-full" />
            <span className="w-1 h-1 bg-current rounded-full" />
          </div>
        </button>
      </div>
    </header>
  );
}
