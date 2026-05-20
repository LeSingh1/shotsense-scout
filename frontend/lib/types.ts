// Shared types for the ShotSense Scout dashboard.

export type ZoneKey =
  | "restricted_area"
  | "paint_non_ra"
  | "midrange"
  | "above_break_3"
  | "left_corner_3"
  | "right_corner_3";

export type ZoneStats = {
  attempts: number;
  makes: number;
  fg_pct: number;
  xfg: number;
  recent: { attempts: number; makes: number; fg_pct: number };
  delta: number;
};

export type PlayerProfile = {
  player_name: string;
  player_id: number;
  team: string;
  games_played: number;
  total_shots: number;
  overall_fg_pct: number;
  overall_xfg: number;
  zones: Record<ZoneKey, ZoneStats>;
};

export type TeamZoneStats = {
  attempts: number;
  makes: number;
  fg_pct: number;
};

export type TeamProfile = {
  team_name: string;
  team_abbr: string;
  games_played: number;
  total_shots: number;
  overall_fg_pct: number;
  zones: Record<ZoneKey, TeamZoneStats>;
  shot_distribution: Record<ZoneKey, number>;
  paint_attempts_per_game: number;
  three_point_rate: number;
};

export type GameLogEntry = {
  player_name: string;
  player_id: number;
  game_date: string;
  opponent: string;
  game_id: string;
  shots_attempted: number;
  shots_made: number;
  fg_pct: number;
  mean_xfg: number;
  zone_breakdown: Record<string, { attempts: number; makes: number }>;
  quarter_breakdown: Record<
    string,
    { attempts: number; makes: number; fg_pct: number }
  >;
};

export type PatternType =
  | "efficiency_drop"
  | "cold_zone"
  | "hot_zone"
  | "shot_selection_shift"
  | "clutch_performance"
  | "consistency";

export type Pattern = {
  player_name: string;
  player_id: number;
  pattern_type: PatternType;
  zone: ZoneKey | null;
  severity: number;
  direction: "positive" | "negative";
  evidence: Record<string, unknown>;
  summary: string;
  games_window: string[];
};

export type ShotDot = {
  x: number;
  y: number;
  made: 0 | 1;
  xfg: number;
};

export type PlayerShots = {
  name: string;
  shots: ShotDot[];
};

export type ShotsMap = Record<string, PlayerShots>;

export type ScoutReport = {
  main_finding: string;
  why_it_matters: string;
  evidence: Array<{ label: string; value: string }>;
  suggested_adjustment: string;
  confidence: number;
  confidence_rationale: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  evidence?: Array<{ label: string; data: unknown }>;
};

export type ShotFilter = {
  shotType: "all" | "2pt" | "3pt";
  quarters: number[];
  gameRange: [number, number];
};

export type Meta = {
  season: string;
  season_type: string;
  run_timestamp: string;
  n_shots: number;
  n_games: number;
  n_teams_with_data: number;
  n_players: number;
  model_artifact: string;
  model_sha256: string;
  baseline_mean_log_loss: number;
  xgb_mean_log_loss: number;
  xgb_lift: number;
};

export type AppData = {
  playerProfiles: PlayerProfile[];
  teamProfiles: TeamProfile[];
  gameLogs: GameLogEntry[];
  patterns: Pattern[];
  shots: ShotsMap;
  meta: Meta;
};
