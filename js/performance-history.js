"use strict";
// One same-document history entry per overlay layer, never per gallery file.
window.KMCPerformanceHistory = function (apply) {
    const key = "kmcPerformanceOverlay";
    let restoring = false, navigating = false, desired = null, closeFromTouch = false;
    const current = () => history.state?.[key] || null;
    const write = (method, value, url = location.href) => {
        history[method]({ ...history.state, [key]: value }, "", url);
    };
    async function restore(state = current()) {
        if (!state) return;
        desired = state;
        if (restoring) return;
        restoring = true;
        try {
            while (desired) {
                const target = desired;
                desired = null;
                const touch = closeFromTouch;
                closeFromTouch = false;
                await apply(target, touch);
            }
        } finally {
            restoring = false;
            navigating = false;
        }
    }
    window.addEventListener("popstate", event => {
        if (event.state?.[key]) void restore(event.state[key]);
    });
    return {
        current,
        restore,
        busy: () => restoring || navigating,
        enter(depth, id, index = 0) {
            if (restoring) return;
            if (!current()) {
                const base = new URL(location.href);
                base.hash = "";
                write("replaceState", { depth: 0, id: null, index: 0 }, base);
            }
            const state = current();
            if (state.depth === depth && state.id === id) return;
            const url = new URL(location.href);
            url.hash = id ? encodeURIComponent(id) : "";
            write("pushState", { depth, id, index }, url);
        },
        updateIndex(index) {
            if (!restoring && current()?.depth === 3) {
                write("replaceState", { ...current(), index });
            }
        },
        leave(depth, fromTouch = false) {
            if (restoring || navigating) return true;
            const state = current();
            if (!state || state.depth <= depth) return false;
            navigating = true;
            closeFromTouch = fromTouch;
            history.go(depth - state.depth);
            return true;
        }
    };
};
