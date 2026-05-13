/**
 * Types for the per-game shot browser + game replay features.
 *
 * Mirrors the schema written by `scripts/export_shots_per_game.py` to:
 *   - frontend/lib/data/games.json
 *   - frontend/lib/data/shots_by_game.json
 */

export type GameMeta = {
  game_id: string;
  date: string; // YYYY-MM-DD
  home_team: string; // abbreviation, e.g. "BOS"
  away_team: string;
  shot_count: number;
  home_score?: number;
  away_score?: number;
};

export type ShotRecord = {
  shot_id: number;
  player_id: number;
  player_name: string;
  team_id: number;
  team_abbrev: string;
  period: number;
  minutes_remaining: number;
  /** Total seconds remaining within the period (minutes*60 + seconds). */
  seconds_remaining: number;
  /** Shot-chart LOC_X in tenths of a foot (hoop at 0). */
  x: number;
  /** Shot-chart LOC_Y in tenths of a foot. */
  y: number;
  made: boolean;
  action_type: string;
  shot_type: string;
  shot_zone: string;
  /** Distance in feet (from NBA shot chart SHOT_DISTANCE column). */
  shot_distance: number;
  /** Angle off the hoop centerline in degrees (0 = straight on, +right). */
  shot_angle: number;
  /**
   * Optional model expected-FG. Agent 1's backend export does not currently
   * emit a per-shot xfg in shots_by_game.json (their export is keyed by
   * player). When that pipeline starts emitting it here, this field will be
   * populated; until then, the frontend falls back to a logistic
   * approximation. See `lib/shotXfg.ts`.
   *
   * TODO(agent-1): plumb xfg_pred through to shots_by_game.json.
   */
  xfg_pred?: number;
};

export type ShotsByGame = Record<string, ShotRecord[]>;
