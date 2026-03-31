#!/usr/bin/env python3
"""
Stock Dashboard server - Flask with Yahoo Finance proxy and user data API
"""

import os
import json
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify, send_from_directory

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


# ── User data API (requires Firebase auth) ─────────────────────────────────────

@app.route('/api/user/data', methods=['GET'])
def get_user_data():
    if db is None:
        return jsonify({'error': 'Database not configured'}), 503
    uid = get_uid_from_request()
    if not uid:
        return jsonify({'error': 'Unauthorized'}), 401
    doc = db.collection('users').document(uid).get()
    return jsonify(doc.to_dict() if doc.exists else {})


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
    db.collection('users').document(uid).set(data, merge=True)
    return jsonify({'ok': True})


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
