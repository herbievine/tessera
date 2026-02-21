# Garmin Connect Service

A standalone Python service for accessing Garmin Connect data.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the service:
   ```bash
   python main.py
   ```

## Docker

```bash
docker build -t garmin-service .
docker run -p 3011:3011 --env-file .env -v garmin-tokens:/data garmin-service
```

## API Endpoints

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /health` | Health check | - |
| `GET /user/profile` | User profile | - |
| `GET /user/name` | Full name | - |
| `GET /user/summary` | Daily summary | `date` (YYYY-MM-DD) |
| `GET /stats` | Activity stats | `date` |
| `GET /stats/body` | Stats + body composition | `date` |
| `GET /heart-rate` | Heart rate data | `date` |
| `GET /resting-heart-rate` | Resting heart rate | `date` |
| `GET /steps` | Steps data | `date` |
| `GET /daily-steps` | Daily steps history | `start`, `end` |
| `GET /sleep` | Sleep data | `date` |
| `GET /stress` | Stress data | `date` |
| `GET /body-battery` | Body battery | `start`, `end` |
| `GET /body-composition` | Body composition | `date` |
| `GET /weigh-ins` | Weight measurements | `start`, `end` |
| `GET /activities` | Recent activities | `limit` |
| `GET /activities/last` | Last activity | - |
| `GET /activities/date` | Activities by date | `date` |
| `GET /devices` | Connected devices | - |
| `GET /training-readiness` | Training readiness | `date` |
| `GET /hrv` | Heart rate variability | `date` |
| `GET /spo2` | SpO2 data | `date` |
| `GET /respiration` | Respiration data | `date` |
| `GET /hydration` | Hydration data | `date` |
| `GET /intensity-minutes` | Intensity minutes | `date` |
| `GET /goals` | Goals | `type` (active/future/past) |
| `GET /badges` | Earned badges | - |
| `GET /personal-records` | Personal records | - |

## Authentication

The service uses token-based authentication. On first login, provide your Garmin credentials via environment variables. Tokens are stored in `GARMINTOKENS` directory for subsequent logins.

If `API_KEY` is set, requests must include either:
- `Authorization: Bearer <api-key>` header
- `X-API-Key: <api-key>` header

## Token Storage

Tokens are stored in the directory specified by `GARMINTOKENS` (default: `/data/.garminconnect`). This should be a persistent volume in Docker deployments.
