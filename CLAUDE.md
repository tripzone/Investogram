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
| Broker Sync | SnapTrade (aggregator for Questrade + Wealthsimple), via `snaptrade-python-sdk` |
| Secret encryption | Google Cloud KMS (encrypts each user's SnapTrade secret at rest) |
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

### SnapTrade (Broker Sync — Questrade / Wealthsimple)
- Aggregator used by the Portfolio tab's "Broker Sync" feature to link a user's Questrade or
  Wealthsimple account and pull positions/trade activity automatically, instead of a manual CSV
  export/upload.
- Questrade connects via true OAuth (SnapTrade never sees the Questrade password). Wealthsimple
  connects via **Login Credentials** entered directly into SnapTrade's Connection Portal — there
  is no official Wealthsimple API, so this path is disclosed differently in the UI.
- Connections are always requested as **read**-scope — never `trade`.
- Backend: `broker_sync.py` wraps the SnapTrade Python SDK (register user, get a Connection
  Portal URL, list connections, pull positions/activities, disconnect). `server.py` exposes this
  via `/api/broker/connect`, `/api/broker/sync`, `/api/broker/status`, `/api/broker/disconnect`
  (all require a Firebase Bearer token).
- Credentials: `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY` env vars (see `broker-secrets.sh`
  below). SnapTrade has no ADC-style auth, so unlike Gemini/Firestore this integration
  unavoidably uses a static API key pair.
- Billing: SnapTrade charges per *connected user* (~$1–2/month), not per broker connection or
  per sync call — a user with both Questrade and Wealthsimple linked still counts as one.
- **Known TODO, not yet built**: nothing currently disables a SnapTrade connection for a user
  who stops using Investogram, so an abandoned connection keeps accruing the per-user charge
  indefinitely. Planned fix: a scheduled Cloud Function that finds users inactive ~30 days
  (Firebase Auth Admin SDK's `lastSignInTime`) and removes their SnapTrade connection.

### Cloud KMS (Broker Secret Encryption)
- Encrypts the SnapTrade `userSecret` (one per Investogram user who has connected a broker)
  before it's stored in Firestore. `broker_crypto.py` calls Cloud KMS's symmetric encrypt/decrypt
  directly (the secret is small enough that envelope encryption isn't needed) — the key itself
  never leaves KMS, only ciphertext is ever persisted.
- Key resource name comes from the `BROKER_KMS_KEY_NAME` env var. Create the key ring/key once via:
  ```bash
  gcloud kms keyrings create broker-sync --location us-central1
  gcloud kms keys create snaptrade-user-secret --location us-central1 \
      --keyring broker-sync --purpose encryption
  ```
- The Cloud Run service account needs `roles/cloudkms.cryptoKeyEncrypterDecrypter` on this key.

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
| `server.py` | Flask backend — Yahoo proxy, Firestore user data API, Broker Sync routes, static file serving |
| `broker_sync.py` | SnapTrade SDK wrapper — register user, connect URL, list connections, map positions/activities into CSV-parity rows |
| `broker_crypto.py` | Cloud KMS encrypt/decrypt helpers for the stored SnapTrade user secret |
| `app.js` | Main frontend logic — state, rendering, charts, drag-drop, Broker Sync UI |
| `api.js` | Yahoo Finance integration — request queue, caching, data parsing |
| `auth.js` | Firebase auth — Google sign-in, localStorage sync to Firestore |
| `index.html` | App shell — tabs, modals, CDN script tags |
| `styles.css` | All styling — dark theme, responsive layout |
| `firebase-config.js` | Firebase client config — **gitignored, real credentials** |
| `serviceAccountKey.json` | Firebase service account key — **gitignored, local dev only** |
| `broker-secrets.sh` | SnapTrade + Cloud KMS env vars — **gitignored, real credentials**; template at `broker-secrets.example.sh` |
| `Dockerfile` | Container definition — Python 3.11-slim, port 8080 |
| `requirements.txt` | Python deps: flask, requests, firebase-admin, google-cloud-kms, snaptrade-python-sdk |

---

## Credentials & Secrets

| Secret | Where it lives | Used by |
|---|---|---|
| `firebase-config.js` | Local file (gitignored) | Browser — Firebase client SDK |
| `serviceAccountKey.json` | Local file (gitignored) | Local dev — Flask backend Firebase Admin |
| GCP Service Account (ADC) | GCP IAM | Cloud Run — Flask backend Firebase Admin |
| `SNAPTRADE_CLIENT_ID` / `SNAPTRADE_CONSUMER_KEY` | `broker-secrets.sh` locally (gitignored) / Cloud Run env-secret in prod | Flask backend — SnapTrade API auth |
| `BROKER_KMS_KEY_NAME` | `broker-secrets.sh` locally / Cloud Run env in prod | Flask backend — encrypts/decrypts each user's SnapTrade secret |
| Per-user SnapTrade `userSecret` | Firestore `users/{uid}.broker_links.snaptrade_user_secret_enc`, encrypted via Cloud KMS | Flask backend only — never exposed via `/api/user/data` |

**Never commit `firebase-config.js`, `serviceAccountKey.json`, or `broker-secrets.sh`.**

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
  ├── Broker Sync: POST /api/broker/connect | /sync | /disconnect, GET /api/broker/status
  │     └── Flask verifies Firebase ID token → SnapTrade API (Questrade/Wealthsimple data)
  │         → maps into CSV-parity rows → browser reconciles into portfolio_positions/trades
  └── Static files: GET /
        └── Flask serves index.html + assets from working directory
```

---

## Client-Side State

### localStorage Keys

```
stock_list                      Array of symbols (e.g. ["AAPL", "GOOGL:2"])
portfolio_graphs                Array of {id, width} graph objects
portfolio_positions             Positions rows — see "Row provenance" below
portfolio_trades                Trade rows — see "Row provenance" below
portfolio_categories            Uploaded categories CSV data
portfolio_categories_columns    Detected category column names
show_values                     Boolean — show/hide $ amounts in tooltips
*_uploaded_at                   ISO timestamps for each dataset (upload or sync)
```

**Row provenance (`portfolio_positions` / `portfolio_trades`)**: each row carries a `source`
field — `'csv'`, `'synced'`, or `'manual'` (manual entry not built yet). Synced trade rows also
carry `broker` (the account's institution name); synced position rows don't, since positions are
aggregated across every connected account/broker for the same symbol+currency, so no single
`broker` value would be accurate. `Dashboard.reconcilePortfolioData(type, rows, source)`
(`app.js`) is the only write path:
it replaces just the rows matching that `source`, leaving rows from every other source
untouched, so uploading a CSV never wipes broker-synced data and vice versa. Rows saved before
this field existed have no `source` and are treated as `'csv'`.

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
    broker_links.snaptrade_user_secret_enc   Cloud KMS-encrypted SnapTrade userSecret
    broker_links.last_synced_at              ISO timestamp of last broker sync
```

`broker_links` is written/read only by the `/api/broker/*` routes — `/api/user/data` explicitly
excludes it (see `ALLOWED_USER_DATA_KEYS` in `server.py`), so it never reaches the browser. Which
brokers are connected is not cached here; `/api/broker/status` asks SnapTrade live.

---

## Rules

- **All Chart.js instances must have `animation: false`** — see `CHART_RULES.md`
- Yahoo Finance is an unofficial API — if stock data breaks, it's likely a Yahoo-side change
- `firebase-config.js`, `serviceAccountKey.json`, and `broker-secrets.sh` are gitignored and must
  never be committed
- Broker Sync data is never destructive: `portfolio_positions`/`portfolio_trades` writes always
  go through `reconcilePortfolioData`, which only replaces rows matching the given `source` —
  never add a direct `localStorage.setItem('portfolio_positions', ...)` / `'portfolio_trades'`
  call that bypasses it, or CSV/synced/manual data can silently clobber each other
- Update this file immediately when infrastructure, deployment, or app structure changes

### Known TODOs

- **Inactive-user SnapTrade cleanup**: SnapTrade bills ~$1–2/month per connected user regardless
  of activity. Nothing currently disables a broker connection for a user who stops using
  Investogram. Planned: a scheduled Cloud Function (Cloud Scheduler → Cloud Run job) that finds
  users inactive ~30 days (Firebase Auth Admin SDK's `lastSignInTime`) and calls SnapTrade to
  remove their connection, clearing `broker_links` accordingly. Needs care so a returning user
  reconnects cleanly.
