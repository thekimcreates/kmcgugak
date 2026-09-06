"use strict";
(() => {
    function date(value) {
        if (!value) return "Date unavailable";
        const parsed = new Date(`${value}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return String(value);
        return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(parsed);
    }
    function time(record) {
        if (record.timeTbd) return "Time TBD";
        const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(record.time || "");
        if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "Time unavailable";
        // Browser locale/hour-cycle preferences are available; a separate OS clock toggle may not be.
        const preferences = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
        const use24 = preferences.hour12 === false || ["h23", "h24"].includes(preferences.hourCycle);
        return new Intl.DateTimeFormat("en-US", {
            hour: use24 ? "2-digit" : "numeric", minute: "2-digit", hourCycle: use24 ? "h23" : "h12"
        }).format(new Date(2000, 0, 1, Number(match[1]), Number(match[2])));
    }
    window.KMCPerformanceFormat = { date, time };
})();
