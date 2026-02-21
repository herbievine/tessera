# Garmin Connect Service

A standalone Python service for accessing Garmin Connect data via REST API.

## Base URL

```
http://localhost:3011
```

## Authentication

All endpoints (except `/health`) require an API key via header:

```bash
# Option 1: X-API-Key header
curl -H "X-API-Key: your-api-key" http://localhost:3011/endpoint

# Option 2: Bearer token
curl -H "Authorization: Bearer your-api-key" http://localhost:3011/endpoint
```

## Endpoints

---

### Health Check

```
GET /health
```

Returns service health status. No authentication required.

**Response:**
```json
{
  "status": "healthy"
}
```

---

### Sleep Data

```
GET /sleep
GET /sleep?date=YYYY-MM-DD
```

Retrieves sleep data for a specific date.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date` | string | No | Today | Date in YYYY-MM-DD format |

**Response:**
```json
{
  "date": "2026-02-21",
  "sleep_score": 85,
  "quality": "GOOD",
  "total_seconds": 28800,
  "total_hours": 8.0,
  "deep_seconds": 7200,
  "deep_hours": 2.0,
  "light_seconds": 14400,
  "light_hours": 4.0,
  "rem_seconds": 5400,
  "rem_hours": 1.5,
  "awake_seconds": 1800,
  "awake_hours": 0.5,
  "restless_seconds": 900,
  "restless_percentage": 3.1,
  "awake_count": 2,
  "timeseries": []
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `sleep_score` | integer? | Garmin sleep score (0-100) |
| `quality` | string? | Sleep quality rating |
| `total_seconds` | integer | Total sleep time in seconds |
| `total_hours` | float | Total sleep time in hours |
| `deep_seconds/hours` | integer/float | Deep sleep duration |
| `light_seconds/hours` | integer/float | Light sleep duration |
| `rem_seconds/hours` | integer/float | REM sleep duration |
| `awake_seconds/hours` | integer/float | Time awake |
| `restless_seconds` | integer? | Restless time in seconds |
| `restless_percentage` | float? | Percentage of restless sleep |
| `awake_count` | integer | Number of times awake |

---

### Heart Rate

```
GET /hr
GET /hr?date=YYYY-MM-DD
```

Retrieves heart rate data including per-minute timeseries.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date` | string | No | Today | Date in YYYY-MM-DD format |

**Response:**
```json
{
  "date": "2026-02-21",
  "resting_hr": 48,
  "max_hr": 87,
  "min_hr": 45,
  "avg_hr": 62,
  "timeseries": [
    {
      "time": "2026-02-20T23:00:00",
      "bpm": 51
    },
    {
      "time": "2026-02-20T23:02:00",
      "bpm": 52
    }
  ]
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Calendar date |
| `resting_hr` | integer? | Resting heart rate (RHR) |
| `max_hr` | integer? | Maximum heart rate |
| `min_hr` | integer? | Minimum heart rate |
| `avg_hr` | float? | Average heart rate |
| `timeseries` | array | Array of {time, bpm} objects |

---

### Heart Rate Variability

```
GET /hrv
GET /hrv?start=YYYY-MM-DD&end=YYYY-MM-DD
```

Retrieves HRV data for a date range. Returns daily summaries.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `start` | string | No | 7 days ago | Start date (YYYY-MM-DD) |
| `end` | string | No | Today | End date (YYYY-MM-DD) |

**Response:**
```json
{
  "period": {
    "start": "2026-02-15",
    "end": "2026-02-21"
  },
  "data": [
    {
      "date": "2026-02-21",
      "data": {
        "hrvSummary": {
          "calendarDate": "2026-02-21",
          "weeklyAvg": 65,
          "lastNightAvg": 58,
          "lastNight5MinHigh": 76,
          "baseline": {
            "lowUpper": 58,
            "balancedLow": 61,
            "balancedUpper": 73
          },
          "status": "BALANCED",
          "feedbackPhrase": "HRV_BALANCED_3"
        },
        "hrvReadings": [
          {
            "hrvValue": 56,
            "readingTimeGMT": "2026-02-20T20:39:05.0",
            "readingTimeLocal": "2026-02-20T21:39:05.0"
          }
        ]
      }
    }
  ]
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `weeklyAvg` | integer | 7-day average HRV |
| `lastNightAvg` | integer | Last night's average HRV |
| `lastNight5MinHigh` | integer | Highest 5-min average |
| `status` | string | HRV status (BALANCED, LOW, HIGH) |
| `hrvReadings` | array | Individual HRV readings |

---

### Resting Heart Rate

```
GET /rhr
GET /rhr?date=YYYY-MM-DD
```

Retrieves resting heart rate for a specific date.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `date` | string | No | Today | Date in YYYY-MM-DD format |

**Response:**
```json
{
  "userProfileId": 116894578,
  "statisticsStartDate": "2026-02-21",
  "statisticsEndDate": "2026-02-21",
  "allMetrics": {
    "metricsMap": {
      "WELLNESS_RESTING_HEART_RATE": [
        {
          "value": 48.0,
          "calendarDate": "2026-02-21"
        }
      ]
    }
  }
}
```

---

### User Profile

```
GET /user/profile
```

Returns Garmin user profile information.

---

### User Name

```
GET /user/name
```

Returns user's full name.

**Response:**
```json
{
  "name": "John Doe"
}
```

---

### Daily Summary

```
GET /user/summary
GET /user/summary?date=YYYY-MM-DD
```

Returns daily activity summary including steps, calories, distance, etc.

---

### Activity Stats

```
GET /stats
GET /stats?date=YYYY-MM-DD
```

Returns detailed activity statistics for a day.

---

### Body Stats

```
GET /stats/body
GET /stats/body?date=YYYY-MM-DD
```

Returns stats and body composition data.

---

### Steps

```
GET /steps
GET /steps?date=YYYY-MM-DD
```

Returns steps data for a specific date.

---

### Daily Steps

```
GET /daily-steps
GET /daily-steps?start=YYYY-MM-DD&end=YYYY-MM-DD
```

Returns daily steps history for a date range.

---

### Stress

```
GET /stress
GET /stress?date=YYYY-MM-DD
```

Returns stress level data.

---

### Body Battery

```
GET /body-battery
GET /body-battery?start=YYYY-MM-DD&end=YYYY-MM-DD
```

Returns body battery data for a date range.

---

### Body Composition

```
GET /body-composition
GET /body-composition?date=YYYY-MM-DD
```

Returns body composition data (weight, body fat, etc.).

---

### Weigh-ins

```
GET /weigh-ins
GET /weigh-ins?start=YYYY-MM-DD&end=YYYY-MM-DD
```

Returns weight measurements for a date range.

---

### Activities

```
GET /activities
GET /activities?limit=10
```

Returns recent activities. Default limit is 10.

---

### Last Activity

```
GET /activities/last
```

Returns the most recent activity.

---

### Activities by Date

```
GET /activities/date
GET /activities/date?date=YYYY-MM-DD
```

Returns activities for a specific date.

---

### Devices

```
GET /devices
```

Returns connected Garmin devices.

---

### Training Readiness

```
GET /training-readiness
GET /training-readiness?date=YYYY-MM-DD
```

Returns training readiness score.

---

### SpO2

```
GET /spo2
GET /spo2?date=YYYY-MM-DD
```

Returns blood oxygen (SpO2) data.

---

### Respiration

```
GET /respiration
GET /respiration?date=YYYY-MM-DD
```

Returns respiration data.

---

### Hydration

```
GET /hydration
GET /hydration?date=YYYY-MM-DD
```

Returns hydration data.

---

### Intensity Minutes

```
GET /intensity-minutes
GET /intensity-minutes?date=YYYY-MM-DD
```

Returns intensity minutes data.

---

### Goals

```
GET /goals
GET /goals?type=active|future|past
```

Returns goals. Types: `active`, `future`, `past`.

---

### Badges

```
GET /badges
```

Returns earned badges.

---

### Personal Records

```
GET /personal-records
```

Returns personal records.

---

## Configuration

Environment variables (see `.env.example`):

| Variable | Description |
|----------|-------------|
| `GARMIN_EMAIL` | Garmin account email |
| `GARMIN_PASSWORD` | Garmin account password |
| `GARMINTOKENS` | Path to token storage (default: `/data/.garminconnect`) |
| `PORT` | Server port (default: 3011) |
| `API_KEY` | API key for authentication |

## Docker

```bash
# Build
docker build -t garmin-service ./garmin-service

# Run
docker run -p 3011:3011 --env-file garmin-service/.env -v garmin-tokens:/data garmin-service

# Or via docker-compose
docker compose up garmin
```
