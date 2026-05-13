"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { RankingRow } from "@/lib/types";
import type { GameMeta, ShotRecord, ShotsByGame } from "@/lib/types/shots";
import { xfgForShot } from "@/lib/shotXfg";
import { FEATURED } from "@/lib/featured";
import { TrajectoryReplay } from "../court/TrajectoryReplay";
import gamesData from "@/lib/data/games.json";
import shotsByGameData from "@/lib/data/shots_by_game.json";

/**
 * "Every shot, every game" — Player → Game → Shot drill-down with an
 * animated trajectory replay in the right panel.
 *
 * Uses real per-game NBA shotchart data:
 *   - games.json: every playoff game with date, teams, score
 *   - shots_by_game.json: every shot in every game, with period & game clock
 *
 * For each player we filter to the games they actually shot in (so Maxey
 * shows his 11 first-round games, not 18 synthetic buckets). Dates and
 * shot timestamps come straight from the NBA shot-chart endpoint.
 */

const GAMES = gamesData as GameMeta[];
const SHOTS_BY_GAME = shotsByGameData as ShotsByGame;

// Shape TrajectoryReplay expects.
type TrajShot = { x: number; y: number; made: 0 | 1; xfg: number };

function fmtDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const m = parseInt(iso.slice(5, 7), 10);
  const d = parseInt(iso.slice(8, 10), 10);
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  return `${months[m - 1]} ${d}`;
}

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type PlayerGame = {
  game: GameMeta;
  shots: ShotRecord[];
  made: number;
  attempts: number;
  meanXfg: number;
  isHome: boolean;
  opponent: string;
};

export function EveryShot({
  ranking,
}: {
  // Keep `shots` in the signature for API compatibility with page.tsx but we
  // no longer read from it — game data is now sourced from shots_by_game.json.
  shots: unknown;
  ranking: RankingRow[];
}) {
  // Roster: top-18 by playoff shot volume, pulled from the existing ranking.
  const players = useMemo(() => {
    return [...ranking]
      .filter((r) => r.n_shots >= 30)
      .sort((a, b) => b.n_shots - a.n_shots)
      .slice(0, 18);
  }, [ranking]);

  const [playerId, setPlayerId] = useState<number>(
    players[0]?.player_id ?? FEATURED[0].id,
  );
  const [gameIdx, setGameIdx] = useState<number>(0);
  const [shotIdx, setShotIdx] = useState<number | null>(null);

  const playerName = ranking.find((r) => r.player_id === playerId)?.player_name ?? "—";

  // Real games this player appeared in, sorted chronologically (oldest first).
  const playerGames: PlayerGame[] = useMemo(() => {
    const out: PlayerGame[] = [];
    for (const g of GAMES) {
      const gameShots = SHOTS_BY_GAME[g.game_id] ?? [];
      const mine = gameShots.filter((s) => s.player_id === playerId);
      if (mine.length === 0) continue;
      // Order shots earliest → latest within the game (period asc, clock desc).
      mine.sort(
        (a, b) =>
          a.period - b.period ||
          b.seconds_remaining - a.seconds_remaining ||
          a.shot_id - b.shot_id,
      );
      const teamAbbrev = mine[0].team_abbrev;
      const isHome = teamAbbrev === g.home_team;
      const opponent = isHome ? g.away_team : g.home_team;
      const made = mine.filter((s) => s.made).length;
      const meanXfg =
        mine.reduce((acc, s) => acc + xfgForShot(s), 0) / mine.length;
      out.push({
        game: g,
        shots: mine,
        made,
        attempts: mine.length,
        meanXfg,
        isHome,
        opponent,
      });
    }
    // Oldest game first so the timeline reads naturally.
    out.sort((a, b) => a.game.date.localeCompare(b.game.date));
    return out;
  }, [playerId]);

  // Clamp gameIdx so switching to a player with fewer games doesn't break it.
  const safeGameIdx = Math.min(gameIdx, Math.max(0, playerGames.length - 1));
  const currentGame: PlayerGame | undefined = playerGames[safeGameIdx];

  const currentShotRecord: ShotRecord | null =
    shotIdx !== null ? currentGame?.shots[shotIdx] ?? null : null;

  // Adapt the real ShotRecord to the shape TrajectoryReplay expects.
  const currentTrajShot: TrajShot | null = currentShotRecord
    ? {
        x: currentShotRecord.x,
        y: currentShotRecord.y,
        made: currentShotRecord.made ? 1 : 0,
        xfg: xfgForShot(currentShotRecord),
      }
    : null;

  const breadcrumbDate = currentGame ? fmtDate(currentGame.game.date) : null;

  return (
    <section id="every-shot" className="relative bg-[#1a1a1a] text-white py-24 px-8 md:px-16 overflow-hidden">
      <div className="relative max-w-7xl mx-auto">
        <div className="border-b border-white/10 pb-5 mb-10">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40 mb-2 flex items-center gap-3">
            03 · Drill down
            <Breadcrumb
              playerName={playerName}
              dateLabel={breadcrumbDate}
              shotIdx={shotIdx}
            />
          </div>
          <h2 className="font-bold leading-tight" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(36px,4.5vw,72px)" }}>
            Every shot, every game.
          </h2>
          <p className="text-sm text-white/55 mt-3 max-w-2xl">
            Walk all the way from a player&apos;s playoff run down to a single attempt. Every game,
            opponent, and shot clock is straight from the NBA shotchart endpoint — no synthetic
            buckets.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <Column title={`Player · ${players.length}`}>
            {players.map((p) => (
              <RailRow
                key={p.player_id}
                active={p.player_id === playerId}
                onClick={() => {
                  setPlayerId(p.player_id);
                  setGameIdx(0);
                  setShotIdx(null);
                }}
                primary="#FF2D6F"
              >
                <span className="font-medium truncate">{p.player_name}</span>
                <span className="ml-2 text-[10px] uppercase tracking-wider text-white/35 font-mono shrink-0">
                  {p.n_shots}
                </span>
              </RailRow>
            ))}
          </Column>

          <Column title={`Playoff game · ${playerGames.length}`}>
            {playerGames.length === 0 && (
              <div className="text-xs text-white/35 px-3 py-6">
                No playoff games found for this player.
              </div>
            )}
            {playerGames.map((g, i) => (
              <RailRow
                key={g.game.game_id}
                active={i === safeGameIdx}
                onClick={() => {
                  setGameIdx(i);
                  setShotIdx(null);
                }}
                primary="#FF2D6F"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-white/90">
                    {fmtDate(g.game.date)}{" "}
                    <span className="text-white/40 text-[9px]">
                      {g.isHome ? "vs" : "@"} {g.opponent}
                    </span>
                  </span>
                  <span className="flex gap-1 items-center text-[9px] font-mono text-white/50 mt-0.5">
                    <span>{g.made}–{g.attempts} FG</span>
                    <span className="text-white/25">·</span>
                    <span>{Math.round(g.meanXfg * 100)}% xFG</span>
                  </span>
                </div>
              </RailRow>
            ))}
          </Column>

          <Column title={`Shot · ${currentGame?.shots.length ?? 0}`}>
            {!currentGame && (
              <div className="text-xs text-white/35 px-3 py-6">Pick a game to see shots.</div>
            )}
            {currentGame?.shots.map((s, i) => {
              const isMake = s.made;
              const xfg = xfgForShot(s);
              return (
                <RailRow
                  key={s.shot_id}
                  active={i === shotIdx}
                  onClick={() => setShotIdx(i)}
                  primary={isMake ? "rgb(120,255,180)" : "rgb(255,100,116)"}
                >
                  <span className="font-medium flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: isMake ? "rgb(120,255,180)" : "rgb(255,100,116)" }}
                    />
                    Q{s.period} {fmtClock(s.seconds_remaining)}
                  </span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-white/45 font-mono">
                    {s.shot_distance}ft · {Math.round(xfg * 100)}%
                  </span>
                </RailRow>
              );
            })}
          </Column>

          {/* Trajectory replay panel */}
          <div className="col-span-12 md:col-span-6">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 flex items-center gap-3">
              <span>Trajectory replay</span>
              {currentShotRecord && (
                <span className="text-white/30">
                  {currentShotRecord.made ? "MAKE" : "MISS"} ·{" "}
                  {currentShotRecord.shot_distance} ft · Q{currentShotRecord.period}{" "}
                  {fmtClock(currentShotRecord.seconds_remaining)}
                </span>
              )}
            </div>
            <TrajectoryReplay shot={currentTrajShot} playerName={playerName} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Breadcrumb({
  playerName,
  dateLabel,
  shotIdx,
}: {
  playerName: string;
  dateLabel: string | null;
  shotIdx: number | null;
}) {
  return (
    <span className="text-white/45 font-mono text-[10px] tracking-normal normal-case">
      {playerName}
      {dateLabel && (
        <>
          {" "}<span className="text-white/25">›</span>{" "}
          {dateLabel}
        </>
      )}
      {shotIdx !== null && (
        <>
          {" "}<span className="text-white/25">›</span>{" "}
          Shot {String(shotIdx + 1).padStart(2, "0")}
        </>
      )}
    </span>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="col-span-12 md:col-span-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3 px-1">{title}</div>
      <div className="h-[420px] overflow-y-auto pr-1 space-y-0.5 rounded-md bg-white/[0.02] ring-1 ring-white/5 p-1">
        {children}
      </div>
    </div>
  );
}

function RailRow({
  active, onClick, children, primary,
}: { active: boolean; onClick: () => void; children: React.ReactNode; primary: string }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: 2 }}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      className="relative w-full flex items-center justify-between text-left px-3 py-2 rounded-md text-xs transition group"
      style={{ background: active ? "rgba(255,255,255,0.06)" : "transparent" }}
    >
      {active && (
        <motion.span
          layoutId={`rail-${primary}`}
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
          style={{ background: primary }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
        />
      )}
      <span className="text-white/80 group-hover:text-white pl-2 flex items-center min-w-0 flex-1">
        {children}
      </span>
    </motion.button>
  );
}
