"use strict";

(() => {
    const state = {
        performances: [],
        arrangements: [],
        performancesReady: false,
        signature: ""
    };

    const formatDate = value => window.KMCPerformanceFormat.date(value);
    const formatTime = record => window.KMCPerformanceFormat.time(record);

    function arrangementLabels(performance) {
        const byId = new Map(state.arrangements.map(item => [item.id, item]));
        const resolved = (Array.isArray(performance.arrangementIds) ? performance.arrangementIds : [])
            .map(id => byId.get(id))
            .filter(Boolean)
            .map(item => `${item.name || "Arrangement"} ${item.koreanName || ""}`.trim());
        return resolved.length ? resolved : (Array.isArray(performance.arrangements) ? performance.arrangements.filter(Boolean) : []);
    }

    function message(text) {
        const paragraph = document.createElement("p");
        paragraph.className = "performance-message";
        paragraph.textContent = text;
        return paragraph;
    }

    function cardArrow() {
        const arrow = document.createElement("span");
        arrow.className = "home-card-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 5l7 7-7 7"></path></svg>';
        return arrow;
    }

    function card(record) {
        const performance = record.data || {};
        const article = document.createElement("article");
        article.className = "performance-card reveal visible";
        if (performance.highlightPhotoUrl) {
            window.KMCImageLoader?.observeBackground(article, performance.highlightPhotoUrl);
            article.classList.add("has-highlight-photo");
        }
        const locationText = performance.locationTbd ? "Location TBD" : performance.locationName || performance.location || "Location unavailable";
        const link = document.createElement("a");
        link.className = "performance-card-link";
        link.href = `/performances/#${encodeURIComponent(record.id)}`;
        link.setAttribute("aria-label", `View the ${formatDate(performance.date)} performance at ${locationText}`);
        const content = document.createElement("div");
        content.className = "performance-card-content";
        const dateTime = document.createElement("p");
        dateTime.className = "performance-date-time";
        dateTime.textContent = [formatDate(performance.date), formatTime(performance)].filter(Boolean).join(" • ");
        const location = document.createElement("h3");
        location.className = "performance-location";
        location.textContent = locationText;
        const details = document.createElement("p");
        details.className = "performance-meta";
        const labels = arrangementLabels(performance);
        details.textContent = performance.arrangementsTbd ? "Arrangements TBD" : labels.length ? labels.join(" • ") : "Arrangement details coming soon";
        content.append(dateTime, location, details);
        article.append(link, content, cardArrow());
        return article;
    }

    function performanceTime(record) {
        const performance = record?.data || {};
        const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(performance.date || ""));
        if (!dateMatch) return Number.NaN;
        const timeMatch = !performance.timeTbd && /^(\d{1,2}):(\d{2})/.exec(String(performance.time || ""));
        // An event without a confirmed time stays upcoming for its full date.
        const hours = timeMatch ? Number(timeMatch[1]) : 23;
        const minutes = timeMatch ? Number(timeMatch[2]) : 59;
        return new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hours, minutes).getTime();
    }

    function homePerformances(records) {
        const publicRecords = records
            .filter((record) => record?.data?.hidden !== true)
            .sort((a, b) => String(b.data?.date || "").localeCompare(String(a.data?.date || "")));
        const now = Date.now();
        const upcoming = publicRecords
            .filter((record) => performanceTime(record) > now)
            .sort((a, b) => performanceTime(a) - performanceTime(b));
        const past = publicRecords.filter((record) => performanceTime(record) <= now);

        // The first card is the left card. Put the nearest upcoming event
        // there and the most recent completed event on the right. With no
        // upcoming event, retain the familiar two most-recent-event layout.
        if (!upcoming.length) return past.slice(0, 2);
        return [upcoming[0], past[0] || upcoming[1]].filter(Boolean);
    }

    function render() {
        const container = document.getElementById("latest-performances");
        if (!container) return;
        const signature = JSON.stringify([state.performances, state.arrangements.map(item => [item.id, item.name, item.koreanName])]);
        if (signature === state.signature && container.childElementCount) return;
        state.signature = signature;
        container.removeAttribute("aria-busy");
        if (!state.performancesReady) {
            container.setAttribute("aria-busy", "true");
            return;
        }
        container.replaceChildren(...(state.performances.length
            ? state.performances.map(card)
            : [message("No performances have been published yet.")]));
    }

    function hydrateCached() {
        const api = window.KMCHomeData;
        const cachedPerformances = api?.cachedValue("home-performance-candidates-v1");
        const cachedArrangements = api?.cachedValue("arrangements");
        if (Array.isArray(cachedPerformances)) {
            state.performances = homePerformances(cachedPerformances);
            state.performancesReady = true;
        }
        if (Array.isArray(cachedArrangements?.arrangements)) state.arrangements = cachedArrangements.arrangements;
        render();
    }

    function refresh() {
        const api = window.KMCHomeData;
        hydrateCached();
        if (!api) return;
        api.getHomePerformances()
            .then(records => {
                state.performances = homePerformances(Array.isArray(records) ? records : []);
                state.performancesReady = true;
                state.signature = "";
                render();
            })
            .catch(error => {
                console.warn("Unable to refresh latest performances:", error);
                if (!state.performancesReady) {
                    state.performancesReady = true;
                    state.signature = "";
                    const container = document.getElementById("latest-performances");
                    if (container) container.replaceChildren(message("Latest performances could not be loaded."));
                }
            });
        api.getArrangements()
            .then(data => {
                state.arrangements = Array.isArray(data?.arrangements) ? data.arrangements : [];
                state.signature = "";
                render();
            })
            .catch(() => {});
    }

    document.addEventListener("DOMContentLoaded", refresh);
    window.addEventListener("kmc:home-sections-rendered", () => {
        state.signature = "";
        render();
    });
})();
