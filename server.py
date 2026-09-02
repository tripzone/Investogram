#!/usr/bin/env python3
"""
Stock Dashboard server - Flask with Yahoo Finance proxy and user data API
"""

import os
import json
import time
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context

import broker_crypto
import broker_sync

app = Flask(__name__, static_folder='.')
PORT = int(os.environ.get('PORT', 8080))

# ── Server-side Yahoo Finance cache ───────────────────────────────────────────
# Key: (symbol, range, interval)  Value: (fetched_at, data)
# TTL matches the client-side cache (5 minutes).
# Each gunicorn worker holds its own copy — acceptable redundancy, no breakage.
_yahoo_cache = {}
_CACHE_TTL = 5 * 60  # seconds


def _cache_get(symbol, range_param, interval_param):
    entry = _yahoo_cache.get((symbol, range_param, interval_param))
    if entry and time.time() - entry[0] < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(symbol, range_param, interval_param, data):
    _yahoo_cache[(symbol, range_param, interval_param)] = (time.time(), data)


def _fetch_from_yahoo(symbol, range_param, interval_param):
    """Fetch one symbol from Yahoo Finance and populate the server cache."""
    yahoo_url = (
        f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
        f'?range={range_param}&interval={interval_param}&indicators=quote&includeTimestamps=true'
    )
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
    resp = requests.get(yahoo_url, headers=headers, timeout=10)
    data = resp.json()
    _cache_set(symbol, range_param, interval_param, data)
    return data

# Firebase Admin SDK - initialized when running on GCP (uses Application Default Credentials)
# Locally, set GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account key file
db = None
firebase_auth = None


def init_firebase():
    global db, firebase_auth
    try:
        import firebase_admin
        from firebase_admin import auth, firestore
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
        firebase_auth = auth
        print("Firebase initialized")
    except Exception as e:
        print(f"Firebase not initialized (no credentials): {e}")


init_firebase()


def get_uid_from_request():
    """Verify Firebase ID token from Authorization header, return uid or None."""
    if firebase_auth is None:
        return None
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header[7:]
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded['uid']
    except Exception:
        return None


# ── Yahoo Finance proxy ────────────────────────────────────────────────────────

@app.route('/api/stock/<symbol>')
def stock_proxy(symbol):
    symbol = symbol.upper()
    range_param = request.args.get('range', '1mo')
    interval_param = request.args.get('interval', '1d')
    try:
        cached = _cache_get(symbol, range_param, interval_param)
        if cached is not None:
            return jsonify(cached)
        data = _fetch_from_yahoo(symbol, range_param, interval_param)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/stocks/batch')
def stocks_batch():
    symbols_param = request.args.get('symbols', '')
    range_param = request.args.get('range', '1mo')
    interval_param = request.args.get('interval', '1d')

    symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]
    if not symbols:
        return jsonify({'error': 'No symbols provided'}), 400

    results = {}
    to_fetch = []

    # Pass 1: serve cache hits immediately
    for symbol in symbols:
        cached = _cache_get(symbol, range_param, interval_param)
        if cached is not None:
            results[symbol] = cached
        else:
            to_fetch.append(symbol)

    # Pass 2: fetch misses from Yahoo in parallel
    if to_fetch:
        def fetch_symbol(symbol):
            try:
                return symbol, _fetch_from_yahoo(symbol, range_param, interval_param)
            except Exception as e:
                return symbol, {'error': str(e)}

        with ThreadPoolExecutor(max_workers=min(len(to_fetch), 10)) as executor:
            futures = {executor.submit(fetch_symbol, sym): sym for sym in to_fetch}
            for future in as_completed(futures):
                symbol, data = future.result()
                results[symbol] = data

    return jsonify(results)


@app.route('/api/stocks/stream')
def stocks_stream():
    symbols_param = request.args.get('symbols', '')
    range_param = request.args.get('range', '1mo')
    interval_param = request.args.get('interval', '1d')

    symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]
    if not symbols:
        return jsonify({'error': 'No symbols provided'}), 400

    @stream_with_context
    def generate():
        to_fetch = []
        for symbol in symbols:
            cached = _cache_get(symbol, range_param, interval_param)
            if cached is not None:
                yield f"data: {json.dumps({'symbol': symbol, 'data': cached})}\n\n"
            else:
                to_fetch.append(symbol)

        if to_fetch:
            def fetch_one(sym):
                try:
                    return sym, _fetch_from_yahoo(sym, range_param, interval_param)
                except Exception as e:
                    return sym, {'error': str(e)}

            with ThreadPoolExecutor(max_workers=min(len(to_fetch), 10)) as executor:
                futures = {executor.submit(fetch_one, sym): sym for sym in to_fetch}
                for future in as_completed(futures):
                    sym, data = future.result()
                    yield f"data: {json.dumps({'symbol': sym, 'data': data})}\n\n"

        yield 'data: {"done":true}\n\n'

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


# ── Fundamentals cache ────────────────────────────────────────────────────────
# TTL is 1 hour — fundamentals are quarterly data, no need to refresh more often.
_fundamentals_cache = {}  # key: symbol, value: (fetched_at, data)
_FUNDAMENTALS_TTL = 60 * 60  # 1 hour

# Semaphore: limit concurrent yfinance calls to avoid Yahoo rate limiting.
# yfinance handles the crumb but Yahoo blocks rapid parallel requests.
import threading
_yf_semaphore = threading.Semaphore(4)


def _fundamentals_cache_get(symbol):
    entry = _fundamentals_cache.get(symbol)
    if entry and time.time() - entry[0] < _FUNDAMENTALS_TTL:
        return entry[1]
    return None


def _fundamentals_cache_set(symbol, data):
    _fundamentals_cache[symbol] = (time.time(), data)


def _fetch_fundamentals_yf(symbol):
    """Fetch fundamentals for one symbol via yfinance (handles Yahoo crumb automatically)."""
    import yfinance as yf
    with _yf_semaphore:
        info = yf.Ticker(symbol).info
    return {
        'trailingPE': info.get('trailingPE'),
        'forwardPE': info.get('forwardPE'),
        'dividendYield': info.get('dividendYield'),
        'profitMargin': info.get('profitMargins'),
        'revenueGrowth': info.get('revenueGrowth'),
        'earningsGrowth': info.get('earningsGrowth'),
    }


@app.route('/api/stocks/fundamentals')
def stocks_fundamentals():
    symbols_param = request.args.get('symbols', '')
    symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]
    if not symbols:
        return jsonify({'error': 'No symbols provided'}), 400

    results = {}
    to_fetch = []

    for symbol in symbols:
        cached = _fundamentals_cache_get(symbol)
        if cached is not None:
            results[symbol] = cached
        else:
            to_fetch.append(symbol)

    if to_fetch:
        def fetch_one(symbol):
            try:
                return symbol, _fetch_fundamentals_yf(symbol)
            except Exception as e:
                print(f'Fundamentals fetch failed for {symbol}: {e}')
                return symbol, {'trailingPE': None, 'forwardPE': None, 'dividendYield': None, 'profitMargin': None, 'revenueGrowth': None, 'earningsGrowth': None}

        with ThreadPoolExecutor(max_workers=min(len(to_fetch), 5)) as executor:
            futures = {executor.submit(fetch_one, sym): sym for sym in to_fetch}
            for future in as_completed(futures):
                sym, fund = future.result()
                # Only cache if we got real data — don't persist rate-limit failures
                if any(v is not None for v in fund.values()):
                    _fundamentals_cache_set(sym, fund)
                results[sym] = fund

    return jsonify(results)


# ── Stock details (comprehensive fundamentals for modal) ──────────────────────
_details_cache = {}  # key: symbol, value: (fetched_at, data)
_DETAILS_TTL = 60 * 60  # 1 hour


@app.route('/api/stock/<symbol>/details')
def stock_details(symbol):
    symbol = symbol.upper()
    entry = _details_cache.get(symbol)
    if entry and time.time() - entry[0] < _DETAILS_TTL:
        return jsonify(entry[1])

    try:
        import yfinance as yf
        info = yf.Ticker(symbol).info

        def g(key): return info.get(key)

        data = {
            'symbol': symbol,
            'longName': g('longName'),
            'sector': g('sector'),
            'industry': g('industry'),
            # Valuation
            'trailingPE': g('trailingPE'),
            'forwardPE': g('forwardPE'),
            'priceToBook': g('priceToBook'),
            'priceToSalesTrailing12Months': g('priceToSalesTrailing12Months'),
            'enterpriseToEbitda': g('enterpriseToEbitda'),
            'enterpriseToRevenue': g('enterpriseToRevenue'),
            'trailingPegRatio': g('trailingPegRatio'),
            # Profitability
            'profitMargins': g('profitMargins'),
            'grossMargins': g('grossMargins'),
            'operatingMargins': g('operatingMargins'),
            'ebitdaMargins': g('ebitdaMargins'),
            'returnOnEquity': g('returnOnEquity'),
            'returnOnAssets': g('returnOnAssets'),
            # Growth
            'revenueGrowth': g('revenueGrowth'),
            'earningsGrowth': g('earningsGrowth'),
            'earningsQuarterlyGrowth': g('earningsQuarterlyGrowth'),
            # Financial health
            'debtToEquity': g('debtToEquity'),
            'currentRatio': g('currentRatio'),
            'quickRatio': g('quickRatio'),
            'totalCash': g('totalCash'),
            'totalDebt': g('totalDebt'),
            'freeCashflow': g('freeCashflow'),
            'operatingCashflow': g('operatingCashflow'),
            # Dividends
            'dividendYield': g('dividendYield'),
            'dividendRate': g('dividendRate'),
            'payoutRatio': g('payoutRatio'),
            'fiveYearAvgDividendYield': g('fiveYearAvgDividendYield'),
            # Market & share data
            'marketCap': g('marketCap'),
            'enterpriseValue': g('enterpriseValue'),
            'beta': g('beta'),
            'sharesOutstanding': g('sharesOutstanding'),
            'floatShares': g('floatShares'),
            'shortRatio': g('shortRatio'),
            'shortPercentOfFloat': g('shortPercentOfFloat'),
            'fiftyTwoWeekHigh': g('fiftyTwoWeekHigh'),
            'fiftyTwoWeekLow': g('fiftyTwoWeekLow'),
            'fiftyDayAverage': g('fiftyDayAverage'),
            'twoHundredDayAverage': g('twoHundredDayAverage'),
            'averageVolume': g('averageVolume'),
            # Analyst
            'recommendationKey': g('recommendationKey'),
            'numberOfAnalystOpinions': g('numberOfAnalystOpinions'),
            'targetMeanPrice': g('targetMeanPrice'),
            'targetHighPrice': g('targetHighPrice'),
            'targetLowPrice': g('targetLowPrice'),
            # Per share
            'trailingEps': g('trailingEps'),
            'forwardEps': g('forwardEps'),
            'bookValue': g('bookValue'),
            'revenuePerShare': g('revenuePerShare'),
            'totalCashPerShare': g('totalCashPerShare'),
        }

        _details_cache[symbol] = (time.time(), data)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── User data API (requires Firebase auth) ─────────────────────────────────────
#
# ALLOWED_USER_DATA_KEYS mirrors auth.js's SYNC_KEYS — it's the whitelist of
# localStorage-backed keys the client is allowed to read/write here. This is a
# hard boundary: `broker_links` (which holds the encrypted SnapTrade user secret)
# must never round-trip through this generic endpoint, in either direction.

ALLOWED_USER_DATA_KEYS = {
    'stock_list', 'watchlist', 'collapsed_stocks', 'portfolio_graphs',
    'portfolio_positions', 'portfolio_positions_uploaded_at',
    'portfolio_trades', 'portfolio_trades_uploaded_at',
    'portfolio_categories', 'portfolio_categories_columns', 'portfolio_categories_uploaded_at',
    'show_values', 'portfolio_excluded_symbols', 'stock_colors',
}


@app.route('/api/user/data', methods=['GET'])
def get_user_data():
    if db is None:
        return jsonify({'error': 'Database not configured'}), 503
    uid = get_uid_from_request()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    doc = db.collection('users').document(uid).get()
    data = doc.to_dict() if doc.exists else {}
    return jsonify({k: v for k, v in data.items() if k in ALLOWED_USER_DATA_KEYS})


@app.route('/api/user/data', methods=['POST'])
def save_user_data():
    if db is None:
        return jsonify({'error': 'Database not configured'}), 503
    uid = get_uid_from_request()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    filtered = {k: v for k, v in data.items() if k in ALLOWED_USER_DATA_KEYS}
    if not filtered:
        return jsonify({'error': 'No valid keys provided'}), 400
    db.collection('users').document(uid).set(filtered, merge=True)
    return jsonify({'ok': True})


# ── Broker Sync API (SnapTrade — Questrade / Wealthsimple) ────────────────────
#
# The SnapTrade `userSecret` is encrypted (Cloud KMS, see broker_crypto.py) and
# stored under `broker_links.snaptrade_user_secret_enc` on the user's Firestore
# doc — a field that is never exposed via /api/user/data (see ALLOWED_USER_DATA_KEYS
# above). Connections themselves (which brokers, connected/disabled) are not
# cached in Firestore — /api/broker/status asks SnapTrade live, so it can never
# drift from what's actually connected.

SUPPORTED_BROKERS = {'QUESTRADE', 'WEALTHSIMPLETRADE'}


def _get_broker_secret(uid):
    """Decrypted SnapTrade userSecret for uid, or None if not yet registered."""
    doc = db.collection('users').document(uid).get()
    data = doc.to_dict() or {}
    enc = (data.get('broker_links') or {}).get('snaptrade_user_secret_enc')
    if not enc:
        return None
    return broker_crypto.decrypt_secret(enc)


def _ensure_broker_secret(uid):
    """Return the user's SnapTrade userSecret, registering them on SnapTrade first if needed."""
    secret = _get_broker_secret(uid)
    if secret:
        return secret
    secret = broker_sync.register_user(uid)
    enc = broker_crypto.encrypt_secret(secret)
    db.collection('users').document(uid).set({'broker_links': {'snaptrade_user_secret_enc': enc}}, merge=True)
    return secret


@app.route('/api/broker/connect', methods=['POST'])
def broker_connect():
    if db is None:
        return jsonify({'error': 'Database not configured'}), 503
    uid = get_uid_from_request()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    body = request.get_json() or {}
    broker = body.get('broker')
    if broker not in SUPPORTED_BROKERS:
        return jsonify({'error': 'Unsupported broker'}), 400
    try:
        secret = _ensure_broker_secret(uid)
        url = broker_sync.get_connect_url(uid, secret, broker)
        return jsonify({'url': url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/broker/sync', methods=['POST'])
def broker_sync_route():
    if db is None:
        return jsonify({'error': 'Database not configured'}), 503
    uid = get_uid_from_request()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    secret = _get_broker_secret(uid)
    if not secret:
        return jsonify({'error': 'No broker connection for this user'}), 400
    try:
        result = broker_sync.sync_all(uid, secret)
        db.collection('users').document(uid).set(
            {'broker_links': {'last_synced_at': datetime.now(timezone.utc).isoformat()}}, merge=True
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/broker/status', methods=['GET'])
def broker_status():
    if db is None:
        return jsonify({'error': 'Database not configured'}), 503
    uid = get_uid_from_request()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    try:
        secret = _get_broker_secret(uid)
        if not secret:
            return jsonify({'connections': [], 'last_synced_at': None})
        connections = broker_sync.list_connections(uid, secret)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    doc = db.collection('users').document(uid).get()
    last_synced_at = ((doc.to_dict() or {}).get('broker_links') or {}).get('last_synced_at')
    return jsonify({'connections': connections, 'last_synced_at': last_synced_at})


@app.route('/api/broker/disconnect', methods=['POST'])
def broker_disconnect():
    if db is None:
        return jsonify({'error': 'Database not configured'}), 503
    uid = get_uid_from_request()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    body = request.get_json() or {}
    connection_id = body.get('connection_id')
    if not connection_id:
        return jsonify({'error': 'connection_id required'}), 400
    secret = _get_broker_secret(uid)
    if not secret:
        return jsonify({'error': 'No broker connection for this user'}), 400
    try:
        broker_sync.disconnect(uid, secret, connection_id)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Prompt loader ─────────────────────────────────────────────────────────────

def load_prompt(name, **kwargs):
    path = os.path.join(os.path.dirname(__file__), 'prompts', f'{name}.txt')
    with open(path) as f:
        return f.read().format(**kwargs)


# ── Portfolio AI analysis ──────────────────────────────────────────────────────

def _init_gemini():
    try:
        from google import genai
        client = genai.Client(vertexai=True, project='investogram-d995a', location='us-central1')
        print("Gemini initialized via google-genai")
        return client
    except Exception as e:
        print(f"Gemini not initialized: {e}")
        return None

_gemini_client = _init_gemini()


@app.route('/api/analyze', methods=['POST'])
def analyze_portfolio():
    if _gemini_client is None:
        return jsonify({'error': 'AI analysis not available'}), 503

    body = request.get_json()
    if not body:
        return jsonify({'error': 'No data provided'}), 400

    positions = body.get('positions', [])
    if not positions:
        return jsonify({'error': 'No positions data'}), 400

    prompt = load_prompt('portfolio_analysis', positions=json.dumps(positions, indent=2))

    try:
        response = _gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )
        return jsonify({'analysis': response.text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Stock AI analysis ─────────────────────────────────────────────────────────


@app.route('/api/ai/stock-analysis', methods=['POST'])
def analyze_stocks():
    if _gemini_client is None:
        return jsonify({'error': 'AI analysis not available'}), 503

    body = request.get_json()
    if not body:
        return jsonify({'error': 'No data provided'}), 400

    stocks = body.get('stocks', [])
    if not stocks:
        return jsonify({'error': 'No stocks provided'}), 400

    portfolio = body.get('portfolio', [])

    prompt = load_prompt(
        'stock_analysis',
        stocks=json.dumps(stocks, indent=2),
        portfolio=json.dumps(portfolio, indent=2) if portfolio else 'None provided'
    )

    try:
        from google.genai import types
        response = _gemini_client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )
        )
        try:
            text = response.text
        except Exception:
            text = None
        if not text:
            print(f"[AI] Empty or blocked response from Gemini: finish_reason={getattr(response.candidates[0] if response.candidates else None, 'finish_reason', 'unknown')}")
            return jsonify({'error': 'Empty response from AI model'}), 500
        text = text.strip()
        # Strip markdown code fences if present
        if text.startswith('```'):
            text = text.split('\n', 1)[1]
            text = text.rsplit('```', 1)[0].strip()
        # Extract the outermost JSON object — Google Search grounding can add
        # surrounding prose even when the prompt says "return ONLY valid JSON"
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and start < end:
            text = text[start:end + 1]
        result = json.loads(text)
        return jsonify(result)
    except json.JSONDecodeError as e:
        print(f"[AI] JSON parse error: {e}\nText was: {text[:500] if 'text' in dir() else 'unknown'}")
        return jsonify({'error': f'Failed to parse AI response: {e}'}), 500
    except Exception as e:
        print(f"[AI] Unexpected error in analyze_stocks: {type(e).__name__}: {e}")
        return jsonify({'error': str(e)}), 500


# ── Static file serving ────────────────────────────────────────────────────────

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):
    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    print(f"Starting server on port {PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
