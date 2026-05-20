"use client";

import { create } from "zustand";
import type { Pattern } from "@/lib/types";

type PatternStore = {
  patterns: Pattern[];
  selectedPattern: Pattern | null;
  setPatterns: (patterns: Pattern[]) => void;
  setSelectedPattern: (pattern: Pattern | null) => void;
};

export const usePatternStore = create<PatternStore>((set) => ({
  patterns: [],
  selectedPattern: null,
  setPatterns: (patterns) => set({ patterns, selectedPattern: null }),
  setSelectedPattern: (pattern) => set({ selectedPattern: pattern }),
}));
