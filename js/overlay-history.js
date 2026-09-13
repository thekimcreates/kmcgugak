"use strict";
window.KMCOverlayHistory = (() => {
    const key = "kmcSiteOverlays", entries = new Map(), actions = new Map();
    let stack = [], applying = false, pending = false, wanted = null, reopening = false, deferredOpen = null;
    let navigatingLink = false;
    document.addEventListener("click", event => {
        const anchor = event.target.closest?.('a[href]');
        if (!anchor || event.defaultPrevented || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
        navigatingLink = new URL(anchor.href, location.href).href !== location.href;
        setTimeout(() => { navigatingLink = false; }, 0);
    }, true);
    const write = (method, value, url = location.href) => history[method]({ ...history.state, [key]: value }, "", url);
    async function restore(target) {
        wanted = target;
        if (applying) return;
        applying = true;
        try {
            while (wanted) {
                const next = wanted; wanted = null;
                let common = 0;
                while (common < stack.length && stack[common] === next[common]) common++;
                while (stack.length > common) {
                    const id = stack.pop(), entry = entries.get(id);
                    const action = actions.get(id) || entry?.close;
                    actions.delete(id);
                    await action?.();
                    if (entry?.duration) await new Promise(resolve => setTimeout(resolve, entry.duration));
                }
                for (const id of next.slice(common)) {
                    const entry = entries.get(id);
                    // Forward must never replay completed confirmations.
                    if (!entry?.open) { history.back(); break; }
                    stack.push(id);
                    reopening = true;
                    try { await entry.open(); } finally { reopening = false; }
                }
            }
        } finally {
            applying = false; pending = false;
            const nextOpen = deferredOpen; deferredOpen = null;
            if (nextOpen) queueMicrotask(nextOpen);
        }
    }
    // Consume only this controller's layers; preserve the gallery controller.
    window.addEventListener("popstate", event => {
        const next = event.state?.[key] || [];
        if (JSON.stringify(next) === JSON.stringify(stack) && !pending) return;
        event.stopImmediatePropagation();
        void restore(next);
    }, true);
    return {
        deferOpen(callback) {
            if (!reopening && (applying || pending)) { deferredOpen = callback; return true; }
            return false;
        },
        enter(id, entry, url = null) {
            if (applying || stack.includes(id)) return;
            entries.set(id, entry);
            if (!stack.length) write('replaceState', [], entry.baseUrl || location.href);
            stack.push(id);
            write('pushState', [...stack], url || location.href);
        },
        leave(id, action = null) {
            if (applying || navigatingLink) return false;
            const index = stack.indexOf(id);
            if (index < 0) return false;
            if (pending) return true;
            if (action) actions.set(id, action);
            pending = true;
            history.go(index - stack.length);
            return true;
        },
        get applying() { return applying; }
    };
})();
