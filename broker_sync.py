"""
broker_sync.py - SnapTrade client wrapper and row mapping for Broker Sync.

Talks to SnapTrade (https://snaptrade.com) to let a signed-in Investogram user link
their Questrade / Wealthsimple account(s) and pull positions + trade activity into
the same row shape CSV upload already produces (see app.js parseCSV / the
`portfolio_positions` / `portfolio_trades` schema).

Field names below are verified against the installed snaptrade-python-sdk (13.x)
source, not guessed from docs:
  - AccountPosition (get_all_account_positions): instrument.{kind,symbol}, units,
    price, cost_basis, currency - all returned as strings.
  - AccountUniversalActivity (get_account_activities): id, symbol.symbol.symbol
    (ticker, already Yahoo-style exchange-suffixed, e.g. "SHOP.TO"), type, trade_date,
    currency.code, units, price, amount.
  - Account (list_user_accounts): id, institution_name.
"""

import os

_client = None


def _get_client():
    global _client
    if _client is None:
        from snaptrade_client import SnapTrade, SnapTradeAuth
        consumer_key = os.environ.get('SNAPTRADE_CONSUMER_KEY')
        client_id = os.environ.get('SNAPTRADE_CLIENT_ID')
        if not consumer_key or not client_id:
            raise RuntimeError('SNAPTRADE_CONSUMER_KEY / SNAPTRADE_CLIENT_ID not configured')
        _client = SnapTrade(
            auth=SnapTradeAuth.commercial_api_key(consumer_key=consumer_key, client_id=client_id)
        )
    return _client


# ── User registration & connect ────────────────────────────────────────────────

def register_user(uid):
    """Register a new SnapTrade user for this Investogram uid. Returns the plaintext userSecret."""
    client = _get_client()
    resp = client.authentication.register_snap_trade_user(user_id=uid)
    return resp.body['userSecret']


def get_connect_url(uid, user_secret, broker):
    """Get a Connection Portal URL for the user to link a specific broker (read-only scope)."""
    client = _get_client()
    resp = client.authentication.login_snap_trade_user(
        user_id=uid,
        user_secret=user_secret,
        broker=broker,
        connection_type='read',
    )
    return resp.body['redirectURI']


def delete_user(uid):
    """Fully delete the SnapTrade user (all connections/accounts removed on their side)."""
    client = _get_client()
    client.authentication.delete_snap_trade_user(user_id=uid)


# ── Connections / status ───────────────────────────────────────────────────────

def list_connections(uid, user_secret):
    """Return [{id, broker, brokerage_name, disabled}] for all of this user's connections.
    `broker` is the SnapTrade slug (e.g. "QUESTRADE") — the same value passed to
    get_connect_url — so the frontend can match a connection back to a broker row
    without fuzzy-matching display names."""
    client = _get_client()
    resp = client.connections.list_brokerage_authorizations(user_id=uid, user_secret=user_secret)
    out = []
    for auth in (resp.body or []):
        brokerage = auth.get('brokerage') or {}
        out.append({
            'id': auth.get('id'),
            'broker': brokerage.get('slug'),
            'brokerage_name': brokerage.get('name'),
            'disabled': bool(auth.get('disabled')),
        })
    return out


def disconnect(uid, user_secret, connection_id):
    """Remove a single brokerage connection."""
    client = _get_client()
    client.connections.delete_connection(connection_id=connection_id, user_id=uid, user_secret=user_secret)


# ── Sync: positions + trades ───────────────────────────────────────────────────

_INCLUDED_INSTRUMENT_KINDS = {'stock', 'etf', 'adr', 'cef', 'mutualfund'}
_ACTIVITY_TYPE_MAP = {'BUY': 'buy', 'SELL': 'sell', 'DIVIDEND': 'dividend'}


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _map_positions(raw_positions):
    """raw_positions: list of AccountPosition dicts (one account's positions/all response)."""
    rows = []
    for pos in raw_positions:
        instrument = pos.get('instrument') or {}
        if instrument.get('kind') not in _INCLUDED_INSTRUMENT_KINDS:
            continue
        symbol = instrument.get('symbol')
        units = _to_float(pos.get('units'))
        cost_basis = _to_float(pos.get('cost_basis'))
        currency = pos.get('currency')
        if not symbol or units is None or cost_basis is None or not currency:
            continue
        rows.append({
            'symbol': symbol,
            'quantity': units,
            'average_entry_price': cost_basis,
            'total_cost': units * cost_basis,
            'currency': currency,
        })
    return rows


def _aggregate_positions(rows):
    """Sum quantity/total_cost across accounts+brokers for the same symbol+currency."""
    grouped = {}
    for row in rows:
        key = (row['symbol'], row['currency'])
        if key not in grouped:
            grouped[key] = {'symbol': row['symbol'], 'currency': row['currency'], 'quantity': 0.0, 'total_cost': 0.0}
        grouped[key]['quantity'] += row['quantity']
        grouped[key]['total_cost'] += row['total_cost']
    out = []
    for g in grouped.values():
        avg_price = (g['total_cost'] / g['quantity']) if g['quantity'] else 0
        out.append({
            'symbol': g['symbol'],
            'quantity': g['quantity'],
            'average_entry_price': avg_price,
            'total_cost': g['total_cost'],
            'currency': g['currency'],
        })
    return out


def _map_activities(raw_activities, broker_name):
    """raw_activities: list of AccountUniversalActivity dicts (already filtered to BUY/SELL/DIVIDEND
    server-side via the `type` query param). Unlike positions (aggregated across accounts/brokers,
    so no single `broker` value would be meaningful), each trade comes from exactly one account, so
    it's tagged with that account's institution name."""
    rows = []
    for act in raw_activities:
        mapped_type = _ACTIVITY_TYPE_MAP.get((act.get('type') or '').upper())
        if not mapped_type:
            continue
        symbol_obj = ((act.get('symbol') or {}).get('symbol') or {})
        symbol = symbol_obj.get('symbol')
        currency_obj = act.get('currency') or {}
        if not symbol or not currency_obj.get('code'):
            continue
        rows.append({
            'transaction_date': act.get('trade_date'),
            'symbol': symbol,
            'type': mapped_type,
            'currency': currency_obj.get('code'),
            'quantity': _to_float(act.get('units')),
            'price': _to_float(act.get('price')),
            'net_amount': _to_float(act.get('amount')),
            'broker': broker_name,
        })
    return rows


def sync_all(uid, user_secret, history_days=730):
    """Pull positions + trade activity across every connected account/broker.

    Returns {'positions': [...], 'trades': [...]} in the exact row shape CSV upload
    produces (see reconcilePortfolioData in app.js), each row still missing the
    `source`/`broker` tags - those are added by the frontend on reconcile.
    """
    import datetime

    client = _get_client()
    accounts_resp = client.account_information.list_user_accounts(user_id=uid, user_secret=user_secret)
    accounts = accounts_resp.body or []

    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=history_days)

    all_position_rows = []
    all_trade_rows = []

    for account in accounts:
        account_id = account.get('id')
        if not account_id:
            continue
        broker_name = account.get('institution_name')

        positions_resp = client.account_information.get_all_account_positions(
            account_id=account_id, user_id=uid, user_secret=user_secret,
        )
        all_position_rows.extend(_map_positions(positions_resp.body.get('results', [])))

        offset = 0
        page_size = 1000
        while True:
            activities_resp = client.account_information.get_account_activities(
                account_id=account_id, user_id=uid, user_secret=user_secret,
                start_date=start_date, end_date=end_date,
                type='BUY,SELL,DIVIDEND', limit=page_size, offset=offset,
            )
            page = activities_resp.body.get('data', [])
            all_trade_rows.extend(_map_activities(page, broker_name))
            if len(page) < page_size:
                break
            offset += page_size

    return {
        'positions': _aggregate_positions(all_position_rows),
        'trades': all_trade_rows,
    }
