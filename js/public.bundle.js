/* KMC Samulnori production bundle — generated 2026-07-25 */

/* ===== config.js ===== */
"use strict";

/*
 * KMC Samulnori deployment configuration
 *
 * This file is loaded before firebase.js and maps-loader.js.
 * Browser API keys are visible to visitors, so restrict the Google Maps
 * key by website/referrer and API in Google Cloud Console.
 */
window.KMC_CONFIG = Object.freeze({
    googleMapsApiKey: "AIzaSyD-MVpD9Qvsag1sJKHblNsBdQXZDXPTbMI",

    firebase: Object.freeze({
        apiKey: "AIzaSyClVxcqLellscu9ZOCuU0kW8odixzxAy9E",
        authDomain: "kmc-samulnori.firebaseapp.com",
        projectId: "kmc-samulnori",
        storageBucket: "kmc-samulnori.firebasestorage.app",
        messagingSenderId: "699194804568",
        appId: "1:699194804568:web:ce1f50a1a728c78d52bd2d"
    })
});

/* ===== firebase.js ===== */
"use strict";

(() => {
    const config = window.KMC_CONFIG?.firebase;

    const isConfigured =
        config &&
        Object.values(config).every((value) => {
            const text = String(value || "");
            return text && !text.includes("YOUR_") && !text.includes("PASTE_YOUR");
        });

    if (!isConfigured || typeof firebase === "undefined") {
        console.warn("KMC Firebase configuration is missing or Firebase failed to load.");
        window.kmcFirebase = {
            auth: null,
            db: null,
            storage: null,
            persistenceReady: Promise.resolve(false),
            persistenceEnabled: false
        };
        return;
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(config);
    }

    const auth = typeof firebase.auth === "function" ? firebase.auth() : null;
    const db = typeof firebase.firestore === "function" ? firebase.firestore() : null;
    const storage = typeof firebase.storage === "function" ? firebase.storage() : null;

    const ua = navigator.userAgent || "";
    const isMacOSSafari =
        /Macintosh|Mac OS X/.test(ua) &&
        /Safari\//.test(ua) &&
        !/(Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)\//.test(ua);
    const isAdminPage = /\/admin(?:\/|$)/.test(window.location.pathname);
    const shouldEnablePersistence = !isAdminPage && !isMacOSSafari;

    const persistenceReady = shouldEnablePersistence && db && typeof db.enablePersistence === "function"
        ? db.enablePersistence({ synchronizeTabs: true }).then(() => true).catch((error) => {
            if (error?.code === "failed-precondition") {
                console.info("Firestore persistence is already controlled by another open tab.");
            } else if (error?.code === "unimplemented") {
                console.info("This browser does not support Firestore offline persistence.");
            } else {
                console.warn("Firestore offline persistence could not be enabled:", error);
            }
            return false;
        })
        : Promise.resolve(false);

    if (isMacOSSafari) {
        console.info("KMC: Firestore IndexedDB persistence is disabled on macOS Safari to guarantee fresh server data.");
    }

    window.kmcFirebase = {
        auth,
        db,
        storage,
        persistenceReady,
        persistenceEnabled: shouldEnablePersistence,
        isMacOSSafari
    };
})();

/* ===== shared-data-store.js ===== */
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

/* ===== main.js ===== */
/*
========================================
KMC SAMULNORI
Public interface controller
========================================
*/

"use strict";

(() => {
    const DESKTOP_MENU_BREAKPOINT = 900;
    const NAVBAR_SCROLL_POINT = 40;

    function onReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else {
            callback();
        }
    }

    onReady(() => {
        const navbar = document.getElementById("navbar");
        const menuButton = document.getElementById("menu-toggle");
        const mobileMenu = document.getElementById("mobile-menu");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        let scrollFrame = 0;
        let menuScrollPosition = 0;

        /* Navbar ---------------------------------------------------------- */

        function updateNavbar() {
            scrollFrame = 0;
            navbar?.classList.toggle("scrolled", window.scrollY > NAVBAR_SCROLL_POINT);
        }

        function requestNavbarUpdate() {
            if (scrollFrame) return;
            scrollFrame = window.requestAnimationFrame(updateNavbar);
        }

        updateNavbar();
        window.addEventListener("scroll", requestNavbarUpdate, { passive: true });

        /* Mobile navigation ---------------------------------------------- */

        function isMenuOpen() {
            return Boolean(mobileMenu?.classList.contains("open"));
        }

        function lockPageScroll() {
            menuScrollPosition = window.scrollY;
            document.body.style.position = "fixed";
            document.body.style.top = `-${menuScrollPosition}px`;
            document.body.style.left = "0";
            document.body.style.right = "0";
            document.body.style.width = "100%";
        }

        function unlockPageScroll() {
            const wasLocked = document.body.style.position === "fixed";
            document.body.style.position = "";
            document.body.style.top = "";
            document.body.style.left = "";
            document.body.style.right = "";
            document.body.style.width = "";

            if (wasLocked) {
                window.scrollTo({ top: menuScrollPosition, left: 0, behavior: "auto" });
            }
        }

        function openMenu() {
            if (!mobileMenu || !menuButton || isMenuOpen()) return;

            window.KMCOverlayHistory?.enter("mobile-menu", { close: () => closeMenu(true), open: openMenu });
            mobileMenu.classList.add("open");
            menuButton.classList.add("active");
            menuButton.setAttribute("aria-expanded", "true");
            menuButton.setAttribute("aria-label", "Close navigation menu");
            mobileMenu.setAttribute("aria-hidden", "false");
            lockPageScroll();

            window.setTimeout(() => {
                mobileMenu.querySelector("a")?.focus({ preventScroll: true });
            }, reducedMotion.matches ? 0 : 120);
        }

        function closeMenu(restoreFocus = false) {
            if (!mobileMenu || !menuButton || !isMenuOpen()) return;

            if (window.KMCOverlayHistory?.leave("mobile-menu")) return;
            mobileMenu.classList.remove("open");
            menuButton.classList.remove("active");
            menuButton.setAttribute("aria-expanded", "false");
            menuButton.setAttribute("aria-label", "Open navigation menu");
            mobileMenu.setAttribute("aria-hidden", "true");
            unlockPageScroll();

            if (restoreFocus) menuButton.focus({ preventScroll: true });
        }

        function trapMenuFocus(event) {
            if (event.key !== "Tab" || !isMenuOpen() || !mobileMenu || !menuButton) return;

            const focusable = [menuButton, ...mobileMenu.querySelectorAll("a[href]")];
            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        if (menuButton && mobileMenu) {
            menuButton.setAttribute("aria-controls", "mobile-menu");
            menuButton.setAttribute("aria-expanded", "false");
            mobileMenu.setAttribute("aria-hidden", "true");

            menuButton.addEventListener("click", event => {
                event.stopPropagation();
                isMenuOpen() ? closeMenu() : openMenu();
            });

            mobileMenu.addEventListener("click", event => {
                if (event.target === mobileMenu) closeMenu(true);
            });

            mobileMenu.querySelectorAll("a[href]").forEach(link => {
                link.addEventListener("click", () => closeMenu());
            });

            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && isMenuOpen()) {
                    event.preventDefault();
                    closeMenu(true);
                    return;
                }
                trapMenuFocus(event);
            });

            window.addEventListener("resize", () => {
                if (window.innerWidth > DESKTOP_MENU_BREAKPOINT && isMenuOpen()) closeMenu();
            }, { passive: true });
        }

        /* Reveal animations ------------------------------------------------ */

        let revealObserver = null;

        if ("IntersectionObserver" in window && !reducedMotion.matches) {
            revealObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("visible");
                    revealObserver.unobserve(entry.target);
                });
            }, {
                threshold: 0.12,
                rootMargin: "0px 0px -40px 0px"
            });
        }

        function registerRevealElements(root = document) {
            root.querySelectorAll?.(".reveal:not(.visible):not([data-reveal-observed])")
                .forEach(element => {
                    element.dataset.revealObserved = "true";
                    if (revealObserver) revealObserver.observe(element);
                    else element.classList.add("visible");
                });
        }

        registerRevealElements();
        window.addEventListener("kmc:home-sections-rendered", () => registerRevealElements());

        /* Same-page anchor links ------------------------------------------ */

        document.addEventListener("click", event => {
            const link = event.target.closest?.('a[href^="#"]');
            if (!link) return;

            const href = link.getAttribute("href");
            if (!href || href === "#") return;

            let target = null;
            try {
                target = document.querySelector(href);
            } catch (_error) {
                return;
            }

            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({
                behavior: reducedMotion.matches ? "auto" : "smooth",
                block: "start"
            });
        });

        /* Device theme ---------------------------------------------------- */

        const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const updateTheme = event => {
            const dark = typeof event?.matches === "boolean" ? event.matches : themeQuery.matches;
            document.documentElement.dataset.theme = dark ? "dark" : "light";
        };

        updateTheme();
        if (themeQuery.addEventListener) themeQuery.addEventListener("change", updateTheme);
        else themeQuery.addListener(updateTheme);

        /* Page lifecycle -------------------------------------------------- */

        document.body.classList.add("page-loaded");

        window.addEventListener("pageshow", () => {
            if (isMenuOpen()) closeMenu();
            updateNavbar();
            registerRevealElements();
        });

        window.KMC = Object.assign(window.KMC || {}, {
            version: "3.1",
            closeMenu,
            openMenu,
            updateNavbar,
            registerRevealElements
        });
    });
})();

/* ===== public-image-loader.js ===== */
"use strict";

(() => {
    const observed = new WeakSet();
    const pending = new WeakMap();
    const supportsObserver = "IntersectionObserver" in window;

    function escapeCssUrl(value) {
        return String(value || "").replace(/"/g, "%22");
    }

    function applyBackground(element) {
        const url = element?.dataset?.kmcBackground;
        if (!element || !url || element.dataset.kmcBackgroundLoaded === "true") return;
        element.style.setProperty(
            element.dataset.kmcBackgroundProperty || "--performance-image",
            `url("${escapeCssUrl(url)}")`
        );
        element.dataset.kmcBackgroundLoaded = "true";
        element.classList.add("kmc-background-loaded");
        pending.get(element)?.unobserve(element);
        pending.delete(element);
    }

    const observer = supportsObserver ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) applyBackground(entry.target);
        });
    }, {
        rootMargin: "500px 0px",
        threshold: 0.01
    }) : null;

    function observeBackground(element, url, propertyName = "--performance-image") {
        if (!element || !url) return;
        element.dataset.kmcBackground = url;
        element.dataset.kmcBackgroundProperty = propertyName;
        if (!observer) {
            applyBackground(element);
            return;
        }
        if (!observed.has(element)) {
            observed.add(element);
            pending.set(element, observer);
            observer.observe(element);
        }
    }

    function loadBackgroundNow(element, url, propertyName = "--performance-image") {
        if (!element || !url) return;
        element.dataset.kmcBackground = url;
        element.dataset.kmcBackgroundProperty = propertyName;
        applyBackground(element);
    }

    function preload(url) {
        if (!url) return;
        const image = new Image();
        image.decoding = "async";
        image.src = url;
    }

    window.KMCImageLoader = Object.freeze({
        observeBackground,
        loadBackgroundNow,
        preload
    });
})();
