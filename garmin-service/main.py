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

    levels = dto.get("sleepLevels", {})

    return {
        "date": dto.get("sleepStartTimeGMT", ""),
        "sleep_score": dto.get("sleepScore"),
        "quality": dto.get("sleepQuality"),
        "total_seconds": dto.get("sleepTimeSeconds"),
        "total_hours": round(dto.get("sleepTimeSeconds", 0) / 3600, 1),
        "deep_seconds": dto.get("deepSleepSeconds"),
        "deep_hours": round(dto.get("deepSleepSeconds", 0) / 3600, 1),
        "light_seconds": dto.get("lightSleepSeconds"),
        "light_hours": round(dto.get("lightSleepSeconds", 0) / 3600, 1),
        "rem_seconds": dto.get("remSleepSeconds"),
        "rem_hours": round(dto.get("remSleepSeconds", 0) / 3600, 1),
        "awake_seconds": dto.get("awakeSleepSeconds"),
        "awake_hours": round(dto.get("awakeSleepSeconds", 0) / 3600, 1),
        "restless_seconds": dto.get("restlessSeconds"),
        "restless_percentage": dto.get("restlessPeriodsPercentage"),
        "awake_count": dto.get("awakeCount"),
        "dasd": dto,
        "timeseries": levels.get("deep", []) + levels.get("light", []) + levels.get("rem", []) + levels.get("awake", [])
    }


def format_heart_rate_data(raw: dict) -> dict:
    """Format heart rate data into per-minute timeseries."""
    heart_rates = raw.get("heartRateValues", [])

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
        "avg_hr": raw.get("averageHeartRate"),
        "timeseries": timeseries
    }


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

        if not api:
            self.send_error_response("API not initialized", 503)
            return

        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        try:
            if path == "/health":
                self.send_json_response({"status": "healthy"})

            elif path == "/user/profile":
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
                self.send_json_response({"period": {"start": start_date.isoformat(), "end": end_date.isoformat()}, "data": hrv_data})

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
        logger.error(f"Failed to initialize API: {e}")
        sys.exit(1)

    server = HTTPServer(("", config.port), GarminHandler)
    logger.info(f"Server running on port {config.port}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
