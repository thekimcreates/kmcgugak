"use strict";

(() => {
    const CACHE_PREFIX = "kmc-shared-data-v2:";
    const memory = new Map();
    const pending = new Map();
    const subscribers = new Map();

    function cacheKey(key) {
        return `${CACHE_PREFIX}${key}`;
    }

    function readEntry(key) {
        if (memory.has(key)) return memory.get(key);
        try {
            const raw = localStorage.getItem(cacheKey(key));
            if (!raw) return null;
            const entry = JSON.parse(raw);
            memory.set(key, entry);
            return entry;
        } catch (_) {
            return null;
        }
    }

    function cachedValue(key) {
        return readEntry(key)?.value ?? null;
    }

    function notify(key, value) {
        subscribers.get(key)?.forEach((listener) => {
            try {
                listener(value);
            } catch (error) {
                console.error(`KMC shared-store listener failed for ${key}:`, error);
            }
        });
    }

    function writeCache(key, value) {
        const entry = { value, savedAt: Date.now() };
        memory.set(key, entry);
        try {
            localStorage.setItem(cacheKey(key), JSON.stringify(entry));
        } catch (_) {
            // Safari private browsing and storage limits can disable localStorage.
        }
        notify(key, value);
        return value;
    }

    function stableStringify(value) {
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
        if (value && typeof value === "object") {
            return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
        }
        return JSON.stringify(value);
    }

    function changed(previous, next) {
        return stableStringify(previous) !== stableStringify(next);
    }

    function requestOnce(key, loader) {
        if (pending.has(key)) return pending.get(key);
        const request = Promise.resolve()
            .then(loader)
            .finally(() => pending.delete(key));
        pending.set(key, request);
        return request;
    }

    function requireDatabase() {
        const db = window.kmcFirebase?.db;
        if (!db) throw new Error("Firebase is unavailable.");
        return db;
    }

    async function getFreshSnapshot(reference) {
        try {
            // Never wait for IndexedDB initialization before a live read. This is
            // especially important on macOS Safari, where persistence startup can
            // stall and keep an old snapshot visible indefinitely.
            return await reference.get({ source: "server" });
        } catch (serverError) {
            try {
                // Offline fallback remains available on browsers with a usable
                // Firestore cache. macOS Safari normally reaches this only offline.
                return await reference.get({ source: "cache" });
            } catch (_) {
                throw serverError;
            }
        }
    }

    function getDocument(key, collectionName, documentId) {
        return requestOnce(key, async () => {
            const reference = requireDatabase().collection(collectionName).doc(documentId);
            const snapshot = await getFreshSnapshot(reference);
            const value = snapshot.exists ? snapshot.data() : null;
            writeCache(key, value);
            return value;
        });
    }

    function getCollection(key, buildQuery, mapDocument = (document) => ({ id: document.id, ...document.data() })) {
        return requestOnce(key, async () => {
            const collection = requireDatabase().collection(buildQuery.collection);
            const query = typeof buildQuery.configure === "function"
                ? buildQuery.configure(collection)
                : collection;
            const snapshot = await getFreshSnapshot(query);
            const value = snapshot.docs.map(mapDocument);
            writeCache(key, value);
            return value;
        });
    }

    function subscribe(key, listener, { emitCached = true } = {}) {
        if (!subscribers.has(key)) subscribers.set(key, new Set());
        subscribers.get(key).add(listener);
        if (emitCached) {
            const value = cachedValue(key);
            if (value !== null) listener(value);
        }
        return () => {
            const listeners = subscribers.get(key);
            listeners?.delete(listener);
            if (!listeners?.size) subscribers.delete(key);
        };
    }

    const api = {
        cachedValue,
        changed,
        writeCache,
        subscribe,
        getHomeContent: () => getDocument("home-content", "siteContent", "homeSections"),
        getArrangements: () => getDocument("arrangements", "siteContent", "arrangements"),
        getTeam: () => getDocument("team", "siteContent", "team"),
        getPerformances: () => getCollection(
            "performances",
            {
                collection: "performances",
                configure: (collection) => collection.orderBy("date", "desc")
            }
        ),
        getHomePerformances: () => getCollection(
            "home-performance-candidates-v1",
            {
                collection: "performances",
                configure: (collection) => collection.orderBy("date", "desc")
            },
            (document) => ({ id: document.id, data: document.data() })
        ),
        getLatestPerformances: (limit = 2) => getCollection(
            `latest-performances-${limit}`,
            {
                collection: "performances",
                configure: (collection) => collection.orderBy("date", "desc").limit(limit)
            },
            (document) => ({ id: document.id, data: document.data() })
        )
    };

    window.KMCDataStore = Object.freeze(api);
})();
