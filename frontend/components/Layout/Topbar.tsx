"use client";

export function Topbar() {
  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-border bg-surface shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs font-bold tracking-widest text-accent uppercase">
          ShotSense Scout
        </span>
        <span className="text-[10px] text-dim font-mono tracking-wide uppercase">
          AI Basketball Intelligence
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted font-mono">2025-26 Playoffs</span>
      </div>
    </header>
  );
}
