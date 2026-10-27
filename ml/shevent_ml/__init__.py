"""Shevent ML: data pipeline, features, synthetic data and the models behind the eight AI features."""

import os
import sys

__version__ = "0.1.0"

# On Windows, pyarrow 17 (kept below 18 by the mlflow pin) ships an old msvcp140.dll. If pyarrow loads it first,
# PyTorch fails with "WinError 1114 ... c10.dll". Loading Windows' own, newer copy first lets both work, so import
# shevent_ml before pandas or pyarrow (notebooks too).
if sys.platform == "win32":
    import ctypes

    try:
        ctypes.WinDLL(os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "msvcp140.dll"))
    except OSError:
        pass
