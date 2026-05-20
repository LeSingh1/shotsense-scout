"use client";

import { usePlayerStore } from "@/stores/playerStore";
import { usePatternStore } from "@/stores/patternStore";
import { formatPct } from "@/lib/format";

export function ReportCard() {
  const { selectedPlayer } = usePlayerStore();
  const { patterns } = usePatternStore();

  if (!selectedPlayer) {
    return (
      <div className="flex items-center justify-center h-full text-dim text-xs">
        Select a player to view their scouting report.
      </div>
    );
  }

  const topPattern = patterns.length > 0
    ? [...patterns].sort((a, b) => b.severity - a.severity)[0]
    : null;

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-[10px] text-dim font-mono uppercase tracking-widest mb-2">
          Scout Report
        </div>
        <h3 className="text-sm font-semibold text-text">
          {selectedPlayer.player_name}
        </h3>
        <div className="flex gap-4 mt-1.5 text-xs text-muted font-mono">
          <span>FG% {formatPct(selectedPlayer.overall_fg_pct)}</span>
          <span>xFG% {formatPct(selectedPlayer.overall_xfg)}</span>
          <span>{selectedPlayer.total_shots} shots</span>
        </div>
      </div>

      {topPattern && (
        <div className="p-3 rounded border border-border bg-surface-2">
          <div className="text-[10px] text-dim font-mono uppercase tracking-wider mb-1">
            Top Pattern
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {topPattern.summary}
          </p>
        </div>
      )}

      <div className="p-3 rounded border border-border/50 bg-surface-2/50">
        <p className="text-xs text-dim leading-relaxed">
          Connect an Anthropic API key to generate AI-powered scout reports.
        </p>
      </div>
    </div>
  );
}
