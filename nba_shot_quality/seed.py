"""Single entry point for locking all sources of randomness.

Call seed_everything(SEED) once at the top of run_pipeline.py (and at the top
of any test that depends on reproducibility). It locks:

  - Python's `random` module
  - NumPy
  - Python hash seed (via PYTHONHASHSEED env var, set before module import in CI)
  - XGBoost (via per-model random_state in config.XGB_PARAMS)
  - sklearn splitters (via per-splitter random_state)

XGBoost and sklearn don't read numpy.random.seed; they each read their own
random_state kwarg. We seed numpy + random globally here, and the model
configs in config.py pass SEED directly to XGBClassifier / GroupKFold.
"""

from __future__ import annotations

import os
import random

import numpy as np


def seed_everything(seed: int) -> None:
    """Seed every source of randomness this package touches.

    Does NOT mutate config.XGB_PARAMS / config.LOGREG_PARAMS — those already
    carry random_state=SEED at config time. This function handles the global
    state that's not parameterized: numpy, Python random, hash seed.
    """
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
