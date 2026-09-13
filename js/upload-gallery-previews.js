"use strict";
(() => {
    const memory = new Map(), objectUrls = new Set(), pathUrls = new Map();
    let observer = null, queue = [], active = 0, generation = 0;
    const jobs = new WeakMap();
    const safe = url => /^(https?:\/\/|data:image\/|blob:)/i.test(String(url || ""));
    function reset() {
        generation++;
        observer?.disconnect(); queue = [];
        observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) { observer.unobserve(entry.target); const job = jobs.get(entry.target); if (job) { queue.push(job); pump(); } }
            });
        }, { root: document.querySelector(".upload-grid-wrap"), rootMargin: "200px" }) : null;
    }
    function pump() {
        while (active < 4 && queue.length) {
            const job = queue.shift();
            if (job.generation !== generation) continue;
            active++;
            load(job).catch(() => {}).finally(() => { active--; pump(); });
        }
    }
    async function* candidates(item) {
        const urls = [...new Set([item.thumbnailDataUrl, item.thumbnailUrl, item.thumbnailURL, item.thumbUrl, item.previewUrl].filter(safe))];
        yield* urls;
        if (item.thumbnailPath && window.kmcFirebase?.storage) {
            try {
                let request = pathUrls.get(item.thumbnailPath);
                if (!request) {
                    request = Promise.race([
                        window.kmcFirebase.storage.ref(item.thumbnailPath).getDownloadURL(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("Preview lookup timed out")), 5000))
                    ]);
                    pathUrls.set(item.thumbnailPath, request);
                    request.catch(() => pathUrls.delete(item.thumbnailPath));
                }
                const url = await request;
                if (safe(url) && !urls.includes(url)) yield url;
            } catch (_) {}
        }
        // Reuse a previously generated public-gallery preview without fetching its original.
        if (item.url && window.caches) {
            try {
                const cache = await caches.open("kmc-performance-gallery-thumbnails-v2");
                const response = await cache.match(item.url);
                if (response?.headers.get("x-kmc-gallery-preview") === "1") {
                    const url = URL.createObjectURL(await response.blob()); objectUrls.add(url); yield url;
                }
            } catch (_) {}
        }
    }
    function decode(url) {
        return new Promise((resolve, reject) => {
            const image = new Image(); image.decoding = "async";
            const timeout = setTimeout(() => { image.src = ""; finish(new Error("Preview timed out")); }, 10000);
            function finish(error) { clearTimeout(timeout); image.onload = image.onerror = null; error ? reject(error) : resolve(image); }
            image.onload = () => finish(); image.onerror = () => finish(new Error("Preview unavailable")); image.src = url;
        });
    }
    async function load(job) {
        const { tile, item, placeholder } = job;
        const key = JSON.stringify([item.thumbnailPath, item.thumbnailDataUrl, item.thumbnailUrl, item.thumbnailURL, item.thumbUrl, item.previewUrl, item.url]);
        const remembered = memory.get(key);
        async function display(url) {
            if (job.generation !== generation || !tile.isConnected) return true;
            try {
                const image = await decode(url);
                if (job.generation !== generation || !tile.isConnected) return true;
                image.alt = item.name || "Gallery preview"; image.className = "kmc-soft-preview";
                placeholder.replaceWith(image); memory.set(key, url); return true;
            } catch (_) { return false; }
        }
        if (remembered && await display(remembered)) return;
        for await (const url of candidates(item)) { if (await display(url)) return; }
        if (job.generation === generation && placeholder.isConnected) placeholder.textContent = "Preview unavailable";
    }
    function attach(tile, item) {
        const placeholder = document.createElement("span"); placeholder.className = "upload-preview-fallback"; placeholder.textContent = "Loading preview…"; tile.append(placeholder);
        const job = { tile, item, placeholder, generation }; jobs.set(tile, job);
        if (observer) observer.observe(tile);
        else { queue.push(job); queueMicrotask(pump); }
    }
    window.KMCUploadPreviews = { reset, attach };
    window.addEventListener("pagehide", event => { if (!event.persisted) { observer?.disconnect(); objectUrls.forEach(url => URL.revokeObjectURL(url)); objectUrls.clear(); } });
})();
