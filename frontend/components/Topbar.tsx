"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";

const NAV_LINKS = [
  { id: "home", label: "Home" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "explorer", label: "Explorer" },
  { id: "court", label: "Court" },
  { id: "methodology", label: "Methodology" },
] as const;

type SectionId = (typeof NAV_LINKS)[number]["id"];

/**
 * Sticky topbar with IntersectionObserver-driven scroll-spy.
 *
 * Click-lock pattern (Issue 1C from /plan-eng-review):
 *   - Clicking a nav link locks the active state until the browser fires
 *     `scrollend` (Chrome 114+, Safari 18.2+, Firefox 109+).
 *   - On browsers without `scrollend`, fallback to `behavior: 'instant'` scroll
 *     so the observer fires once and settles immediately.
 *
 * Smart-hide: hides on scroll-down past 200px, slides back on scroll-up.
 * Disabled when `prefers-reduced-motion`.
 */
export function Topbar() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<SectionId>("home");
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lockedRef = useRef(false);
  const lastScrollY = useRef(0);

  // --- Scroll-spy ---------------------------------------------------------
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    NAV_LINKS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (lockedRef.current) return;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActive(id);
            }
          }
        },
        { rootMargin: "-40% 0% -55% 0%" },
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // --- Smart-hide on scroll-down ------------------------------------------
  useEffect(() => {
    if (reduce) return;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 200) {
        setHidden(false);
      } else if (y > lastScrollY.current + 4) {
        setHidden(true);
      } else if (y < lastScrollY.current - 4) {
        setHidden(false);
      }
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reduce]);

  // --- Anchor-click handler with scrollend-based click-lock ---------------
  const onAnchorClick = useCallback(
    (id: SectionId) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (!el) return;
      setActive(id);
      lockedRef.current = true;
      setMobileOpen(false);

      const supportsScrollend = "onscrollend" in window;
      if (supportsScrollend) {
        const release = () => {
          lockedRef.current = false;
          window.removeEventListener("scrollend", release);
        };
        window.addEventListener("scrollend", release, { once: true });
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      } else {
        // Fallback: instant scroll, then unlock one frame later so the
        // observer fires once and lands on the target.
        el.scrollIntoView({ behavior: "auto" });
        requestAnimationFrame(() => {
          lockedRef.current = false;
        });
      }
      history.replaceState(null, "", `#${id}`);
    },
    [reduce],
  );

  // --- Brand mark click → scroll to top -----------------------------------
  const onBrandClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setActive("home");
      lockedRef.current = true;
      setMobileOpen(false);
      const supportsScrollend = "onscrollend" in window;
      if (supportsScrollend) {
        const release = () => {
          lockedRef.current = false;
          window.removeEventListener("scrollend", release);
        };
        window.addEventListener("scrollend", release, { once: true });
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "auto" });
        requestAnimationFrame(() => {
          lockedRef.current = false;
        });
      }
      history.replaceState(null, "", "/");
    },
    [reduce],
  );

  // --- "/" focuses search; "?" too for symmetry with Linear ---------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" && e.key !== "?") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const search = document.getElementById("explorer-search");
      if (search) {
        e.preventDefault();
        search.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        (search as HTMLInputElement).focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reduce]);

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-bg/72 backdrop-blur-[20px] backdrop-saturate-[140%]"
      animate={{ y: hidden ? "-100%" : "0%" }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      role="banner"
    >
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-6 md:px-10">
        <button
          onClick={onBrandClick}
          className="num font-mono text-sm font-semibold text-text"
          aria-label="nba_shot_quality — back to home"
        >
          nba_shot_quality
        </button>

        <nav aria-label="Page sections" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {NAV_LINKS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={onAnchorClick(id)}
                  className={cn(
                    "num relative pb-1 font-mono text-xs uppercase tracking-[0.08em] transition-colors duration-200",
                    active === id ? "text-text" : "text-muted hover:text-text",
                  )}
                  aria-current={active === id ? "true" : undefined}
                >
                  {label}
                  {active === id && (
                    <motion.span
                      layoutId="topbar-underline"
                      className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-accent"
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2.5 font-mono text-xs uppercase tracking-[0.08em] text-muted md:flex">
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full bg-accent",
              !reduce && "animate-pulse-slow",
            )}
          />
          <span>Live · 2025-26 Playoffs</span>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
            className="text-text"
            aria-hidden
          >
            {mobileOpen ? (
              <>
                <line x1="5" y1="5" x2="17" y2="17" />
                <line x1="17" y1="5" x2="5" y2="17" />
              </>
            ) : (
              <>
                <line x1="3" y1="7" x2="19" y2="7" />
                <line x1="3" y1="15" x2="19" y2="15" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 top-14 z-40 flex flex-col gap-6 bg-bg/95 px-8 py-12 backdrop-blur-md md:hidden"
          role="dialog"
          aria-label="Site sections"
        >
          {NAV_LINKS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={onAnchorClick(id)}
              className={cn(
                "num font-mono text-2xl uppercase tracking-[0.04em]",
                active === id ? "text-accent" : "text-text",
              )}
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </motion.header>
  );
}
