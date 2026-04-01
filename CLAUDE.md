# Claude Rules — Investogram

> Keep this file up to date. Any time infrastructure, deployment process, connected services, or app structure changes, update this document immediately.

---

## What This App Is

**Investogram** is a personal investment portfolio dashboard with two views:
- **Stocks**: Real-time stock quotes with price charts, moving averages, and drag-drop reordering
- **Portfolio**: Analytics from uploaded CSVs — asset allocation, trading activity, category breakdowns

Single-user focused. Designed for personal use with optional Google sign-in for cross-device sync.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Backend | Python 3.11 + Flask |
| Database | Google Firestore (Firebase) |
| Auth | Firebase Authentication (Google Sign-In) |
| Charts | Chart.js v4.4.0 + chartjs-chart-financial |
| Stock Data | Yahoo Finance (unofficial API, proxied via Flask) |
| AI Analysis | Google Gemini via `google-cloud-aiplatform` SDK (ADC auth, Vertex AI) |
| Containerization | Docker |
| Hosting | Google Cloud Run |

---

## Infrastructure

### Google Cloud Run
- Hosts the Flask server as a containerized service
- Region: `us-central1`, Port: `8080`, `--allow-unauthenticated` (app-level auth via Firebase)
- Uses Application Default Credentials (ADC) — no `serviceAccountKey.json` needed in the container

### Firebase / Firestore
- Project: `investogram-d995a`, Auth Domain: `investogram-d995a.firebaseapp.com`
- Stores per-user data synced from localStorage (stocks, portfolio graphs, CSVs, preferences)
- Firestore path: `users/{uid}` — single document per user

### Gemini AI (Google Generative AI)
- Used for AI-powered stock analysis in the Tracking tab
- SDK: `google-cloud-aiplatform` Python package (already in `requirements.txt`)
- Auth: Application Default Credentials (ADC) — same as Firestore, no API key needed
- Locally: ADC from `serviceAccountKey.json` via `GOOGLE_APPLICATION_CREDENTIALS`
- On Cloud Run: ADC via service account — must have `Vertex AI User` role in GCP IAM
- Flask route: `POST /api/ai/analyze` — accepts stocks + portfolio context, returns JSON keyed by symbol
- **Never use an API key** — always authenticate via ADC

### Yahoo Finance (External API)
- Provides stock price data (OHLC, historical)
- Flask proxies requests to `query1.finance.yahoo.com` to avoid CORS
- **Unofficial API** — no auth required, but could break if Yahoo changes it. 500ms delay between requests.

### Firebase Authentication
- Provider: Google Sign-In (popup)
- Client SDK: Firebase compat v10.8.0 (loaded via CDN in `index.html`)
- Sign-in is optional — app works as a guest
- Syncs: `stock_list`, `portfolio_graphs`, positions, trades, categories, `show_values`

---

## Deployment

### Production (Google Cloud Run)

```bash
gcloud run deploy investogram \
    --source . \
    --region us-central1 \
    --allow-unauthenticated
```

`--source .` handles everything: builds the Docker image via Cloud Build, pushes to Artifact Registry, and deploys. No manual Docker build/push needed.

**Firebase credentials on Cloud Run**: The Cloud Run service account must have `Cloud Datastore User` (or Firebase Admin) role in GCP IAM. ADC handles auth automatically — never deploy `serviceAccountKey.json` to the container.

Files excluded from build: see `.gcloudignore`.

### Local Development

```bash
./start.sh              # Start server, open browser (interactive)
./start-background.sh   # Start server in background
./stop-server.sh        # Stop background server
```

Runs on port `8080`. Requires `serviceAccountKey.json` in the project root for Firebase access (set via `GOOGLE_APPLICATION_CREDENTIALS` in `start.sh`).

---

## Key Files

| File | Purpose |
|---|---|
| `server.py` | Flask backend — Yahoo proxy, Firestore user data API, static file serving |
| `app.js` | Main frontend logic — state, rendering, charts, drag-drop |
| `api.js` | Yahoo Finance integration — request queue, caching, data parsing |
| `auth.js` | Firebase auth — Google sign-in, localStorage sync to Firestore |
| `index.html` | App shell — tabs, modals, CDN script tags |
| `styles.css` | All styling — dark theme, responsive layout |
| `firebase-config.js` | Firebase client config — **gitignored, real credentials** |
| `serviceAccountKey.json` | Firebase service account key — **gitignored, local dev only** |
| `Dockerfile` | Container definition — Python 3.11-slim, port 8080 |
| `requirements.txt` | Python deps: flask, requests, firebase-admin |

---

## Credentials & Secrets

| Secret | Where it lives | Used by |
|---|---|---|
| `firebase-config.js` | Local file (gitignored) | Browser — Firebase client SDK |
| `serviceAccountKey.json` | Local file (gitignored) | Local dev — Flask backend Firebase Admin |
| GCP Service Account (ADC) | GCP IAM | Cloud Run — Flask backend Firebase Admin |

**Never commit `firebase-config.js` or `serviceAccountKey.json`.**

---

## Data Flow

```
Browser
  ├── Stock data: fetch /api/stock/<symbol>
  │     └── Flask proxies to Yahoo Finance → returns OHLC JSON
  ├── User data read: GET /api/user/data (Bearer token)
  │     └── Flask verifies Firebase ID token → reads Firestore
  ├── User data write: POST /api/user/data (Bearer token)
  │     └── Flask verifies Firebase ID token → writes Firestore
  └── Static files: GET /
        └── Flask serves index.html + assets from working directory
```

---

## Client-Side State

### localStorage Keys

```
stock_list                      Array of symbols (e.g. ["AAPL", "GOOGL:2"])
portfolio_graphs                Array of {id, width} graph objects
portfolio_positions             Uploaded positions CSV data
portfolio_trades                Uploaded trades CSV data
portfolio_categories            Uploaded categories CSV data
portfolio_categories_columns    Detected category column names
show_values                     Boolean — show/hide $ amounts in tooltips
*_uploaded_at                   ISO timestamps for each uploaded dataset
```

### Firestore Schema

```
users/
  {uid}/
    stock_list
    portfolio_graphs
    portfolio_positions
    portfolio_trades
    portfolio_categories
    portfolio_categories_columns
    show_values
    *_uploaded_at
```

---

## Rules

- **All Chart.js instances must have `animation: false`** — see `CHART_RULES.md`
- Yahoo Finance is an unofficial API — if stock data breaks, it's likely a Yahoo-side change
- `firebase-config.js` and `serviceAccountKey.json` are gitignored and must never be committed
- Update this file immediately when infrastructure, deployment, or app structure changes
