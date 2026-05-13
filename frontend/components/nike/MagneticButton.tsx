"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

/**
 * Magnetic CTA — the button (and its label) drift toward the cursor when
 * hovered, then snap back on leave. The label moves slightly less than the
 * pill itself to create a parallax pull, mimicking awwwards-grade interactions.
 */
export function MagneticButton({
  href,
  children,
  className,
  strength = 0.35,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.5 });

  // Label tracks at lower strength for parallax effect.
  const lx = useSpring(x, { stiffness: 240, damping: 22, mass: 0.4 });
  const ly = useSpring(y, { stiffness: 240, damping: 22, mass: 0.4 });

  const handleMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) * strength;
    const dy = (e.clientY - (r.top + r.height / 2)) * strength;
    x.set(dx);
    y.set(dy);
  };
  const handleLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.a
      ref={ref}
      href={href}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ x: sx, y: sy }}
      className={className}
    >
      <motion.span
        className="relative z-10 flex items-center justify-center gap-2 w-full h-full"
        style={{ x: lx, y: ly }}
      >
        {children}
      </motion.span>
    </motion.a>
  );
}
