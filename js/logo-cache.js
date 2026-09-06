"use strict";
(() => {
    const key = "kmc-full-logo-v1";
    let cached = "";
    try { cached = localStorage.getItem(key) || ""; } catch (_) {}
    function applyEarly() {
        document.querySelectorAll('img[data-site-logo="full"]:not([src])').forEach(img => {
            img.src = cached || img.dataset.logoFallback;
        });
    }
    const observer = new MutationObserver(applyEarly);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    applyEarly();
    document.addEventListener("DOMContentLoaded", () => { applyEarly(); observer.disconnect(); }, { once: true });
    window.KMCLogoCache = {
        save(url) {
            cached = url || "";
            try {
                if (cached) localStorage.setItem(key, cached);
                else localStorage.removeItem(key);
            } catch (_) {}
        }
    };
})();
