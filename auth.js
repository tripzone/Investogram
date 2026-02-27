// auth.js - Firebase Authentication + Cloud Storage Sync
//
// Requires firebase-config.js to be loaded first (see index.html).
// Copy firebase-config.example.js → firebase-config.js and fill in your values.
//
// Sign-in is OPTIONAL. Users can dismiss the overlay and use the app as a guest.
// When signed in, data is synced to Firebase (via server) in real time.

// localStorage keys that get synced to the server per user.
// Anything not in this list stays local-only (caches, UI state, etc.)
const SYNC_KEYS = [
    'stock_list',
    'collapsed_stocks',
    'portfolio_graphs',
    'portfolio_positions',
    'portfolio_positions_uploaded_at',
    'portfolio_trades',
    'portfolio_trades_uploaded_at',
    'portfolio_categories',
    'portfolio_categories_columns',
    'portfolio_categories_uploaded_at',
    'show_values',
];

// ── Firebase init ──────────────────────────────────────────────────────────────

firebase.initializeApp(FIREBASE_CONFIG);
const firebaseAuth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUser = null;
let syncTimer = null;
// Default to guest mode — overlay is not shown on startup; user opens it manually
let guestMode = true;

async function getAuthToken() {
    if (!currentUser) return null;
    return currentUser.getIdToken();
}

// ── Server sync ────────────────────────────────────────────────────────────────

async function pullFromServer() {
    const token = await getAuthToken();
    if (!token) return;

    // Snapshot guest-session data before server overwrites it
    const guestStocks = JSON.parse(localStorage.getItem('stock_list') || '[]');
    const guestGraphs = JSON.parse(localStorage.getItem('portfolio_graphs') || '[]');

    try {
        const resp = await fetch('/api/user/data', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!resp.ok) return;

        const data = await resp.json();

        // Server data wins on sign-in — populate localStorage
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null) {
                const stored = typeof value === 'string' ? value : JSON.stringify(value);
                // Bypass our patched setItem to avoid triggering a sync-back
                _originalSetItem(key, stored);
            }
        }

        // Merge guest additions into server data (additive — no duplicates, nothing lost)
        let needsPush = false;

        // Stocks: union by ticker string
        if (guestStocks.length > 0) {
            const serverStocks = JSON.parse(localStorage.getItem('stock_list') || '[]');
            const serverSet = new Set(serverStocks);
            const newStocks = guestStocks.filter(t => !serverSet.has(t));
            if (newStocks.length > 0) {
                _originalSetItem('stock_list', JSON.stringify([...serverStocks, ...newStocks]));
                console.log(`[auth] Merged ${newStocks.length} guest stock(s) into account`);
                needsPush = true;
            }
        }

        // Graphs: union by graph id
        if (guestGraphs.length > 0) {
            const serverGraphs = JSON.parse(localStorage.getItem('portfolio_graphs') || '[]');
            const serverIds = new Set(serverGraphs.map(g => (typeof g === 'string' ? g : g.id)));
            const newGraphs = guestGraphs.filter(g => !serverIds.has(typeof g === 'string' ? g : g.id));
            if (newGraphs.length > 0) {
                _originalSetItem('portfolio_graphs', JSON.stringify([...serverGraphs, ...newGraphs]));
                console.log(`[auth] Merged ${newGraphs.length} guest graph(s) into account`);
                needsPush = true;
            }
        }

        if (needsPush) {
            // Push merged result up so other devices see the guest additions too
            await pushToServer();
        }

        console.log('[auth] Loaded user data from server');
    } catch (e) {
        console.error('[auth] Failed to pull from server:', e);
    }
}

async function pushToServer() {
    const token = await getAuthToken();
    if (!token) return;

    // Collect all sync keys into one payload
    const payload = {};
    for (const key of SYNC_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
            try { payload[key] = JSON.parse(raw); } catch { payload[key] = raw; }
        }
    }

    try {
        await fetch('/api/user/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error('[auth] Failed to push to server:', e);
    }
}

function schedulePush() {
    // Debounce: wait 1 s after the last change before pushing
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushToServer, 1000);
}

// ── localStorage monkey-patch ──────────────────────────────────────────────────
// Intercepts every setItem call so we don't need to touch app.js

const _originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
    _originalSetItem(key, value);
    if (currentUser && SYNC_KEYS.includes(key)) {
        schedulePush();
    }
};

// Also intercept removeItem so deletions are synced immediately
const _originalRemoveItem = localStorage.removeItem.bind(localStorage);
localStorage.removeItem = function (key) {
    _originalRemoveItem(key);
    if (currentUser && SYNC_KEYS.includes(key)) {
        schedulePush();
    }
};

// ── Auth UI helpers ────────────────────────────────────────────────────────────

function showAuthOverlay() {
    document.getElementById('authOverlay').classList.remove('hidden');
    document.getElementById('authError').textContent = '';
    document.getElementById('signInHeaderBtn').style.display = 'none';
}

function hideAuthOverlay() {
    document.getElementById('authOverlay').classList.add('hidden');
}

function setSignedInState(user) {
    document.getElementById('userEmail').textContent = user.displayName || user.email;
    document.getElementById('signOutBtn').classList.remove('auth-state-hidden');
    document.getElementById('signInHeaderBtn').style.display = 'none';
}

function setSignedOutState() {
    document.getElementById('userEmail').textContent = '';
    document.getElementById('signOutBtn').classList.add('auth-state-hidden');
    document.getElementById('signInHeaderBtn').style.display = 'flex';
}

// ── Auth state observer ────────────────────────────────────────────────────────

firebaseAuth.onAuthStateChanged(async (user) => {
    currentUser = user;

    if (user) {
        hideAuthOverlay();
        setSignedInState(user);

        // Pull saved data then refresh the dashboard
        await pullFromServer();
        if (window.dashboard) {
            window.dashboard.stockList = window.dashboard.loadStockList();
            window.dashboard.portfolioGraphs = window.dashboard.loadPortfolioGraphs();
            window.dashboard.renderAllStocks();
            window.dashboard.renderPortfolioGraphs();
            window.dashboard.updateDataIndicators();
        }
    } else {
        setSignedOutState();
        if (!guestMode) {
            showAuthOverlay();
        }
    }
});

// ── Auth UI handlers ───────────────────────────────────────────────────────────

document.getElementById('signInWithGoogleBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = '';
    try {
        await firebaseAuth.signInWithPopup(googleProvider);
    } catch (e) {
        // Don't show an error when the user simply closes the popup
        if (e.code !== 'auth/popup-closed-by-user') {
            errorEl.textContent = e.message;
        }
    }
});

document.getElementById('signOutBtn').addEventListener('click', () => {
    // After signing out, stay in guest mode — don't show the overlay again
    guestMode = true;
    firebaseAuth.signOut();
});

// "Continue without signing in" — dismiss the overlay and use the app as a guest
document.getElementById('skipAuthBtn').addEventListener('click', () => {
    guestMode = true;
    hideAuthOverlay();
    setSignedOutState();
});

// Header "Sign In" button — re-open the overlay
document.getElementById('signInHeaderBtn').addEventListener('click', () => {
    showAuthOverlay();
});
