"""End-to-end CLI: fetch → engineer → train (XGB + LogReg) → eval → rank → viz.

Usage:
    python scripts/run_pipeline.py                  # fresh fetch, train, eval
    python scripts/run_pipeline.py --use-cache      # work from parquet cache
    python scripts/run_pipeline.py --use-cache --calibrate
    python scripts/run_pipeline.py --log-level DEBUG
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

# Bootstrap: enable `python scripts/run_pipeline.py` to find the package
# without requiring `pip install -e .` first. Harmless when already installed.
_PKG_ROOT = Path(__file__).resolve().parents[1]
if str(_PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(_PKG_ROOT))

import pandas as pd  # noqa: E402

from nba_shot_quality.config import (  # noqa: E402
    CALIBRATION_WARNING_THRESHOLD,
    GAMES_CACHE_PATH,
    OUTPUTS_DIR,
    SEASON,
    SEED,
)
from nba_shot_quality.data import (
    atomic_write_parquet,
    fetch_all_playoff_shots,
    fetch_games,
)
from nba_shot_quality.eval import (
    calibration_plot,
    check_calibration_warning,
    compute_metrics,
    feature_importance_plot,
    hex_shot_chart,
    model_compare_plot,
    player_ranking_plot,
    shrink_player_deltas,
)
from nba_shot_quality.eval.ranking import add_bootstrap_ci_to_ranking, top_bottom_n
from nba_shot_quality.features import engineer_features
from nba_shot_quality.model import apply_isotonic_calibration, save_model, train_baseline, train_with_cv
from nba_shot_quality.seed import seed_everything

logger = logging.getLogger("nba_shot_quality")


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def _load_or_fetch_games(use_cache: bool) -> pd.DataFrame:
    if use_cache and GAMES_CACHE_PATH.exists():
        logger.info("Loading games from cache: %s", GAMES_CACHE_PATH)
        return pd.read_parquet(GAMES_CACHE_PATH)
    logger.info("Fetching playoff games (leaguegamefinder)…")
    df = fetch_games()
    if df is None:
        raise RuntimeError("Failed to fetch games table after retries.")
    atomic_write_parquet(df, GAMES_CACHE_PATH)
    return df


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="NBA xFG% pipeline")
    parser.add_argument("--use-cache", action="store_true", help="Use parquet cache; fetch only missing teams")
    parser.add_argument("--calibrate", action="store_true", help="Apply isotonic calibration post-processing")
    parser.add_argument("--log-level", default="INFO", help="DEBUG|INFO|WARNING|ERROR")
    parser.add_argument("--season", default=SEASON, help=f"NBA season (default: {SEASON})")
    args = parser.parse_args(argv)

    _setup_logging(args.log_level)
    seed_everything(SEED)
    logger.info("Pipeline starting. season=%s use_cache=%s calibrate=%s seed=%d",
                args.season, args.use_cache, args.calibrate, SEED)

    # --- Fetch ------------------------------------------------------------
    games = _load_or_fetch_games(args.use_cache)
    shots = fetch_all_playoff_shots(use_cache=args.use_cache, season=args.season)
    logger.info("Loaded %d shots across %d games", len(shots), shots["GAME_ID"].nunique())

    # --- Engineer --------------------------------------------------------
    engineered = engineer_features(shots, games)
    logger.info("Engineered features. Columns added: shot_angle, late_game_q4, "
                "seconds_left_*, is_three_point, is_overtime, home_away")

    from nba_shot_quality.features.engineer import ALL_FEATURE_COLS

    X = engineered[list(ALL_FEATURE_COLS)]
    y = engineered["SHOT_MADE_FLAG"].astype(int)
    groups = engineered["GAME_ID"].astype(str)

    # --- Train: baseline + XGBoost --------------------------------------
    logger.info("Training LogisticRegression baseline (5-fold GroupKFold)…")
    baseline_result = train_baseline(X, y, groups)
    logger.info("Baseline mean log_loss=%.4f auc=%.4f brier=%.4f",
                baseline_result.mean_log_loss, baseline_result.mean_auc, baseline_result.mean_brier)

    logger.info("Training XGBoost (5-fold GroupKFold)…")
    xgb_result = train_with_cv(X, y, groups)
    logger.info("XGBoost mean log_loss=%.4f auc=%.4f brier=%.4f",
                xgb_result.mean_log_loss, xgb_result.mean_auc, xgb_result.mean_brier)

    lift = baseline_result.mean_log_loss - xgb_result.mean_log_loss
    if lift <= 0.001:
        logger.warning("XGBoost lift over baseline is %.4f — complexity may not be earning its keep.", lift)
    else:
        logger.info("XGBoost log_loss lift over baseline: %.4f", lift)

    # --- Calibration check ----------------------------------------------
    mask = ~xgb_result.oof_predictions.__ne__(xgb_result.oof_predictions)  # ~np.isnan equivalent
    import numpy as np
    valid = ~np.isnan(xgb_result.oof_predictions)
    triggered, max_dev = check_calibration_warning(y.values[valid], xgb_result.oof_predictions[valid])
    logger.info("Calibration: max decile deviation = %.3f (threshold=%.3f)%s",
                max_dev, CALIBRATION_WARNING_THRESHOLD, "  [WARNING]" if triggered else "")

    final_model: object = xgb_result.final_pipeline
    if args.calibrate:
        logger.info("Applying isotonic calibration on out-of-fold predictions…")
        final_model = apply_isotonic_calibration(
            xgb_result.final_pipeline, xgb_result.oof_predictions, y.values
        )

    # --- Persist --------------------------------------------------------
    artifact = save_model(final_model, season=args.season)
    logger.info("Saved model: %s", artifact)

    # --- Score for headline + rank --------------------------------------
    proba = final_model.predict_proba(X)[:, 1]
    scored = engineered.assign(xfg_pred=proba)
    ranking = shrink_player_deltas(scored)
    ranking = add_bootstrap_ci_to_ranking(scored, ranking)

    # --- Output directory -----------------------------------------------
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = OUTPUTS_DIR / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)

    ranking.to_csv(out_dir / "ranking.csv", index=False)
    logger.info("Wrote %s", out_dir / "ranking.csv")

    # --- Visualizations -------------------------------------------------
    hex_shot_chart(scored).savefig(out_dir / "hex_shot_chart.png", dpi=120)
    feature_importance_plot(xgb_result.final_pipeline).savefig(out_dir / "feature_importance.png", dpi=120)
    calibration_plot(y.values[valid], xgb_result.oof_predictions[valid], label="XGBoost OOF").savefig(
        out_dir / "calibration.png", dpi=120
    )
    model_compare_plot(
        [{"fold": f.fold, "log_loss": f.log_loss, "roc_auc": f.roc_auc} for f in baseline_result.folds],
        [{"fold": f.fold, "log_loss": f.log_loss, "roc_auc": f.roc_auc} for f in xgb_result.folds],
    ).savefig(out_dir / "model_compare.png", dpi=120)
    top, bot = top_bottom_n(ranking)
    player_ranking_plot(top, bot).savefig(out_dir / "player_ranking.png", dpi=120)
    logger.info("Wrote 5 visualizations to %s", out_dir)

    logger.info("Done. Top performer: %s (%+.3f shrunk).",
                top.iloc[0]["PLAYER_NAME"], top.iloc[0]["shrunk_delta"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
