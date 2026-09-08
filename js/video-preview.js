"use strict";

// Shared by the public gallery and admin uploader so repaired/new records use
// the same visible-frame recovery path. Only the compressed still is retained.
(() => {
    function withTimeout(task, milliseconds) {
        let timer;
        return Promise.race([
            Promise.resolve().then(task),
            new Promise((_, reject) => {
                timer = window.setTimeout(() => reject(new Error("Video preview request timed out.")), milliseconds);
            })
        ]).finally(() => window.clearTimeout(timer));
    }

    function canvasBlob(canvas, type, quality) {
        return new Promise((resolve) => {
            try { canvas.toBlob(resolve, type, quality); }
            catch (_) { resolve(null); }
        });
    }

    function isNearlyBlackFrame(source) {
        const sample = document.createElement("canvas");
        sample.width = 32;
        sample.height = 32;
        const context = sample.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!context) return false;
        try {
            context.drawImage(source, 0, 0, sample.width, sample.height);
            const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
            let brightness = 0;
            let visiblyLit = 0;
            const total = pixels.length / 4;
            for (let index = 0; index < pixels.length; index += 4) {
                const red = pixels[index];
                const green = pixels[index + 1];
                const blue = pixels[index + 2];
                brightness += red * 0.2126 + green * 0.7152 + blue * 0.0722;
                if (Math.max(red, green, blue) > 38) visiblyLit += 1;
            }
            return brightness / total < 18 && visiblyLit / total < 0.03;
        } catch (_) {
            // Cross-origin restrictions can prevent pixel inspection. The
            // normal canvas export below will still determine usability.
            return false;
        } finally {
            sample.width = sample.height = 1;
        }
    }

    function captureFrame(source, options) {
        return new Promise((resolve, reject) => {
            const video = document.createElement("video");
            const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
            let settled = false;
            let capturing = false;
            let timeout, frameRequest, fallbackFrameTimer;
            let targets = [];
            let targetIndex = -1;
            const finish = (error, result) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeout);
                window.clearTimeout(fallbackFrameTimer);
                if (frameRequest !== undefined && video.cancelVideoFrameCallback) {
                    video.cancelVideoFrameCallback(frameRequest);
                }
                video.removeEventListener("loadedmetadata", beginSeeking);
                video.removeEventListener("loadeddata", scheduleCapture);
                video.removeEventListener("canplay", scheduleCapture);
                video.removeEventListener("seeked", scheduleCapture);
                video.removeEventListener("error", onError);
                video.pause();
                video.removeAttribute("src");
                video.load();
                video.remove();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                if (error) reject(error);
                else resolve(result);
            };
            const onError = () => finish(new Error("This browser could not decode a video preview frame."));
            const seekNext = () => {
                targetIndex += 1;
                capturing = false;
                if (targetIndex >= targets.length) return;
                const target = targets[targetIndex];
                try {
                    if (Math.abs(video.currentTime - target) < 0.01) scheduleCapture();
                    else video.currentTime = target;
                } catch (_) {
                    scheduleCapture();
                }
            };
            const capture = async () => {
                if (settled || capturing || video.readyState < 2 || video.seeking) return;
                if (!video.videoWidth || !video.videoHeight) return;
                capturing = true;
                video.pause();
                const canvas = document.createElement("canvas");
                try {
                    const scale = Math.min(1, options.maxEdge / video.videoWidth, options.maxEdge / video.videoHeight);
                    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
                    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
                    const context = canvas.getContext("2d", { alpha: false });
                    if (!context) throw new Error("Video previews are not supported by this browser.");
                    context.imageSmoothingEnabled = true;
                    context.imageSmoothingQuality = "high";
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    if (isNearlyBlackFrame(canvas) && targetIndex + 1 < targets.length) {
                        canvas.width = canvas.height = 1;
                        seekNext();
                        return;
                    }
                    let blob = await canvasBlob(canvas, "image/webp", options.quality);
                    if (!blob?.size || blob.type !== "image/webp") {
                        blob = await canvasBlob(canvas, "image/jpeg", options.jpegQuality);
                    }
                    if (!blob?.size) throw new Error("The video preview frame could not be compressed.");
                    finish(null, {
                        blob, width: canvas.width, height: canvas.height,
                        contentType: blob.type,
                        extension: blob.type === "image/webp" ? "webp" : "jpg"
                    });
                } catch (error) {
                    finish(error);
                } finally {
                    canvas.width = canvas.height = 1;
                }
            };
            const scheduleCapture = () => {
                if (settled || capturing || targetIndex < 0 || video.readyState < 2 || video.seeking) return;
                capturing = true;
                const run = () => {
                    capturing = false;
                    capture();
                };
                if (video.requestVideoFrameCallback) frameRequest = video.requestVideoFrameCallback(run);
                else fallbackFrameTimer = window.setTimeout(run, 140);
            };
            const beginSeeking = () => {
                if (settled || targets.length) return;
                const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
                const finalFrame = duration > 0 ? Math.max(0, duration - 0.05) : 0;
                const candidates = duration > 0
                    ? [1, Math.max(2, duration * 0.01), Math.max(4, duration * 0.025)]
                    : [0];
                targets = candidates
                    .map((time) => Math.min(time, finalFrame))
                    .filter((time, index, list) => index === 0 || Math.abs(time - list[index - 1]) > 0.05);
                if (!targets.length) targets = [0];
                seekNext();
            };
            video.muted = true;
            video.defaultMuted = true;
            video.playsInline = true;
            video.preload = "auto";
            video.setAttribute("playsinline", "");
            video.setAttribute("aria-hidden", "true");
            video.tabIndex = -1;
            // Keep a rendered element for browsers that defer detached media.
            video.style.cssText = "position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none";
            if (!objectUrl) video.crossOrigin = "anonymous";
            video.addEventListener("loadedmetadata", beginSeeking);
            video.addEventListener("loadeddata", scheduleCapture);
            video.addEventListener("canplay", scheduleCapture);
            video.addEventListener("seeked", scheduleCapture);
            video.addEventListener("error", onError);
            document.body.appendChild(video);
            timeout = window.setTimeout(
                () => finish(new Error("A visible video frame took too long to decode.")),
                Math.max(25000, Number(options.timeout) || 0)
            );
            video.src = objectUrl || String(source || "");
            video.load();
        });
    }

    async function capture(source, settings = {}) {
        const options = { maxEdge: 360, quality: 0.56, jpegQuality: 0.62, ...settings };
        try { return await captureFrame(source, options); }
        catch (error) {
            if (source instanceof Blob) {
                // Retry local uploads with a fresh decoder/object URL as well.
                return captureFrame(source, options);
            }
        }
        let url = String(source || "");
        if (typeof options.resolveSource === "function") {
            try {
                const refreshed = await withTimeout(options.resolveSource, 8000);
                if (refreshed) url = refreshed;
                // A new media element also retries a transient failure when the
                // freshly resolved URL has the same value as the saved URL.
                if (refreshed) return await captureFrame(url, options);
            } catch (_) { /* Try a complete local copy next. */ }
        }
        // Last resort: some media cannot be decoded via remote byte ranges.
        // Do not retain the full video in our thumbnail cache.
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 60000);
        let blob;
        try {
            const response = await fetch(url, {
                mode: "cors", credentials: "omit", cache: "reload", signal: controller.signal
            });
            if (!response.ok) throw new Error(`Video download failed with ${response.status}.`);
            blob = await response.blob();
            if (!blob.size) throw new Error("The video download was empty.");
        } finally {
            window.clearTimeout(timer);
        }
        return captureFrame(blob, options);
    }

    window.KMCVideoPreview = { capture, isNearlyBlackFrame };
})();
