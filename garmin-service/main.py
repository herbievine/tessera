#!/usr/bin/env python3
"""
Garmin Connect Service
======================

A standalone service for accessing Garmin Connect data.
Uses token-based authentication to avoid repeated logins.

Usage:
    python main.py

Environment Variables:
    GARMIN_EMAIL - Garmin account email
    GARMIN_PASSWORD - Garmin account password
    GARMINTOKENS - Path to token storage directory (default: /data/.garminconnect)
    PORT - Server port (default: 3011)
    API_KEY - API key for authentication
"""

import json
import logging
import os
import sys
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import garth
from garminconnect import Garmin

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

api: Garmin | None = None


class Config:
    email: str | None = os.getenv("GARMIN_EMAIL")
    password: str | None = os.getenv("GARMIN_PASSWORD")
    tokenstore: str = os.getenv("GARMINTOKENS") or "/data/.garminconnect"
    port: int = int(os.getenv("PORT", "3011"))
    admin_key: str | None = os.getenv("GARMIN_ADMIN_KEY")

    today: date = datetime.now(timezone.utc).date()
    week_start: date = today - timedelta(days=7)


config = Config()


def get_mfa() -> str:
    """Get MFA token from user input."""
    return input("MFA one-time code: ")


def init_api() -> Garmin:
    """Initialize Garmin API with token-based authentication."""
    tokenstore = Path(config.tokenstore)
    tokenstore.mkdir(parents=True, exist_ok=True)

    token_files = ["oauth1_token.json", "oauth2_token.json"]
    has_tokens = any((tokenstore / f).exists() for f in token_files)

    if has_tokens:
        logger.info(f"Loading tokens from {tokenstore}")
        try:
            garmin = Garmin()
            garmin.login(str(tokenstore))
            logger.info("Successfully authenticated with stored tokens")
            return garmin
        except Exception as e:
            logger.warning(f"Failed to use stored tokens: {e}")

    if not config.email or not config.password:
        raise ValueError("GARMIN_EMAIL and GARMIN_PASSWORD must be set for initial login")

    logger.info("Initiating new login")
    try:
        garmin = Garmin(config.email, config.password)
        token1, token2 = garmin.login("")
        garth.save(str(tokenstore))
        logger.info("Successfully authenticated and stored tokens")
        return garmin
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise


def safe_api_call(method, *args, **kwargs) -> tuple[bool, Any, str | None]:
    """Safely call an API method with error handling."""
    try:
        result = method(*args, **kwargs)
        return True, result, None
    except Exception as e:
        return False, None, f"Error: {e}"


def get_date_param(query: dict, param: str, default: date) -> date:
    """Parse a date parameter from query string."""
    if param in query and query[param][0]:
        return datetime.strptime(query[param][0], "%Y-%m-%d").date()
    return default


def format_sleep_data(raw: dict) -> dict:
    """Format sleep data into structured format."""
    dto = raw.get("dailySleepDTO", {})

    # levels = dto.get("sleepLevels", {})

    # Garmin omits sleepScores entirely for nights it hasn't finished scoring
    # yet (e.g. very recent dates), so every nested lookup here has to
    # tolerate a missing scores dict, not just missing individual scores.
    scores = dto.get("sleepScores") or {}

    def score(key: str, field: str):
        return (scores.get(key) or {}).get(field)

    # Garmin also omits the duration fields themselves (not just scores) for
    # nights it hasn't finished processing - dto.get(key, 0) only falls back
    # on a missing key, not an explicit null, so this needs its own guard.
    def hours(key: str):
        seconds = dto.get(key)
        return None if seconds is None else round(seconds / 3600, 1)

    return {
        "date": dto.get("calendarDate"),
        "sleep_score": score("overall", "value"),
        "quality": score("overall", "qualifierKey"),
        "light_pct_score": score("lightPercentage", "value"),
        "light_pct_quality": score("lightPercentage", "qualifierKey"),
        "deep_pct_score": score("deepPercentage", "value"),
        "deep_pct_quality": score("deepPercentage", "qualifierKey"),
        "rem_pct_score": score("remPercentage", "value"),
        "rem_pct_quality": score("remPercentage", "qualifierKey"),
        "total_seconds": dto.get("sleepTimeSeconds"),
        "total_hours": hours("sleepTimeSeconds"),
        "deep_seconds": dto.get("deepSleepSeconds"),
        "deep_hours": hours("deepSleepSeconds"),
        "light_seconds": dto.get("lightSleepSeconds"),
        "light_hours": hours("lightSleepSeconds"),
        "rem_seconds": dto.get("remSleepSeconds"),
        "rem_hours": hours("remSleepSeconds"),
        "awake_seconds": dto.get("awakeSleepSeconds"),
        "awake_hours": hours("awakeSleepSeconds"),
        # "restless_seconds": dto.get("restlessSeconds"),
        # "restless_percentage": dto.get("restlessPeriodsPercentage"),
        "awake_count": dto.get("awakeCount"),
        # "dasd": dto,
    }


def format_heart_rate_data(raw: dict) -> dict:
    """Format heart rate data into per-minute timeseries."""
    heart_rates = raw.get("heartRateValues") or []

    timeseries = []
    for hr in heart_rates:
        timestamp_ms = hr[0]
        bpm = hr[1]
        dt = datetime.fromtimestamp(timestamp_ms / 1000, timezone.utc)
        timeseries.append({
            "time": dt.isoformat(),
            "bpm": bpm,
        })

    return {
        "date": raw.get("calendarDate", ""),
        "resting_hr": raw.get("restingHeartRate"),
        "max_hr": raw.get("maxHeartRate"),
        "min_hr": raw.get("minHeartRate"),
        "timeseries": timeseries,
        "raw": raw
    }


def format_hrv_data(raw: list[dict]) -> list[dict] | None:
    """Format HRV data"""
    timeseries = []
    for hrv in raw:
        data = hrv.get("data")
        if data is None:
            # No HRV recorded for this day at all - skip it, not the rest.
            continue

        summary = data.get("hrvSummary") or {}
        baseline = summary.get("baseline") or {}
        readings = data.get("hrvReadings") or []
        timeseries.append({
            "date": summary.get("calendarDate"),
            "lastNightAvg": summary.get("lastNightAvg"),
            "lowUpper": baseline.get("lowUpper"),
            "balancedLow": baseline.get("balancedLow"),
            "balancedUpper": baseline.get("balancedUpper"),
            "markerValue": baseline.get("markerValue"),
            "readings": readings,
        })

    return timeseries


def pick(raw: dict, *keys):
    """First non-null value among keys.

    Garmin names the same metric differently depending on where it comes
    from: the activity list DTO uses flat names like `avgPower`, while the
    per-activity summaryDTO uses `averagePower`/`avgPower` inconsistently.
    Both feed the same stored fields, so lookups accept either spelling.
    """
    for key in keys:
        value = raw.get(key)
        if value is not None:
            return value
    return None


def format_activity_summary(raw: dict) -> dict:
    """Flatten a Garmin activity summary into the fields we store.

    Garmin nests type/event under objects and omits most metric fields
    entirely for activities that don't have them (no HR strap, indoor runs
    with no GPS, no running dynamics on a strength session), so every lookup
    here tolerates a missing key.

    Accepts both the activity list DTO and a `summaryDTO` from the
    per-activity endpoint; the latter carries fields the list omits.
    """
    # The list DTO nests the type under `activityType`; the per-activity
    # endpoint calls the same object `activityTypeDTO`.
    activity_type = raw.get("activityType") or raw.get("activityTypeDTO") or {}

    return {
        "activity_id": raw.get("activityId"),
        "name": raw.get("activityName"),
        "type_key": activity_type.get("typeKey"),
        "start_time_local": raw.get("startTimeLocal"),
        "start_time_gmt": pick(raw, "startTimeGMT", "startTimeGmt"),
        "distance_m": raw.get("distance"),
        "duration_s": raw.get("duration"),
        "moving_duration_s": raw.get("movingDuration"),
        "elapsed_duration_s": raw.get("elapsedDuration"),
        "elevation_gain_m": raw.get("elevationGain"),
        "elevation_loss_m": raw.get("elevationLoss"),
        "min_elevation_m": raw.get("minElevation"),
        "max_elevation_m": raw.get("maxElevation"),
        "average_speed_mps": pick(raw, "averageSpeed", "avgSpeed"),
        "max_speed_mps": raw.get("maxSpeed"),
        "avg_moving_speed_mps": pick(raw, "averageMovingSpeed", "avgMovingSpeed"),
        "avg_grade_adjusted_speed_mps": pick(
            raw, "avgGradeAdjustedSpeed", "averageGradeAdjustedSpeed"
        ),
        "calories": raw.get("calories"),
        "resting_calories": raw.get("bmrCalories"),
        "average_hr": pick(raw, "averageHR", "avgHr"),
        "max_hr": pick(raw, "maxHR", "maxHr"),
        "average_cadence": pick(
            raw, "averageRunningCadenceInStepsPerMinute", "averageRunCadence"
        ),
        "max_cadence": pick(
            raw, "maxRunningCadenceInStepsPerMinute", "maxRunCadence"
        ),
        "steps": raw.get("steps"),
        "avg_stride_length_cm": pick(raw, "avgStrideLength", "strideLength"),
        "avg_vertical_oscillation_cm": pick(
            raw, "avgVerticalOscillation", "verticalOscillation"
        ),
        "avg_vertical_ratio": pick(raw, "avgVerticalRatio", "verticalRatio"),
        "avg_ground_contact_time_ms": pick(
            raw, "avgGroundContactTime", "groundContactTime"
        ),
        "avg_ground_contact_balance": pick(
            raw, "avgGroundContactBalance", "groundContactBalanceLeft"
        ),
        "avg_power_w": pick(raw, "avgPower", "averagePower"),
        "max_power_w": raw.get("maxPower"),
        "normalized_power_w": pick(raw, "normPower", "normalizedPower"),
        "avg_respiration_rate": pick(raw, "avgRespirationRate", "averageRespirationRate"),
        "min_respiration_rate": raw.get("minRespirationRate"),
        "max_respiration_rate": raw.get("maxRespirationRate"),
        "water_estimated_ml": raw.get("waterEstimated"),
        "moderate_intensity_minutes": raw.get("moderateIntensityMinutes"),
        "vigorous_intensity_minutes": raw.get("vigorousIntensityMinutes"),
        "body_battery_diff": raw.get("differenceBodyBattery"),
        "activity_training_load": pick(
            raw, "activityTrainingLoad", "trainingLoad"
        ),
        "vo2_max": pick(raw, "vO2MaxValue", "vo2MaxValue"),
        "aerobic_training_effect": pick(
            raw, "aerobicTrainingEffect", "trainingEffect"
        ),
        "anaerobic_training_effect": raw.get("anaerobicTrainingEffect"),
        "aerobic_training_effect_message": raw.get("aerobicTrainingEffectMessage"),
        "anaerobic_training_effect_message": raw.get("anaerobicTrainingEffectMessage"),
        "training_effect_label": raw.get("trainingEffectLabel"),
        # Self-evaluation: 0-100 on both scales, entered by hand in Connect
        # and therefore absent on most activities.
        "workout_feel": pick(raw, "directWorkoutFeel", "workoutFeel"),
        "workout_rpe": pick(raw, "directWorkoutRpe", "workoutRpe"),
        # Strength only.
        "total_sets": raw.get("totalSets"),
        "active_sets": raw.get("activeSets"),
        "total_reps": raw.get("totalReps"),
        "location_name": raw.get("locationName"),
        "start_latitude": raw.get("startLatitude"),
        "start_longitude": raw.get("startLongitude"),
        "has_polyline": raw.get("hasPolyline"),
        "lap_count": raw.get("lapCount"),
    }


def format_activity_weather(raw: dict | None) -> dict | None:
    """Normalise activity weather to metric.

    Garmin's weather endpoint reports Fahrenheit and mph regardless of the
    account's display units, and sends no unit field to disambiguate, so the
    conversion has to be unconditional.
    """
    if not raw:
        return None

    def to_celsius(f):
        return None if f is None else round((f - 32) * 5 / 9, 1)

    def to_kph(mph):
        return None if mph is None else round(mph * 1.609344, 1)

    weather_type = raw.get("weatherTypeDTO") or {}

    return {
        "temp_c": to_celsius(raw.get("temp")),
        "apparent_temp_c": to_celsius(raw.get("apparentTemp")),
        "dew_point_c": to_celsius(raw.get("dewPoint")),
        "relative_humidity": raw.get("relativeHumidity"),
        "wind_speed_kph": to_kph(raw.get("windSpeed")),
        "wind_direction_compass": raw.get("windDirectionCompassPoint"),
        "description": weather_type.get("desc"),
    }


def format_activity_details(raw: dict) -> dict:
    """Extract the route and per-point metric series from activity details.

    Garmin returns metrics as bare positional arrays plus a separate
    descriptor list mapping each index to a key, so this resolves the
    indices we care about rather than shipping the whole opaque payload.
    """
    descriptors = raw.get("metricDescriptors") or []
    index_by_key = {
        d.get("key"): d.get("metricsIndex")
        for d in descriptors
        if d.get("key") is not None and d.get("metricsIndex") is not None
    }

    # Cadence is published twice: `directRunCadence` counts one leg and
    # `directDoubleCadence` counts both, so they differ by a factor of two.
    # Both are kept rather than picked here, because which one a watch fills
    # in varies and the caller can tell them apart by which array has data.
    wanted = {
        "timestamp": "directTimestamp",
        "distance_m": "sumDistance",
        "elevation_m": "directElevation",
        "speed_mps": "directSpeed",
        "grade_adjusted_speed_mps": "directGradeAdjustedSpeed",
        "hr": "directHeartRate",
        "cadence": "directRunCadence",
        "double_cadence": "directDoubleCadence",
        "power_w": "directPower",
        "stride_length_cm": "directStrideLength",
        "vertical_oscillation_cm": "directVerticalOscillation",
        "vertical_ratio": "directVerticalRatio",
        "ground_contact_time_ms": "directGroundContactTime",
        "ground_contact_balance": "directGroundContactBalance",
        "respiration_rate": "directRespirationRate",
        "performance_condition": "directPerformanceCondition",
    }

    series: dict[str, list] = {name: [] for name in wanted}
    for point in raw.get("activityDetailMetrics") or []:
        metrics = point.get("metrics") or []
        for name, key in wanted.items():
            idx = index_by_key.get(key)
            value = metrics[idx] if idx is not None and idx < len(metrics) else None
            series[name].append(value)

    # A watch that never recorded a metric still yields a full-length array of
    # nulls, one per sample. Dropping those keeps the stored payload to the
    # metrics the activity actually has - on a strength session that is most
    # of them, and the arrays run to thousands of points.
    series = {
        name: values
        for name, values in series.items()
        if name == "timestamp" or any(v is not None for v in values)
    }

    geo = raw.get("geoPolylineDTO") or {}
    route = [
        {"lat": p.get("lat"), "lon": p.get("lon"), "alt": p.get("altitude")}
        for p in (geo.get("polyline") or [])
        if p.get("lat") is not None and p.get("lon") is not None
    ]

    return {
        "activity_id": raw.get("activityId"),
        "point_count": len(series["timestamp"]),
        "series": series,
        "route": route,
    }


def format_activity_splits(raw: dict | None) -> list[dict]:
    """Flatten Garmin's per-lap DTOs to the columns the laps table shows.

    Laps carry the same running-dynamics metrics as the activity summary but
    under yet another set of names, and a lap on a strength session carries
    almost none of them.
    """
    if not raw:
        return []

    laps = []
    for lap in raw.get("lapDTOs") or []:
        laps.append({
            "lap_index": lap.get("lapIndex"),
            "start_time_gmt": lap.get("startTimeGMT"),
            "distance_m": lap.get("distance"),
            "duration_s": lap.get("duration"),
            "moving_duration_s": lap.get("movingDuration"),
            "elapsed_duration_s": lap.get("elapsedDuration"),
            "average_speed_mps": pick(lap, "averageSpeed", "avgSpeed"),
            "max_speed_mps": lap.get("maxSpeed"),
            "avg_grade_adjusted_speed_mps": pick(
                lap, "avgGradeAdjustedSpeed", "averageGradeAdjustedSpeed"
            ),
            "elevation_gain_m": lap.get("elevationGain"),
            "elevation_loss_m": lap.get("elevationLoss"),
            "average_hr": pick(lap, "averageHR", "avgHr"),
            "max_hr": pick(lap, "maxHR", "maxHr"),
            "average_cadence": pick(
                lap, "averageRunCadence", "averageRunningCadenceInStepsPerMinute"
            ),
            "max_cadence": pick(
                lap, "maxRunCadence", "maxRunningCadenceInStepsPerMinute"
            ),
            "avg_power_w": pick(lap, "averagePower", "avgPower"),
            "max_power_w": lap.get("maxPower"),
            "normalized_power_w": pick(lap, "normalizedPower", "normPower"),
            "avg_stride_length_cm": pick(lap, "strideLength", "avgStrideLength"),
            "avg_ground_contact_time_ms": pick(
                lap, "groundContactTime", "avgGroundContactTime"
            ),
            "avg_ground_contact_balance": pick(
                lap, "groundContactBalanceLeft", "avgGroundContactBalance"
            ),
            "avg_vertical_oscillation_cm": pick(
                lap, "verticalOscillation", "avgVerticalOscillation"
            ),
            "avg_vertical_ratio": pick(lap, "verticalRatio", "avgVerticalRatio"),
            "calories": lap.get("calories"),
            "intensity_type": lap.get("intensityType"),
        })

    return laps


def format_exercise_sets(raw: dict | None) -> list[dict]:
    """Flatten a strength session's sets.

    Garmin reports weight in grams and names the movement inside a nested
    exercise list, where `name` is null for anything it recognised only by
    category (a generic "BENCH_PRESS" with no variation).
    """
    if not raw:
        return []

    sets = []
    for index, item in enumerate(raw.get("exerciseSets") or []):
        exercises = item.get("exercises") or []
        exercise = exercises[0] if exercises else {}
        weight_g = item.get("weight")

        sets.append({
            "set_index": index + 1,
            "set_type": item.get("setType"),
            "category": exercise.get("category"),
            "name": exercise.get("name"),
            "reps": item.get("repetitionCount"),
            "weight_kg": None if weight_g is None else round(weight_g / 1000, 2),
            "duration_s": item.get("duration"),
            "start_time_gmt": item.get("startTime"),
        })

    return sets


class GarminHandler(BaseHTTPRequestHandler):
    """HTTP request handler for Garmin API endpoints."""

    def log_message(self, format, *args):
        """Override to use our logger."""
        logger.info("%s - %s", self.address_string(), format % args)

    def send_json_response(self, data: Any, status: int = 200):
        """Send a JSON response."""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str, indent=2).encode())

    def send_error_response(self, message: str, status: int = 500):
        """Send an error response."""
        self.send_json_response({"error": message}, status)

    def check_auth(self) -> bool:
        """Check API key authentication."""
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return True

        # Update credentials requires admin key
        if parsed.path == "/update-credentials":
            if not config.admin_key:
                return True
            auth_header = self.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
                return token == config.admin_key
            api_key = self.headers.get("X-API-Key", "")
            return api_key == config.admin_key

        # Other endpoints don't require auth (using stored tokens)
        return True

    def do_GET(self):
        """Handle GET requests."""
        if not self.check_auth():
            self.send_error_response("Unauthorized", 401)
            return

        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        try:
            if path == "/health":
                self.send_json_response({
                    "status": "healthy",
                    "authenticated": api is not None
                })
                return

            if not api:
                self.send_error_response("Not authenticated - call /update-credentials first", 401)
                return

            if path == "/user/profile":
                success, result, error = safe_api_call(api.get_user_profile)
                self.send_json_response(result if success else {"error": error})

            elif path == "/user/name":
                success, result, error = safe_api_call(api.get_full_name)
                self.send_json_response({"name": result} if success else {"error": error})

            elif path == "/user/summary":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_user_summary, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/stats":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_stats, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/stats/body":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_stats_and_body, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/heart-rate":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_heart_rates, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/resting-heart-rate":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_resting_heart_rate, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/steps":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_steps_data, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/daily-steps":
                start_date = get_date_param(query, "start", config.week_start)
                end_date = get_date_param(query, "end", config.today)
                success, result, error = safe_api_call(
                    api.get_daily_steps, start_date.isoformat(), end_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/sleep":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_sleep_data, target_date.isoformat()
                )
                if success and result:
                    sleep_payload = format_sleep_data(result)
                    self.send_json_response(sleep_payload)
                else:
                    self.send_json_response({"error": error})

            elif path == "/hr":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_heart_rates, target_date.isoformat()
                )
                if success and result:
                    hr_payload = format_heart_rate_data(result)
                    self.send_json_response(hr_payload)
                else:
                    self.send_json_response({"error": error})

            elif path == "/hrv":
                start_date = get_date_param(query, "start", config.week_start)
                end_date = get_date_param(query, "end", config.today)
                hrv_data = []
                current = start_date
                while current <= end_date:
                    success, result, error = safe_api_call(
                        api.get_hrv_data, current.isoformat()
                    )
                    if success and result:
                        hrv_data.append({
                            "date": current.isoformat(),
                            "data": result
                        })
                    current += timedelta(days=1)
                self.send_json_response(format_hrv_data(hrv_data))

            elif path == "/rhr":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_rhr_day, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/stress":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_all_day_stress, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/body-battery":
                start_date = get_date_param(query, "start", config.week_start)
                end_date = get_date_param(query, "end", config.today)
                success, result, error = safe_api_call(
                    api.get_body_battery, start_date.isoformat(), end_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/body-composition":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_body_composition, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/weigh-ins":
                start_date = get_date_param(query, "start", config.week_start)
                end_date = get_date_param(query, "end", config.today)
                success, result, error = safe_api_call(
                    api.get_weigh_ins, start_date.isoformat(), end_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/activities":
                limit = int(query.get("limit", [10])[0])
                success, result, error = safe_api_call(api.get_activities, 0, limit)
                self.send_json_response(result if success else {"error": error})

            elif path == "/activities/last":
                success, result, error = safe_api_call(api.get_last_activity)
                self.send_json_response(result if success else {"error": error})

            elif path == "/activities/date":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_activities_fordate, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/devices":
                success, result, error = safe_api_call(api.get_devices)
                self.send_json_response(result if success else {"error": error})

            elif path == "/training-readiness":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_training_readiness, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/hrv":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_hrv_data, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/spo2":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_spo2_data, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/respiration":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_respiration_data, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/hydration":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_hydration_data, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/intensity-minutes":
                target_date = get_date_param(query, "date", config.today)
                success, result, error = safe_api_call(
                    api.get_intensity_minutes_data, target_date.isoformat()
                )
                self.send_json_response(result if success else {"error": error})

            elif path == "/goals":
                goal_type = query.get("type", ["active"])[0]
                if goal_type == "active":
                    success, result, error = safe_api_call(api.get_active_goals)
                elif goal_type == "future":
                    success, result, error = safe_api_call(api.get_future_goals)
                elif goal_type == "past":
                    success, result, error = safe_api_call(api.get_past_goals)
                else:
                    self.send_error_response("Invalid goal type", 400)
                    return
                self.send_json_response(result if success else {"error": error})

            elif path == "/badges":
                success, result, error = safe_api_call(api.get_earned_badges)
                self.send_json_response(result if success else {"error": error})

            elif path == "/personal-records":
                success, result, error = safe_api_call(api.get_personal_records)
                self.send_json_response(result if success else {"error": error})

            elif path == "/activities/range":
                # get_activities_by_date pages through Garmin 20 at a time and
                # filters by type upstream, so this stays one HTTP request even
                # for a multi-year backfill.
                start_date = get_date_param(query, "start", config.week_start)
                end_date = get_date_param(query, "end", config.today)
                activity_type = query.get("type", [None])[0]
                success, result, error = safe_api_call(
                    api.get_activities_by_date,
                    start_date.isoformat(),
                    end_date.isoformat(),
                    activity_type,
                    "asc",
                )
                if success:
                    self.send_json_response(
                        [format_activity_summary(a) for a in (result or [])]
                    )
                else:
                    self.send_error_response(error or "Failed to fetch activities")

            elif path.startswith("/activities/") and path.endswith("/details"):
                activity_id = path.split("/")[2]
                success, result, error = safe_api_call(
                    api.get_activity_details, activity_id
                )
                if success and result:
                    self.send_json_response(format_activity_details(result))
                else:
                    self.send_error_response(error or "Failed to fetch details")

            elif path.startswith("/activities/") and path.endswith("/splits"):
                activity_id = path.split("/")[2]
                success, result, error = safe_api_call(
                    api.get_activity_splits, activity_id
                )
                if success:
                    self.send_json_response({"laps": format_activity_splits(result)})
                else:
                    self.send_error_response(error or "Failed to fetch splits")

            elif path.startswith("/activities/") and path.endswith("/extras"):
                # Every part of this is a separate upstream call but they're
                # always rendered together, so they're bundled to keep the
                # first view of an activity to three round trips rather than
                # seven. Any part may be absent - indoor runs have no weather,
                # a run has no exercise sets, a strength session has no power
                # zones - which is not an error.
                activity_id = path.split("/")[2]
                weather_ok, weather, _ = safe_api_call(
                    api.get_activity_weather, activity_id
                )
                hr_ok, hr_zones, _ = safe_api_call(
                    api.get_activity_hr_in_timezones, activity_id
                )
                power_ok, power_zones, _ = safe_api_call(
                    api.get_activity_power_in_timezones, activity_id
                )
                sets_ok, exercise_sets, _ = safe_api_call(
                    api.get_activity_exercise_sets, activity_id
                )
                # The per-activity summary carries fields the list DTO omits
                # (self-evaluation, respiration, body battery impact), so it
                # backfills the stored summary on first view.
                full_ok, full, _ = safe_api_call(api.get_activity, activity_id)
                summary = None
                if full_ok and full:
                    merged = {**(full.get("summaryDTO") or {}), **full}
                    summary = format_activity_summary(merged)

                self.send_json_response({
                    "weather": format_activity_weather(weather) if weather_ok else None,
                    "hr_zones": hr_zones if hr_ok else None,
                    "power_zones": power_zones if power_ok else None,
                    "exercise_sets": (
                        format_exercise_sets(exercise_sets) if sets_ok else None
                    ),
                    "summary": summary,
                })

            else:
                self.send_error_response("Not found", 404)

        except Exception as e:
            logger.exception("Error handling request")
            self.send_error_response(str(e))

    def do_POST(self):
        """Handle POST requests."""
        if not self.check_auth():
            self.send_error_response("Unauthorized", 401)
            return

        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/update-credentials":
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data.decode())
                email = data.get('email')
                password = data.get('password')

                if not email or not password:
                    self.send_error_response("Email and password required", 400)
                    return

                logger.info(f"Updating credentials for {email}")

                # Clear existing tokens to force re-login
                tokenstore = Path(config.tokenstore)
                for f in ["oauth1_token.json", "oauth2_token.json"]:
                    token_file = tokenstore / f
                    if token_file.exists():
                        token_file.unlink()

                # Login with new credentials
                garmin = Garmin(email, password)
                token1, token2 = garmin.login("")
                garth.save(str(tokenstore))

                global api
                api = garmin

                self.send_json_response({"status": "success", "message": "Credentials updated and tokens stored"})

            except Exception as e:
                logger.exception("Failed to update credentials")
                self.send_error_response(f"Failed to update credentials: {str(e)}")
        else:
            self.send_error_response("Not found", 404)


def main():
    """Main entry point."""
    global api

    logger.info("Starting Garmin Connect Service")

    try:
        api = init_api()
    except Exception as e:
        logger.warning(f"Failed to initialize API: {e}")
        logger.info("Service starting without API - use /update-credentials to authenticate")

    server = HTTPServer(("", config.port), GarminHandler)
    logger.info(f"Server running on port {config.port}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
