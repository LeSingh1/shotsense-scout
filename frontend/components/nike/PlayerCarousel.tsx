"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";
import { FEATURED, headshotUrl, type FeaturedPlayer } from "@/lib/featured";

type Props = {
  selected: FeaturedPlayer;
  onSelect: (p: FeaturedPlayer) => void;
};

/**
 * Premium horizontal carousel — Nike product-launch energy.
 *
 * The strip is draggable (touch + mouse) with momentum, snaps to the nearest
 * card on release, scales up the centered card, and slides a glow trail
 * underneath. The selected card lifts ~24px and recolors to the team primary.
 *
 * Layout is centered: card 0 sits in the middle, others fan out left and right.
 * We achieve this with `xOffset` on the inner row driven by `selectedIndex`.
 */
const CARD_W = 132;
const CARD_GAP = 18;
const CARD_PITCH = CARD_W + CARD_GAP;

export function PlayerCarousel({ selected, onSelect }: Props) {
  const idx = FEATURED.findIndex((p) => p.id === selected.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  // Track container width so we can center the active card precisely.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // The strip's x offset that keeps the selected card centered.
  const centerOffset = containerW / 2 - CARD_W / 2 - idx * CARD_PITCH;

  // Dragging — when the user drags, project onto card pitch and pick nearest.
  const dragX = useMotionValue(0);

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const totalShift = info.offset.x + info.velocity.x * 0.2;
    const cardsMoved = Math.round(-totalShift / CARD_PITCH);
    const next = Math.max(0, Math.min(FEATURED.length - 1, idx + cardsMoved));
    if (next !== idx) onSelect(FEATURED[next]);
    dragX.set(0);
  };

  return (
    <div className="relative w-full">
      {/* Section label + controls */}
      <div className="flex items-center justify-between mb-4 px-1">
        <span className="text-[11px] uppercase tracking-[0.22em] text-white/40">
          Roster · {idx + 1} / {FEATURED.length}
        </span>
        <div className="flex gap-2">
          <CarouselButton
            label="Previous player"
            onClick={() => onSelect(FEATURED[Math.max(0, idx - 1)])}
            disabled={idx === 0}
          >
            ‹
          </CarouselButton>
          <CarouselButton
            label="Next player"
            onClick={() => onSelect(FEATURED[Math.min(FEATURED.length - 1, idx + 1)])}
            disabled={idx === FEATURED.length - 1}
          >
            ›
          </CarouselButton>
        </div>
      </div>

      {/* Carousel viewport */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden h-[230px]"
        style={{
          maskImage: "linear-gradient(90deg, transparent 0, black 12%, black 88%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0, black 12%, black 88%, transparent 100%)",
        }}
      >
        {/* Animated glow trail behind the selected card */}
        <motion.div
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 w-[180px] h-[180px] rounded-full pointer-events-none"
          animate={{ left: `calc(50% - 90px)` }}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--nike-accent) 55%, transparent) 0%, transparent 70%)",
            filter: "blur(14px)",
          }}
        />

        {/* Draggable strip */}
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={handleDragEnd}
          style={{ x: dragX }}
          className="flex h-full items-center cursor-grab active:cursor-grabbing select-none"
        >
          <motion.div
            className="flex h-full items-center"
            style={{ gap: `${CARD_GAP}px` }}
            animate={{ x: centerOffset }}
            transition={{ type: "spring", stiffness: 90, damping: 18, mass: 0.9 }}
          >
            {FEATURED.map((p, i) => (
              <Card
                key={p.id}
                player={p}
                active={i === idx}
                distance={i - idx}
                onClick={() => onSelect(p)}
              />
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 mt-4">
        {FEATURED.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            aria-label={`Go to ${p.firstName} ${p.lastName}`}
            className="h-1 rounded-full transition-all"
            style={{
              width: i === idx ? 28 : 10,
              background: i === idx ? "var(--nike-accent)" : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CarouselButton({
  children, label, onClick, disabled,
}: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.08 }}
      whileTap={{ scale: disabled ? 1 : 0.93 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-9 h-9 rounded-full border border-white/20 text-white/80 grid place-items-center disabled:opacity-30 hover:border-white hover:text-white transition"
    >
      {children}
    </motion.button>
  );
}

function Card({
  player, active, distance, onClick,
}: { player: FeaturedPlayer; active: boolean; distance: number; onClick: () => void }) {
  const dist = Math.abs(distance);
  // Hovered tilt parallax
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useTransform(y, [-30, 30], [10, -10]);
  const ry = useTransform(x, [-30, 30], [-10, 10]);

  const handleMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!active) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - r.left - r.width / 2);
    y.set(e.clientY - r.top - r.height / 2);
  };
  const handleLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      animate={{
        scale: active ? 1.0 : Math.max(0.65, 0.92 - dist * 0.06),
        y: active ? -10 : 0,
        opacity: active ? 1 : Math.max(0.3, 0.85 - dist * 0.12),
      }}
      transition={{ type: "spring", stiffness: 110, damping: 18 }}
      style={{
        width: CARD_W,
        height: 200,
        perspective: 800,
      }}
      className="relative shrink-0 rounded-2xl overflow-hidden ring-1 ring-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02]"
    >
      <motion.div
        className="relative w-full h-full"
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
      >
        {/* Team color wash */}
        <div
          aria-hidden
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: `linear-gradient(180deg, ${player.primary}40 0%, transparent 60%, ${player.secondary}30 100%)`,
            opacity: active ? 1 : 0.4,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={headshotUrl(player.id)}
          alt={`${player.firstName} ${player.lastName}`}
          width={CARD_W}
          height={160}
          loading="eager"
          className="absolute top-3 left-1/2 -translate-x-1/2 w-[118px] h-auto select-none"
          style={{
            mixBlendMode: "lighten",
            filter: active ? "drop-shadow(0 12px 18px rgba(0,0,0,0.6))" : "none",
          }}
        />
        {/* Footer label */}
        <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 backdrop-blur-sm bg-black/40">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">{player.team}</div>
          <div className="text-[11px] font-bold leading-tight text-white">
            {player.firstName.charAt(0)}. {player.lastName}
          </div>
        </div>

        {/* Active indicator stripe */}
        {active && (
          <motion.div
            layoutId="activeStripe"
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: player.primary }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
          />
        )}
      </motion.div>
    </motion.button>
  );
}

// Used by the hero for kinetic name reveal — letter-by-letter slide-up.
export function KineticName({ first, last }: { first: string; last: string }) {
  return (
    <h1
      className="font-bold leading-[0.92] tracking-tight relative overflow-hidden"
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "clamp(38px, 5.2vw, 70px)",
      }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={`${first}-${last}`}
          className="block"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="block text-white">{first}</span>
          <span
            className="block"
            style={{
              color: "var(--nike-accent)",
              transition: "color 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {last}
          </span>
        </motion.span>
      </AnimatePresence>
    </h1>
  );
}
