"use strict";
window.KMCGallerySwipe = {
    attach(surface, { enabled, change, close, prepare = () => {}, progress = () => {}, cleanup = () => {}, canChange = () => true }) {
        if (!surface) return;
        let start = null, settling = false, suppressClickUntil = 0;
        const zoomed = () => (window.visualViewport?.scale || 1) > 1.05;
        const reset = () => { surface.style.transform = "none"; cleanup(); progress(0); };
        const settle = async callback => {
            settling = true;
            const animation = surface.animate?.([
                { transform: surface.style.transform || "none" }, { transform: "translate3d(0,0,0)" }
            ], { duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180,
                easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
            try { await animation?.finished; } catch (_) { /* Another viewer action took over. */ }
            reset();
            animation?.cancel();
            settling = false;
            if (enabled()) callback?.();
        };
        const cancel = () => { if (start) { start = null; settle(); } };
        surface.addEventListener("touchstart", event => {
            if (start) { cancel(); return; }
            if (settling || !enabled() || zoomed() || event.touches.length !== 1 ||
                event.target.closest?.('button, a, input, select, textarea, [role="slider"], iframe')) return;
            const point = event.touches[0], video = event.target.closest?.('video');
            if (video?.controls && point.clientY > video.getBoundingClientRect().bottom - 60) return;
            start = { id: point.identifier, x: point.clientX, y: point.clientY, dx: 0, dy: 0, axis: null, samples: [{x: point.clientX, t: performance.now()}] };
        }, { passive: true });
        surface.addEventListener("touchmove", event => {
            if (!start) return;
            if (!enabled() || zoomed() || event.touches.length !== 1) { cancel(); return; }
            const point = event.touches[0];
            if (point.identifier !== start.id) { cancel(); return; }
            const dx = point.clientX - start.x, dy = point.clientY - start.y;
            if (!start.axis) {
                if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) start.axis = 'x';
                else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.3) {
                    if (dy < 0) { cancel(); return; }
                    start.axis = 'y';
                }
            }
            if (!start.axis) return;
            if (event.cancelable) event.preventDefault();
            start.dx = dx; start.dy = dy;
            const now = performance.now();
            start.samples.push({x: point.clientX, t: now});
            start.samples = start.samples.filter(sample => now - sample.t <= 120);
            if (start.axis === 'x') prepare(dx < 0 ? 1 : -1);
            const x = start.axis === 'x' ? dx * (canChange(dx < 0 ? 1 : -1) ? 1 : .25) : dx;
            const y = start.axis === 'y' ? Math.max(0, dy) : 0;
            surface.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            if (start.axis === "y") progress(Math.hypot(x, y));
        }, { passive: false });
        surface.addEventListener("touchend", event => {
            if (!start) return;
            const gesture = start; start = null;
            if (!enabled() || zoomed() || event.touches.length) { settle(); return; }
            const point = [...event.changedTouches].find(touch => touch.identifier === gesture.id);
            if (!point || !gesture.axis) { settle(); return; }
            suppressClickUntil = Date.now() + 500;
            const dx = point.clientX - gesture.x, dy = point.clientY - gesture.y;
            if (gesture.axis === 'y') {
                // Keep the release transform: the shared close animation starts here.
                if (dy >= 90) close();
                else settle();
            } else {
                const direction = dx < 0 ? 1 : -1;
                const now = performance.now();
                const sample = gesture.samples.find(sample => now - sample.t <= 120);
                const velocity = sample ? (point.clientX - sample.x) / Math.max(1, now - sample.t) : 0;
                const halfway = Math.abs(dx) >= surface.clientWidth / 2;
                const flick = Math.abs(dx) >= 18 && Math.abs(velocity) >= .5 && Math.sign(velocity) === Math.sign(dx);
                if ((halfway || flick) && canChange(direction)) {
                    // Selection takes over from the finger's current translation.
                    change(direction, surface.style.transform);
                } else settle();
            }
        }, { passive: true });
        surface.addEventListener("touchcancel", cancel, { passive: true });
        surface.addEventListener("click", event => {
            if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
        }, true);
        window.addEventListener("blur", cancel);
    }
};
