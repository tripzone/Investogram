#!/usr/bin/env python3
"""
Stock Dashboard server - Flask with Yahoo Finance proxy and user data API
"""

import os
import requests
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder='.')
PORT = int(os.environ.get('PORT', 8080))

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
    range_param = request.args.get('range', '1mo')
    interval_param = request.args.get('interval', '1d')
    yahoo_url = (
        f'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'
        f'?range={range_param}&interval={interval_param}&indicators=quote&includeTimestamps=true'
    )
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    try:
        resp = requests.get(yahoo_url, headers=headers, timeout=10)
        return resp.content, resp.status_code, {'Content-Type': 'application/json'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
