"""Score new shots using the latest saved model.

Usage:
    python scripts/predict.py --shots path/to/new_shots.parquet
    python scripts/predict.py --shots new_shots.csv --out scored.csv
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# Bootstrap: enable `python scripts/predict.py` to find the package.
_PKG_ROOT = Path(__file__).resolve().parents[1]
if str(_PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(_PKG_ROOT))

import pandas as pd  # noqa: E402

from nba_shot_quality.data.schema import validate_shots  # noqa: E402
from nba_shot_quality.features import engineer_features
from nba_shot_quality.features.engineer import ALL_FEATURE_COLS
from nba_shot_quality.model import load_latest

logger = logging.getLogger("nba_shot_quality.predict")


def _read_shots(path: Path) -> pd.DataFrame:
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    if path.suffix in (".csv", ".tsv"):
        sep = "\t" if path.suffix == ".tsv" else ","
        return pd.read_csv(path, sep=sep)
    raise ValueError(f"Unsupported input format: {path.suffix}. Use .parquet/.csv/.tsv.")


def _read_games(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Score new NBA shots with the latest xFG model")
    parser.add_argument("--shots", required=True, help="Path to a shotchartdetail-shaped parquet or CSV")
    parser.add_argument("--games", help="Optional path to a leaguegamefinder parquet (needed for home_away)")
    parser.add_argument("--out", help="Output path (default: <input>.scored.csv)")
    parser.add_argument("--log-level", default="INFO")
    args = parser.parse_args(argv)

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO),
                        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    shots_path = Path(args.shots)
    shots = _read_shots(shots_path)
    validate_shots(shots)

    if args.games:
        games = _read_games(Path(args.games))
    else:
        from nba_shot_quality.config import GAMES_CACHE_PATH
        if not GAMES_CACHE_PATH.exists():
            logger.error("No games file at %s and --games not provided. home_away derivation will fail.",
                         GAMES_CACHE_PATH)
            return 2
        games = pd.read_parquet(GAMES_CACHE_PATH)

    engineered = engineer_features(shots, games)
    X = engineered[list(ALL_FEATURE_COLS)]

    model = load_latest()
    logger.info("Loaded model: %s", type(model).__name__)
    proba = model.predict_proba(X)[:, 1]

    scored = shots.copy()
    scored["xfg_pred"] = proba

    out_path = Path(args.out) if args.out else shots_path.with_suffix(".scored.csv")
    scored.to_csv(out_path, index=False)
    logger.info("Scored %d shots → %s", len(scored), out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
