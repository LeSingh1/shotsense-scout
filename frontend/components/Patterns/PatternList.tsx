"use client";

import { usePatternStore } from "@/stores/patternStore";
import { PatternCard } from "./PatternCard";

export function PatternList() {
  const { patterns } = usePatternStore();

  if (patterns.length === 0) {
    return (
      <div className="text-xs text-dim py-6 text-center">
        No patterns detected for this player.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {patterns
        .sort((a, b) => b.severity - a.severity)
        .map((pattern, i) => (
          <PatternCard key={`${pattern.player_id}-${pattern.pattern_type}-${i}`} pattern={pattern} />
        ))}
    </div>
  );
}
