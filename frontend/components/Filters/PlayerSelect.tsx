"use client";

import { useState, useRef, useEffect } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { cn } from "@/lib/format";

export function PlayerSelect() {
  const { players, selectedPlayer, setPlayer } = usePlayerStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = players.filter(
    (p) =>
      p.player_name.toLowerCase().includes(query.toLowerCase()) ||
      p.team.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full text-left px-3 py-2.5 rounded border border-border bg-surface-2",
          "hover:border-accent/40 transition-colors text-sm",
          open && "border-accent/60",
        )}
      >
        {selectedPlayer ? (
          <span className="flex items-center justify-between">
            <span className="font-medium text-text">
              {selectedPlayer.player_name}
            </span>
            <span className="text-xs text-muted font-mono">
              {selectedPlayer.team} · {selectedPlayer.total_shots} shots
            </span>
          </span>
        ) : (
          <span className="text-muted">Select a player...</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface-2 border border-border rounded shadow-xl max-h-72 overflow-hidden flex flex-col">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players..."
            className="px-3 py-2 text-sm bg-transparent border-b border-border text-text placeholder:text-dim outline-none"
            autoFocus
          />
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-dim text-center">
                No players found
              </div>
            ) : (
              filtered
                .sort((a, b) => b.total_shots - a.total_shots)
                .map((p) => (
                  <button
                    key={p.player_id}
                    onClick={() => {
                      setPlayer(p);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-accent/10 transition-colors flex items-center justify-between",
                      selectedPlayer?.player_id === p.player_id &&
                        "bg-accent/5 text-accent",
                    )}
                  >
                    <span>{p.player_name}</span>
                    <span className="text-[11px] text-dim font-mono">
                      {p.team} · {p.total_shots}
                    </span>
                  </button>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
