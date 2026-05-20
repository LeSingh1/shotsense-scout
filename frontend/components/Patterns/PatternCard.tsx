"use client";

import { usePatternStore } from "@/stores/patternStore";
import { cn } from "@/lib/format";
import type { Pattern } from "@/lib/types";

const TYPE_LABELS: Record<string, string> = {
  efficiency_drop: "Efficiency Drop",
  cold_zone: "Cold Zone",
  hot_zone: "Hot Zone",
  shot_selection_shift: "Shot Selection Shift",
  clutch_performance: "Clutch Performance",
  consistency: "Consistency",
};

type Props = { pattern: Pattern };

export function PatternCard({ pattern }: Props) {
  const { selectedPattern, setSelectedPattern } = usePatternStore();
  const isSelected =
    selectedPattern?.player_id === pattern.player_id &&
    selectedPattern?.pattern_type === pattern.pattern_type &&
    selectedPattern?.zone === pattern.zone;

  const isNegative = pattern.direction === "negative";

  return (
    <button
      onClick={() => setSelectedPattern(isSelected ? null : pattern)}
      className={cn(
        "w-full text-left p-3 rounded border transition-all",
        isSelected
          ? "border-accent bg-accent/5"
          : "border-border hover:border-border hover:bg-surface-2/50",
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={cn(
            "text-[10px] font-mono uppercase tracking-wider font-medium",
            isNegative ? "text-navy-light" : "text-accent",
          )}
        >
          {TYPE_LABELS[pattern.pattern_type] ?? pattern.pattern_type}
        </span>
        {pattern.zone && (
          <span className="text-[10px] text-dim font-mono">
            {pattern.zone.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Severity bar */}
      <div className="h-1 rounded-full bg-border mb-2 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isNegative ? "bg-navy-light" : "bg-accent",
          )}
          style={{ width: `${Math.min(pattern.severity * 100, 100)}%` }}
        />
      </div>

      <p className="text-xs text-muted leading-relaxed line-clamp-2">
        {pattern.summary}
      </p>
    </button>
  );
}
