// Shared types for the inline data tree.
// These match the contract written by scripts/export_for_frontend.py.

export type RankingRow = {
  player_id: number;
  player_name: string;
  n_shots: number;
  actual_fg: number;
  mean_xfg: number;
  raw_delta: number;
  weight: number;
  shrunk_delta: number;
  ci_lo: number | null;
  ci_hi: number | null;
};

export type PlayerShots = {
  name: string;
  shots: Array<{ x: number; y: number; made: 0 | 1; xfg: number }>;
};

export type ShotsMap = Record<string, PlayerShots>;

export type HexCell = {
  cx: number;
  cy: number;
  n: number;
  fg: number;
  xfg: number;
};

export type HexData = {
  hex_size: number;
  court_bounds: { x_min: number; x_max: number; y_min: number; y_max: number };
  bins: HexCell[];
};

export type FoldRow = {
  fold: number;
  log_loss: number;
  auc: number;
  brier: number;
};

export type FoldMetrics = {
  baseline: FoldRow[];
  xgb: FoldRow[];
  lift: { log_loss: number };
};

export type CalibrationDecile = {
  bin_center: number;
  pred_mean: number;
  actual_rate: number;
};

export type CalibrationData = {
  n_bins: number;
  deciles: CalibrationDecile[];
  max_deviation: number;
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
  ranking: RankingRow[];
  shots: ShotsMap;
  hex: HexData;
  fold_metrics: FoldMetrics;
  calibration: CalibrationData;
  meta: Meta;
};
