// idb-cache.js - IndexedDB-backed persistence for large, best-effort chart/fundamentals
// caches (weekly OHLC, fundamentals, portfolio performance price history).
//
// These caches used to live in localStorage, which is capped at ~5MB per origin on every
// browser (desktop and mobile) and was getting filled entirely by these caches, causing
// real writes (portfolio data, broker sync) to fail with QuotaExceededError. IndexedDB has
// a vastly larger quota on every platform, so caches persisted here don't compete with the
// app's actual synced data for that 5MB budget.
//
// Must load before api.js and app.js.

const IDB_DB_NAME = 'investogram-cache';
const IDB_DB_VERSION = 1;
const IDB_STORES = ['weekly', 'fundamentals', 'perf'];

let _idbPromise = null;

function openCacheDB() {
    if (!window.indexedDB) return Promise.resolve(null);
    if (_idbPromise) return _idbPromise;

    _idbPromise = new Promise((resolve) => {
        const req = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            IDB_STORES.forEach(name => {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
            });
        };
        req.onsuccess = () => resolve(req.result);
        // If IndexedDB is unavailable (e.g. locked-down private browsing), degrade to a
        // no-op cache rather than breaking the app — same best-effort philosophy already
        // used for localStorage quota errors elsewhere in the codebase.
        req.onerror = () => resolve(null);
    });
    return _idbPromise;
}

async function idbGet(store, key) {
    const db = await openCacheDB();
    if (!db) return undefined;
    return new Promise((resolve) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
    });
}

async function idbSet(store, key, value) {
    const db = await openCacheDB();
    if (!db) return;
    return new Promise((resolve) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
    });
}

// Returns a Map of every entry in `store` (used to warm an in-memory cache at startup).
async function idbGetAll(store) {
    const result = new Map();
    const db = await openCacheDB();
    if (!db) return result;
    return new Promise((resolve) => {
        const objStore = db.transaction(store, 'readonly').objectStore(store);
        const keysReq = objStore.getAllKeys();
        const valuesReq = objStore.getAll();
        keysReq.onerror = () => resolve(result);
        valuesReq.onerror = () => resolve(result);
        valuesReq.onsuccess = () => {
            const keys = keysReq.result || [];
            const values = valuesReq.result || [];
            keys.forEach((k, i) => result.set(k, values[i]));
            resolve(result);
        };
    });
}

// ── One-time cleanup: the old localStorage-backed caches (wk_*, fund2_*, fund_* legacy,
// perf_price_cache, perf_weekly_price_cache_10y) are replaced by the IndexedDB stores
// above. Purge them once per browser so existing users immediately get their 5MB back —
// none of it is real data, it's all derived chart/fundamentals data that just gets
// refetched into IndexedDB lazily as symbols are viewed again.
(function pruneLegacyLocalStorageCaches() {
    try {
        if (localStorage.getItem('_cache_migration_v1') === '1') return;
        const exact = new Set(['perf_price_cache', 'perf_weekly_price_cache_10y']);
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key.startsWith('wk_') || key.startsWith('fund2_') || key.startsWith('fund_') || exact.has(key)) {
                toRemove.push(key);
            }
        }
        toRemove.forEach(k => localStorage.removeItem(k));
        localStorage.setItem('_cache_migration_v1', '1');
    } catch (_) { /* best-effort */ }
})();
