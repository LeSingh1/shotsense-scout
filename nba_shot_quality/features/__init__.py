"""Feature engineering and the sklearn Pipeline factory."""

from .engineer import (
    build_pipeline,
    compute_late_game_q4,
    compute_seconds_left_in_game,
    compute_shot_angle,
    derive_home_away,
    engineer_features,
)

__all__ = [
    "build_pipeline",
    "compute_late_game_q4",
    "compute_seconds_left_in_game",
    "compute_shot_angle",
    "derive_home_away",
    "engineer_features",
]
