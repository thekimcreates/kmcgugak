"use strict";
window.KMCGallerySwipe = {
    attach(surface, { enabled, change }) {
        if (!surface) return;
        let start = null, suppressClickUntil = 0;
        const zoomed = () => (window.visualViewport?.scale || 1) > 1.05;
        const ignore = target => target.closest?.('button, a, input, select, textarea, [role="slider"], iframe');
        surface.addEventListener("touchstart", event => {
            start = null;
            if (!enabled() || zoomed() || event.touches.length !== 1 || ignore(event.target)) return;
            const point = event.touches[0];
            // Leave native video control gestures to the player if native controls are enabled later.
            const video = event.target.closest?.("video");
            if (video?.controls && point.clientY > video.getBoundingClientRect().bottom - 60) return;
            start = { id: point.identifier, x: point.clientX, y: point.clientY, time: Date.now(), horizontal: false };
        }, { passive: true });
        surface.addEventListener("touchmove", event => {
            if (!start) return;
            if (!enabled() || zoomed() || event.touches.length !== 1) { start = null; return; }
            const point = event.touches[0];
            if (point.identifier !== start.id) { start = null; return; }
            const dx = Math.abs(point.clientX - start.x), dy = Math.abs(point.clientY - start.y);
            if (!start.horizontal && dy > 14 && dy > dx) { start = null; return; }
            if (dx > 14 && dx > dy * 1.5) start.horizontal = true;
            if (start.horizontal && event.cancelable) event.preventDefault();
        }, { passive: false });
        surface.addEventListener("touchend", event => {
            const gesture = start; start = null;
            if (!gesture || !enabled() || zoomed() || event.touches.length) return;
            const point = [...event.changedTouches].find(touch => touch.identifier === gesture.id);
            if (!point) return;
            const dx = point.clientX - gesture.x, dy = point.clientY - gesture.y;
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - gesture.time > 1200) return;
            suppressClickUntil = Date.now() + 450;
            change(dx < 0 ? 1 : -1);
        }, { passive: true });
        surface.addEventListener("touchcancel", () => { start = null; }, { passive: true });
        surface.addEventListener("click", event => {
            if (Date.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
        }, true);
        window.addEventListener("blur", () => { start = null; });
    }
};
