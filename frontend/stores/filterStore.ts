"use client";

import { create } from "zustand";
import type { ShotFilter } from "@/lib/types";

type FilterStore = ShotFilter & {
  setFilter: (filter: Partial<ShotFilter>) => void;
  resetFilters: () => void;
};

const defaults: ShotFilter = {
  shotType: "all",
  quarters: [1, 2, 3, 4],
  gameRange: [0, 100],
};

export const useFilterStore = create<FilterStore>((set) => ({
  ...defaults,
  setFilter: (filter) => set((state) => ({ ...state, ...filter })),
  resetFilters: () => set(defaults),
}));
