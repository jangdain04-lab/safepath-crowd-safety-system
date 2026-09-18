from collections import defaultdict, deque
from threading import RLock
from typing import Optional
import time
import warnings

import numpy as np

try:
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_absolute_error, r2_score
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import PolynomialFeatures
except Exception:
    LinearRegression = None
    PolynomialFeatures = None
    Pipeline = None
    mean_absolute_error = None
    r2_score = None

try:
    from statsmodels.tsa.arima.model import ARIMA
except Exception:
    ARIMA = None

warnings.filterwarnings("ignore")


INTERVAL_SEC = 5
HISTORY_WINDOW = 20 * 60
PREDICT_HORIZON = 20 * 60
HISTORY_POINTS = HISTORY_WINDOW // INTERVAL_SEC
MIN_POINTS = 12
POLY_DEGREE = 2

ARIMA_ORDER = (2, 1, 1)
ARIMA_RETRAIN_INTERVAL = 6

EVAL_HORIZONS = [300, 600, 900, 1200]
MODEL_NAMES = ["polynomial", "arima"]

_lock = RLock()
zone_data: dict[str, dict] = {}


def get_or_create_zone(zone_id: str) -> dict:
    if zone_id not in zone_data:
        zone_data[zone_id] = {
            "times": deque(maxlen=HISTORY_POINTS),
            "counts": deque(maxlen=HISTORY_POINTS),
            "start_time": None,
            "prediction_log": {},
            "eval_log": defaultdict(list),
            "arima_cache": None,
            "arima_last_train": -1,
        }
    return zone_data[zone_id]


def _safe_r2(actual: np.ndarray, fitted: np.ndarray) -> float:
    if len(actual) < 2:
        return 0.0
    if r2_score is not None:
        return round(float(r2_score(actual, fitted)), 4)
    ss_res = float(np.sum((actual - fitted) ** 2))
    ss_tot = float(np.sum((actual - np.mean(actual)) ** 2))
    if ss_tot == 0:
        return 1.0
    return round(1 - (ss_res / ss_tot), 4)


def _safe_mae(actual: np.ndarray, fitted: np.ndarray) -> float:
    if mean_absolute_error is not None:
        return round(float(mean_absolute_error(actual, fitted)), 2)
    return round(float(np.mean(np.abs(actual - fitted))), 2)


def fit_polynomial(x: np.ndarray, counts: np.ndarray, future_x: np.ndarray) -> dict:
    if Pipeline is not None and PolynomialFeatures is not None and LinearRegression is not None:
        model = Pipeline([
            ("poly", PolynomialFeatures(degree=POLY_DEGREE, include_bias=False)),
            ("reg", LinearRegression()),
        ]).fit(x, counts)
        fitted = model.predict(x)
        predicted = model.predict(future_x)
    else:
        degree = min(POLY_DEGREE, max(1, len(counts) - 1))
        coef = np.polyfit(x.reshape(-1), counts, degree)
        poly = np.poly1d(coef)
        fitted = poly(x.reshape(-1))
        predicted = poly(future_x.reshape(-1))

    return {
        "predicted": np.maximum(0, predicted).tolist(),
        "r2": _safe_r2(counts, fitted),
        "mae": _safe_mae(counts, fitted),
    }


def fit_arima(counts: np.ndarray, steps: int, zone: dict, current_idx: int) -> dict:
    should_retrain = (
        zone["arima_cache"] is None
        or (current_idx - zone["arima_last_train"]) >= ARIMA_RETRAIN_INTERVAL
    )

    if not should_retrain:
        return zone["arima_cache"]

    if ARIMA is None:
        if zone["arima_cache"]:
            return zone["arima_cache"]
        return {"error": "statsmodels is not installed"}

    try:
        model = ARIMA(counts, order=ARIMA_ORDER)
        result = model.fit()
        fitted = result.fittedvalues
        predicted = np.maximum(0, result.forecast(steps=steps))
        cache = {
            "predicted": predicted.tolist(),
            "r2": _safe_r2(counts, fitted),
            "mae": _safe_mae(counts, fitted),
        }
        zone["arima_cache"] = cache
        zone["arima_last_train"] = current_idx
        return cache
    except Exception as exc:
        if zone["arima_cache"]:
            return zone["arima_cache"]
        return {"error": str(exc)}


def run_all_models(
    times: np.ndarray,
    counts: np.ndarray,
    future_offsets: np.ndarray,
    zone: dict,
    current_idx: int,
) -> dict:
    x = times.reshape(-1, 1)
    future_x = (times[-1] + future_offsets).reshape(-1, 1)
    steps = len(future_offsets)
    results = {}

    try:
        results["polynomial"] = fit_polynomial(x, counts, future_x)
    except Exception as exc:
        results["polynomial"] = {"error": str(exc)}

    results["arima"] = fit_arima(counts, steps, zone, current_idx)
    return results


def _horizon_label(sec: int) -> str:
    return f"+{sec // 60}min" if sec >= 60 else f"+{sec}sec"


def save_predictions(zone: dict, current_time: float, model_results: dict, future_offsets: np.ndarray):
    for horizon in EVAL_HORIZONS:
        idx = int(round(horizon / INTERVAL_SEC)) - 1
        target_time = current_time + horizon

        if idx < 0 or idx >= len(future_offsets):
            continue

        if target_time not in zone["prediction_log"]:
            zone["prediction_log"][target_time] = {"horizon_sec": horizon}
            for name, result in model_results.items():
                if "error" not in result and idx < len(result["predicted"]):
                    zone["prediction_log"][target_time][name] = round(result["predicted"][idx], 1)


def match_predictions(zone: dict, current_time: float, actual_count: float):
    to_delete = []

    for target_time, log in zone["prediction_log"].items():
        if abs(current_time - target_time) <= INTERVAL_SEC:
            horizon = log["horizon_sec"]

            for name in MODEL_NAMES:
                if name in log:
                    predicted = log[name]
                    error = abs(predicted - actual_count)
                    pct_error = round(error / actual_count * 100, 1) if actual_count > 0 else None
                    zone["eval_log"][name].append({
                        "horizon_sec": horizon,
                        "horizon_label": _horizon_label(horizon),
                        "predicted": predicted,
                        "actual": round(actual_count, 1),
                        "error": round(error, 1),
                        "pct_error": pct_error,
                    })

            to_delete.append(target_time)

    for target_time in to_delete:
        del zone["prediction_log"][target_time]


def get_accuracy_summary(zone: dict) -> dict:
    summary = {}

    for name in MODEL_NAMES:
        logs = zone["eval_log"][name]

        if not logs:
            summary[name] = {"total_comparisons": 0}
            continue

        all_errors = [log["error"] for log in logs]
        all_pcts = [log["pct_error"] for log in logs if log["pct_error"] is not None]
        all_actuals = [log["actual"] for log in logs]
        all_preds = [log["predicted"] for log in logs]

        by_horizon = {}
        for horizon in EVAL_HORIZONS:
            label = _horizon_label(horizon)
            horizon_logs = [log for log in logs if log["horizon_sec"] == horizon]
            if horizon_logs:
                h_errors = [log["error"] for log in horizon_logs]
                h_pcts = [log["pct_error"] for log in horizon_logs if log["pct_error"] is not None]
                by_horizon[label] = {
                    "average_error_people": round(float(np.mean(h_errors)), 1),
                    "average_error_rate": f"{round(float(np.mean(h_pcts)), 1)}%" if h_pcts else None,
                    "comparisons": len(horizon_logs),
                }

        try:
            cumulative_r2 = _safe_r2(np.array(all_actuals), np.array(all_preds)) if len(all_actuals) >= 2 else None
        except Exception:
            cumulative_r2 = None

        summary[name] = {
            "total_comparisons": len(logs),
            "overall_average_error": round(float(np.mean(all_errors)), 1),
            "overall_error_rate": f"{round(float(np.mean(all_pcts)), 1)}%" if all_pcts else None,
            "cumulative_r2": cumulative_r2,
            "by_horizon": by_horizon,
        }

    return summary


def predict_zone(zone_id: str) -> dict:
    with _lock:
        zone = zone_data.get(zone_id)
        n = len(zone["times"]) if zone else 0

        if zone is None or n < MIN_POINTS:
            return {
                "zone_id": zone_id,
                "status": "collecting",
                "message": f"collecting data ({n * INTERVAL_SEC}s / {MIN_POINTS * INTERVAL_SEC}s required)",
                "history": {
                    "times_offset": list(zone["times"]) if zone else [],
                    "counts": [round(count) for count in zone["counts"]] if zone else [],
                },
                "models": {},
            }

        times = np.array(zone["times"])
        counts = np.array(zone["counts"])
        future_offsets = np.arange(INTERVAL_SEC, PREDICT_HORIZON + INTERVAL_SEC, INTERVAL_SEC)
        model_results = run_all_models(times, counts, future_offsets, zone, n)

        save_predictions(zone, times[-1], model_results, future_offsets)

        model_outputs = {}
        for name, result in model_results.items():
            if "error" in result:
                model_outputs[name] = {"error": result["error"]}
                continue

            model_outputs[name] = {
                "r2": result["r2"],
                "mae": result["mae"],
                "predicted_counts": [round(value, 1) for value in result["predicted"]],
            }

        current_time = times[-1]
        history_offsets = (times - current_time).tolist()

        return {
            "zone_id": zone_id,
            "status": "predicting",
            "current_count": int(round(counts[-1])),
            "data_points_used": n,
            "history": {
                "times_offset": [round(value) for value in history_offsets],
                "counts": [round(value) for value in counts],
            },
            "future_times_offset": future_offsets.tolist(),
            "models": model_outputs,
        }


def push_crowd_data(zone_id: str, count: float, timestamp: Optional[float] = None) -> dict:
    with _lock:
        zone = get_or_create_zone(zone_id)
        ts = timestamp or time.time()

        if zone["start_time"] is None:
            zone["start_time"] = ts

        relative_time = ts - zone["start_time"]
        zone["times"].append(relative_time)
        zone["counts"].append(max(count, 0.0))
        match_predictions(zone, relative_time, count)

    return predict_zone(zone_id)


def get_accuracy(zone_id: str) -> dict:
    with _lock:
        if zone_id not in zone_data:
            raise KeyError(zone_id)

        summary = get_accuracy_summary(zone_data[zone_id])
        best = min(
            [name for name in MODEL_NAMES if summary[name].get("total_comparisons", 0) > 0],
            key=lambda name: summary[name].get("overall_average_error", 9999),
            default=None,
        )

        return {
            "zone_id": zone_id,
            "best_model": best,
            "eval_count": {
                name: summary[name].get("total_comparisons", 0)
                for name in MODEL_NAMES
            },
            "models": summary,
        }


def get_accuracy_detail(zone_id: str) -> dict:
    with _lock:
        if zone_id not in zone_data:
            raise KeyError(zone_id)

        zone = zone_data[zone_id]
        return {
            "zone_id": zone_id,
            "logs": {name: list(zone["eval_log"][name]) for name in MODEL_NAMES},
        }


def get_all_zones_summary() -> list[dict]:
    with _lock:
        return [
            {
                "zone_id": zone_id,
                "current_count": int(round(zone["counts"][-1])) if zone["counts"] else 0,
                "data_points": len(zone["times"]),
            }
            for zone_id, zone in zone_data.items()
        ]


def reset_zone(zone_id: str) -> dict:
    with _lock:
        if zone_id in zone_data:
            del zone_data[zone_id]
    return {"message": f"zone '{zone_id}' reset"}


def get_zone_prediction_for_candidates(candidate_zone_ids: list[str]) -> dict | None:
    with _lock:
        for zone_id in candidate_zone_ids:
            if zone_id in zone_data:
                return predict_zone(zone_id)
    return None


def build_app_values(prediction: dict | None) -> list[int]:
    if not prediction:
        return [0] * 10

    history_counts = prediction.get("history", {}).get("counts", [])
    values = [int(round(value)) for value in history_counts[-6:]]

    if not values:
        values = [0]

    while len(values) < 6:
        values.insert(0, values[0])

    model = prediction.get("models", {}).get("polynomial")
    if not model or "error" in model:
        model = prediction.get("models", {}).get("arima")

    predicted_counts = []
    if model and "error" not in model:
        raw_predictions = model.get("predicted_counts", [])
        for horizon in EVAL_HORIZONS:
            idx = int(round(horizon / INTERVAL_SEC)) - 1
            if idx < len(raw_predictions):
                predicted_counts.append(int(round(raw_predictions[idx])))

    if not predicted_counts:
        trend = values[-1] - values[-2] if len(values) >= 2 else 0
        trend = max(-8, min(8, trend))
        while len(predicted_counts) < 4:
            base = predicted_counts[-1] if predicted_counts else values[-1]
            predicted_counts.append(max(0, int(base + trend)))

    values.extend(predicted_counts[:4])
    return values[-10:]


def get_app_prediction_level(values: list[int]) -> tuple[str, int, str]:
    max_expected = max(values[-4:] or values)
    current = values[5] if len(values) > 5 else values[-1]
    increase = max_expected - current
    progress = max(0, min(100, round((max_expected / 60) * 100)))

    if max_expected >= 50 or increase >= 25:
        return "critical", progress, "5min"
    if max_expected >= 30 or increase >= 12:
        return "warning", progress, "10min"
    return "safe", progress, "30min"
