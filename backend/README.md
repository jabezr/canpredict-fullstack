# CanPredict AI Weather — Backend

A FastAPI backend that wraps free, open weather/geocoding providers so
the CanPredict frontend never talks to a third-party API directly —
and, notably, **you never need to sign up for anything or provide a
credit card** to run this. Every provider used here is keyless.

```
frontend/ (index.html, pg2.html, pg3.html, pg4.html, prediction.html)
        │  fetch()
        ▼
FastAPI Backend  (backend/, this folder)
        │  httpx (async, cached, retried)
        ▼
Open-Meteo (weather, geocoding, air quality)
OpenStreetMap Nominatim (reverse geocoding)
        │
        ▼
Clean JSON  →  back to the frontend
```

The frontend's `weather-data.js` is the **only** place that knows the
backend's base URL — every page still calls the same `WeatherApp.*`
functions it always did, they just now `await` a real network call
instead of generating synthetic data.

---

## 1. Folder structure

```
project-root/
├── backend/
│   ├── app.py                     FastAPI app, CORS, error handlers, health check
│   ├── config.py                  Settings loaded from environment variables
│   ├── routes/
│   │   ├── weather.py             /weather/current, /hourly, /daily, /insights, /search, /location
│   │   └── prediction.py          /prediction
│   ├── services/
│   │   ├── weather_service.py     Open-Meteo + Nominatim calls + response shaping
│   │   └── prediction_service.py  Rule-based "AI" prediction + insights text
│   ├── models/
│   │   └── schemas.py             Pydantic response models (the clean JSON contract)
│   ├── utils/
│   │   ├── http_client.py         Shared httpx.AsyncClient + retry/backoff
│   │   ├── cache.py                In-memory TTL cache
│   │   ├── condition_map.py       WMO weather code → frontend icon id
│   │   ├── metrics.py             AQI/UV/wind-direction/date-time helper math
│   │   └── logger.py              Consistent logging setup
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md                  (this file)
├── frontend/
│   ├── index.html, pg2.html, pg3.html, pg4.html, prediction.html
│   └── weather-data.js            Async client for this backend (see §4)
└── .vscode/
    ├── launch.json
    └── tasks.json
```

---

## 2. Setup

### 2.1 No account, no API key, no credit card needed

This backend uses:

- **[Open-Meteo](https://open-meteo.com)** for current weather, hourly/daily
  forecasts, geocoding (city name → coordinates), and air quality/UV —
  free for non-commercial use up to 10,000 calls/day, no sign-up.
- **[OpenStreetMap Nominatim](https://nominatim.openstreetmap.org)** for
  reverse geocoding (coordinates → city name, used by the "Current
  Location" button) — free, no sign-up, but its usage policy requires a
  descriptive `User-Agent` header (already set in `config.py` /
  `.env.example` — customize `NOMINATIM_USER_AGENT` if you like) and a
  soft limit of 1 request/second, which the app's caching keeps you well
  under.

You can skip straight to installing dependencies — there is no key to
go and generate first.

### 2.2 Install dependencies

From the project root (the folder that **contains** `backend/`):

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 2.3 Configure environment variables (optional)

```bash
cp backend/.env.example backend/.env
```

Nothing in `.env` is required to get running — the defaults in
`backend/config.py` work out of the box. You'd typically only edit this
to change the CORS-allowed origins (if serving the frontend from a port
other than the ones already listed) or the default city. `backend/config.py`
explicitly checks two locations, in order, and uses whichever exists:
`backend/.env` (recommended — keeps it next to the code that reads it)
or `<project root>/.env`. Pick one and be consistent; don't create both.

### 2.4 Run the server

From the project root:

```bash
uvicorn backend.app:app --reload
```

The API is now at `http://127.0.0.1:8000`. Interactive docs (Swagger UI)
are automatically available at `http://127.0.0.1:8000/docs`.

---

## 3. Endpoints

All endpoints accept **either** `city=` **or** `lat=` & `lon=`. If neither
is given, they fall back to `DEFAULT_CITY` / `DEFAULT_LAT` / `DEFAULT_LON`
from `.env`.

| Method | Path                | Purpose                                            |
|--------|---------------------|-----------------------------------------------------|
| GET    | `/`                 | Health check                                        |
| GET    | `/weather/current`  | Current conditions                                   |
| GET    | `/weather/hourly`   | Next 24 hours (`?hours=` 1–48)                       |
| GET    | `/weather/daily`    | Next 7 days (`?days=` 1–16)                          |
| GET    | `/weather/insights` | AQI, UV, pressure, dew point + lifestyle advice      |
| GET    | `/weather/search`   | Current conditions for `?city=` (required)           |
| GET    | `/weather/location` | Current conditions for `?lat=` & `?lon=` (required)  |
| GET    | `/prediction`       | Tomorrow's AI-assisted prediction                     |

### Example: `GET /weather/current?city=Chennai`

```json
{
  "city": "Chennai",
  "country": "IN",
  "lat": 13.0827,
  "lon": 80.2707,
  "temperature": 31.4,
  "feels_like": 35.2,
  "condition": "Partly Cloudy",
  "condition_icon": "icon-partly-cloudy",
  "humidity": 72,
  "wind_speed": 14.4,
  "wind_direction": "SE",
  "pressure": 1008,
  "visibility": 10.0,
  "cloud_cover": 40,
  "uv_index": 7.2,
  "uv_label": "High",
  "sunrise": "5:58 AM",
  "sunset": "6:12 PM",
  "moonrise": "--",
  "moonset": "--",
  "air_quality": {
    "aqi": 58,
    "label": "Moderate",
    "pm2_5": 14.2,
    "pm10": 22.1,
    "o3": 31.0,
    "co": 210.4,
    "no2": 12.7,
    "so2": 4.1
  },
  "updated_at": "2:45 PM"
}
```

`moonrise`/`moonset` are always `"--"` — moon data isn't available from
these free, keyless providers. Every other field is live.

### Example: `GET /prediction?city=Chennai`

```json
{
  "city": "Chennai",
  "country": "IN",
  "confidence": 88,
  "confidence_label": "High",
  "rain_probability": 70,
  "storm_probability": 41,
  "recommendation": "Carry an umbrella and plan outdoor activities around the rain window.",
  "risk_level": "Moderate",
  "condition": "Rain",
  "condition_icon": "icon-rain",
  "temp_min": 26.0,
  "temp_max": 32.0
}
```

Try any endpoint with curl:

```bash
curl "http://127.0.0.1:8000/weather/current?city=London"
curl "http://127.0.0.1:8000/weather/hourly?city=Chennai&hours=12"
curl "http://127.0.0.1:8000/weather/daily?lat=13.0827&lon=80.2707"
curl "http://127.0.0.1:8000/weather/insights?city=Mumbai"
curl "http://127.0.0.1:8000/prediction?city=Delhi"
```

### Error format

Every error (validation, upstream failure, city not found, rate limit,
etc.) returns:

```json
{ "detail": "human-readable message" }
```

with an appropriate status code (400/404/429/500/502/503) — the raw
upstream error body is never passed through.

---

## 4. Frontend integration

`weather-data.js` now calls the backend instead of generating synthetic
data. Nothing in any `.html` file's markup, CSS, or layout changed — only
the `<script>` sections that consumed `WeatherApp.*` were updated to
`await` the now-async functions (fetching real data is inherently
asynchronous, whereas the old synthetic generator was instant/synchronous).

**Set the backend URL** — no need to, actually. The top of `weather-data.js`
now auto-detects it from the page's own address:

```js
var API_BASE_URL = (function () {
    var isHttp = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    return isHttp ? window.location.origin : 'http://127.0.0.1:8000';
})();
```

**Option A — single server (recommended):** `app.py` mounts `frontend/`
as static files on the same port as the API, so you only need to run
uvicorn — no separate frontend server, no second port, no CORS to worry
about (same-origin requests don't need it), and the frontend correctly
finds the backend no matter what address you load the page from:

```bash
uvicorn backend.app:app --reload
```

then open `http://127.0.0.1:8000/` — that's it, this serves `index.html`
directly. `http://127.0.0.1:8000/pg2.html`, `/pg3.html`, etc. all work the
same way.

**Accessing it from your phone / another device on the same WiFi:** since
the auto-detected URL just mirrors whatever address loaded the page, this
works automatically too — you only need the server reachable beyond your
own machine:

```bash
uvicorn backend.app:app --reload --host 0.0.0.0
```

Find your PC's LAN IP (Windows: `ipconfig`, look for "IPv4 Address" under
your active adapter, e.g. `192.168.1.42`; Mac/Linux: `ifconfig` or `ip a`),
then on your phone (same WiFi network) open `http://<that-IP>:8000/` —
e.g. `http://192.168.1.42:8000/`. If it doesn't connect, your OS firewall
is almost certainly blocking incoming connections on port 8000 — on
Windows you'll usually get a popup asking to allow it the first time you
run with `--host 0.0.0.0`; say yes, or add the rule manually via Windows
Defender Firewall → Allow an app through firewall.

**Option B — two separate servers**, e.g. if you want frontend
live-reload tooling independent of the backend. Since the frontend would
then be on a different port than the backend, auto-detection no longer
applies — **manually set `API_BASE_URL`** at the top of `weather-data.js`
to the backend's actual address first:

```bash
cd frontend
python -m http.server 8080
```

then open `http://127.0.0.1:8080/index.html`. Make sure whichever port
you use is listed in `backend/.env`'s `CORS_ORIGINS` (`8080` already is,
by default).

Every function on `window.WeatherApp` keeps its original name and
purpose, but the data-fetching ones are now `async`:

| Function                                   | Backend endpoint       |
|---------------------------------------------|-------------------------|
| `WeatherApp.getCityData(locationDescriptor)`  | `/weather/daily`        |
| `WeatherApp.generateHourly(location, day)`   | `/weather/hourly`       |
| `WeatherApp.generateMetrics(location, day)`  | `/weather/current`      |
| `WeatherApp.generateInsights(...)`           | `/weather/insights`     |
| `WeatherApp.generatePrediction(...)`         | `/prediction`           |
| `WeatherApp.store.setCity(query)`            | `/weather/search`       |
| `WeatherApp.store.setCustomLocation(...)`    | `/weather/location`     |

If a request fails (no internet, backend down, unknown city), the
affected page shows a small inline error/retry state rather than
silently falling back to fake numbers — see each page's `renderAll`
"catch" branch.

---

## 5. Performance & reliability

- **Async everywhere** — every route and service function is `async def`;
  a single shared `httpx.AsyncClient` is reused across requests (connection
  pooling) instead of opening a new connection per call.
- **Caching** — an in-memory TTL cache avoids re-hitting Open-Meteo/Nominatim
  on every page load/refresh, and keeps well under Nominatim's 1
  request/second usage policy. Geocoding results are cached the longest
  (a city's coordinates don't change), current/forecast data for a few
  minutes. See `CACHE_TTL_*` in `.env`.
- **Retries** — transient failures (timeouts, connection errors, 5xx) are
  retried with exponential backoff (`MAX_RETRIES`, `RETRY_BACKOFF_SECONDS`);
  4xx errors (not found, bad request) are not retried since retrying
  won't fix them.
- **Timeouts** — every upstream call has a hard timeout (`REQUEST_TIMEOUT_SECONDS`)
  so a slow provider can't hang a request indefinitely.

---

## 6. Security

- There is no API key to leak — Open-Meteo and Nominatim are both keyless.
  `.env` still exists for CORS origins, defaults, and the Nominatim
  `User-Agent` string, none of which are secrets.
- CORS is restricted to an explicit allow-list (`CORS_ORIGINS`), not `*`.
- Only `GET` is exposed — this API doesn't accept writes.
- Raw upstream responses are never proxied through — only the shaped
  Pydantic models defined in `models/schemas.py` ever leave the server.

---

## 7. Attribution

Both data providers this backend uses require attribution for their free
tiers:

- **Open-Meteo** — weather, geocoding, and air-quality data — licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit
  "Weather data by Open-Meteo.com" wherever you display this app publicly.
- **OpenStreetMap Nominatim** — reverse geocoding — data licensed
  [ODbL](https://opendatacommons.org/licenses/odbl/). Credit
  "© OpenStreetMap contributors" wherever reverse-geocoded location names
  are displayed.

For a class project or local demo this is just good practice; for any
public deployment, add a small credit line in the UI footer.

---

## 8. Future AI

`services/prediction_service.py` is intentionally isolated from
`weather_service.py` specifically so a real trained model can be dropped
in later: replace the body of `generate_prediction()` with a call to a
loaded model's `.predict()` (e.g. a scikit-learn/PyTorch model trained on
historical forecast-accuracy data), while keeping the same
`PredictionResponse` return shape — no route, service caller, or frontend
code would need to change.

---

## 9. Running from VSCode

`.vscode/launch.json` and `.vscode/tasks.json` (project root) are included
so you don't have to type commands by hand:

1. Install the **Python** extension (ms-python.python) if you don't have it.
2. Open the **project root** folder in VSCode — the one containing
   `.vscode/`, `backend/`, and `frontend/` as siblings — not `backend/`
   or `frontend/` individually.
3. Command Palette → **"Tasks: Run Task"** → **"Run App (single server,
   recommended)"** — starts uvicorn on `:8000`, serving both the API and
   the frontend.
4. Open `http://127.0.0.1:8000/` in your browser.
5. To set breakpoints in the backend: **Run and Debug** panel → select
   **"Backend: FastAPI (uvicorn)"** → press ▶. This serves everything on
   `:8000` too, under the debugger.

Only need the frontend on its own separate port for some reason (e.g.
independent live-reload tooling)? Use the **"Run Backend + Frontend
(separate servers)"** task/launch-compound instead — starts uvicorn on
`:8000` *and* a static file server on `:8080` side by side. Not needed
for normal use.

## 10. Running everything together (terminal)

**Single server (recommended):**

```bash
cd project-root
source venv/bin/activate
uvicorn backend.app:app --reload
```

Open `http://127.0.0.1:8000/`. Done — no second terminal needed.

**Two separate servers** (only if you specifically want the frontend on
its own port):

```bash
# Terminal 1 — backend (run from the project root, the folder that
# contains backend/ and frontend/ as siblings)
cd project-root
source venv/bin/activate
uvicorn backend.app:app --reload

# Terminal 2 — frontend
cd project-root/frontend
python -m http.server 8080
```

Then open `http://127.0.0.1:8080/index.html` in your browser.
