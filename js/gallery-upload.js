"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);
    const api = window.KMCGalleryUploadAPI;
    const inputs = [...$("upload-code-boxes").querySelectorAll("input")];
    const stages = ["upload-loading", "upload-picker", "upload-gate", "upload-workspace"];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const maxFileBytes = 500 * 1024 * 1024;
    const maxBatchBytes = 5 * 1024 * 1024 * 1024;
    const spinner = '<span class="upload-spinner" aria-hidden="true"></span>';
    const check = '<svg class="upload-check" viewBox="0 0 32 32" aria-hidden="true"><path d="m7 17 6 6 13-14"/></svg>';
    let records = [], selected = null, session = null, files = [];
    let gallery = [], deletions = new Set();
    let routeVersion = 0, verifying = false, preparing = false, submitting = false, frozen = false, completed = false;
    let dropTimer = 0, returnTimer = 0, dragDepth = 0, verifyController = null;

    const locationLabel = record => record.locationTbd ? "Location TBD" : record.locationName || record.location || "Location unavailable";
    const galleryDateLabel = value => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
        return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : "Date unavailable";
    };
    const dateLabel = value => window.KMCPerformanceFormat.date(value);
    const timeLabel = record => window.KMCPerformanceFormat.time(record);
    const arrangements = record => record.arrangementsTbd ? "Arrangements TBD" : (record.arrangements || []).join(" • ");
    const durationLabel = seconds => {
        const total = Math.floor(seconds || 0), minutes = Math.floor(total / 60);
        return `${minutes}:${String(total % 60).padStart(2, "0")}`;
    };
    const bytes = value => window.kmcImageOptimizer.formatBytes(value);
    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className || "";
        if (text !== undefined) node.textContent = text;
        return node;
    };
    function stage(id) { stages.forEach(name => { $(name).hidden = name !== id; }); }
    function status(message, error = false) {
        $("upload-status").textContent = message;
        $("upload-status").classList.toggle("is-error", error);
    }
    function codeStatus(message, type = "") {
        $("upload-code-status").textContent = message;
        $("upload-code-status").className = `upload-code-status ${type ? `is-${type}` : ""}`;
        $("upload-code-boxes").className = `upload-code-boxes ${type ? `is-${type}` : ""}`;
        inputs.forEach(input => input.setAttribute("aria-invalid", String(type === "error")));
    }
    function card(record) {
        const article = element("article", "performance-card performance-public-card upload-performance-card");
        if (record.highlightPhotoUrl) {
            // Only safe URL protocols may be interpolated into a CSS image.
            try {
                const url = new URL(record.highlightPhotoUrl, document.baseURI);
                if (["https:", "http:"].includes(url.protocol)) {
                    article.style.setProperty("--performance-image", `url(${JSON.stringify(url.href)})`);
                    article.classList.add("has-highlight-photo");
                }
            } catch (_) { /* The plain performance card remains available. */ }
        }
        const content = element("div", "performance-card-content");
        content.append(element("p", "performance-date-time", `${dateLabel(record.date)} • ${timeLabel(record)}`),
            element("h2", "performance-location", locationLabel(record)),
            element("p", "performance-meta", arrangements(record)));
        article.append(content);
        return article;
    }
    function renderPicker() {
        $("upload-picker-list").replaceChildren(...records.map(record => {
            const row = element("article", "upload-picker-row");
            const main = element("div", "upload-picker-main");
            if (record.highlightPhotoUrl) {
                const image = element("img"); image.src = record.highlightPhotoUrl; image.alt = ""; image.loading = "lazy";
                image.onerror = () => image.remove();
                main.append(image);
            }
            const content = element("div");
            content.append(element("p", "", `${dateLabel(record.date)} · ${timeLabel(record)}`),
                element("h2", "", locationLabel(record)), element("p", "", arrangements(record)));
            main.append(content);
            const select = element("a", "upload-button", "Select");
            select.href = `${location.pathname}#${encodeURIComponent(record.id)}`;
            select.setAttribute("aria-label", `Select ${locationLabel(record)}, ${dateLabel(record.date)}`);
            row.append(main, select);
            return row;
        }));
    }
    function release(entry) { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); }
    function resetFiles() {
        files.forEach(release); files = []; session = null; gallery = []; deletions.clear(); renderGallery();
        frozen = completed = false;
        clearTimeout(dropTimer); clearTimeout(returnTimer);
        $("upload-progress-wrap").hidden = true;
        $("upload-submit").classList.remove("is-complete");
        $("upload-submit").innerHTML = "Submit";
        $("upload-submit").removeAttribute("aria-label");
        status(""); renderFiles(); setDropState("idle");
    }
    async function route() {
        // Do not let a hash change silently redirect an in-flight batch to another performance.
        if (submitting || preparing || frozen) {
            history.replaceState(null, "", `${location.pathname}#${encodeURIComponent(selected.id)}`);
            return;
        }
        const version = ++routeVersion;
        verifyController?.abort(); verifying = false;
        resetFiles();
        let id;
        try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { id = "invalid"; }
        selected = records.find(record => record.id === id) || null;
        // A direct link may target a record omitted from a cached/filtered listing.
        if (id && !selected && /^[A-Za-z0-9_-]{1,128}$/.test(id)) {
            stage("upload-loading");
            try { selected = await window.KMCPerformanceList.detail({ id }, { fresh: true }); } catch (_) { /* Show the picker below. */ }
            if (version !== routeVersion) return;
        }
        if (!selected) {
            stage("upload-picker");
            $("upload-picker-status").textContent = id ? "This performance is unavailable. Please select another performance." : records.length ? "" : "No performances are available yet.";
            $("upload-picker").focus({ preventScroll: true });
            return;
        }
        inputs.forEach(input => { input.value = ""; input.disabled = false; });
        codeStatus("Enter the code provided in the group chat.");
        $("upload-card-wrap").replaceChildren(card(selected));
        stage("upload-gate");
        inputs[0].focus({ preventScroll: true });
    }
    async function unlock() {
        const source = $("upload-card-wrap").firstElementChild;
        const from = source.getBoundingClientRect();
        const clone = source.cloneNode(true);
        $("upload-workspace-title").textContent = `${locationLabel(selected)} ${galleryDateLabel(selected.date)} - Gallery Upload`;
        stage("upload-workspace");
        const title = $("upload-workspace-title");
        if (!reducedMotion.matches && clone.animate && from.width > 0) {
            const to = title.getBoundingClientRect();
            clone.classList.add("upload-transition-card");
            Object.assign(clone.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, minHeight: "0" });
            document.body.append(clone);
            title.style.opacity = "0";
            try {
                const travel = clone.animate([
                    { transform: "translate(0, 0) scale(1)", opacity: 1, borderRadius: "24px" },
                    { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${Math.min(1, to.width / from.width)}, ${to.height / from.height})`, opacity: 0, borderRadius: "0" }
                ], { duration: 650, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });
                title.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { delay: 250, duration: 400, fill: "forwards" });
                await travel.finished;
            } finally { clone.remove(); title.style.opacity = ""; }
        }
        title.focus({ preventScroll: true });
    }
    async function verify() {
        const code = inputs.map(input => input.value).join("");
        if (verifying || !selected || !/^\d{4}$/.test(code)) return;
        const version = routeVersion;
        verifying = true; inputs.forEach(input => { input.disabled = true; });
        codeStatus("");
        $("upload-code-status").innerHTML = '<span class="upload-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span><span class="upload-sr-only">Checking code</span>';
        verifyController = new AbortController();
        try {
            const result = await api.request("verify", { performanceId: selected.id, code }, { signal: verifyController.signal });
            if (version !== routeVersion) return;
            if (!result.galleryEditing || !Array.isArray(result.galleryItems)) throw new Error("The gallery editing service needs to be updated. Please contact the administrator.");
            session = result.token; gallery = result.galleryItems; renderGallery();
            codeStatus("Opening page…", "success");
            await new Promise(resolve => setTimeout(resolve, 700));
            if (version === routeVersion) await unlock();
        } catch (error) {
            if (version !== routeVersion) return;
            codeStatus(error.code === "incorrect-code" ? "Incorrect code. Try again." : error.message, "error");
            inputs.forEach(input => { input.disabled = false; });
            inputs[0].focus({ preventScroll: true }); inputs[0].select();
        } finally { if (version === routeVersion) verifying = false; }
    }
    function distribute(text, index) {
        const digits = text.replace(/[^0-9]/g, "").slice(0, 4);
        if (!digits) { inputs[index].value = ""; return; }
        const start = digits.length === 4 ? 0 : index;
        for (let offset = 0; offset < digits.length && start + offset < 4; offset++) inputs[start + offset].value = digits[offset];
        inputs[Math.min(3, start + digits.length)].focus({ preventScroll: true });
        inputs[Math.min(3, start + digits.length)].select();
        verify();
    }
    inputs.forEach((input, index) => {
        input.addEventListener("focus", () => input.select());
        input.addEventListener("input", () => {
            const value = input.value;
            if ($("upload-code-boxes").classList.contains("is-error")) inputs.forEach(box => { box.value = ""; });
            codeStatus("Enter the code provided in the group chat."); distribute(value, index);
        });
        input.addEventListener("paste", event => {
            event.preventDefault();
            if ($("upload-code-boxes").classList.contains("is-error")) inputs.forEach(box => { box.value = ""; });
            codeStatus("Enter the code provided in the group chat.");
            distribute(event.clipboardData.getData("text"), index);
        });
        input.addEventListener("keydown", event => {
            if (event.key === "Backspace" && !input.value && index > 0) { event.preventDefault(); inputs[index - 1].value = ""; inputs[index - 1].focus(); }
            if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); inputs[index - 1].focus(); }
            if (event.key === "ArrowRight" && index < 3) { event.preventDefault(); inputs[index + 1].focus(); }
        });
    });
    $("upload-code-form").addEventListener("submit", event => { event.preventDefault(); verify(); });

    function setDropState(state) {
        clearTimeout(dropTimer);
        $("upload-browse").hidden = state !== "idle";
        $("upload-drop-help").hidden = state !== "idle";
        $("upload-drop-indicator").hidden = state === "idle";
        $("upload-drop").setAttribute("aria-busy", String(state === "preparing"));
        if (state === "preparing") $("upload-drop-indicator").innerHTML = spinner + '<span class="upload-sr-only">Preparing files</span>';
        if (state === "ready") {
            $("upload-drop-indicator").innerHTML = check + '<span class="upload-sr-only">Files ready</span>';
            dropTimer = setTimeout(() => setDropState("idle"), 3000);
        }
        $("upload-browse").disabled = preparing || submitting || frozen;
    }
    function renderFiles() {
        $("upload-pending").replaceChildren(...files.map(entry => {
            const tile = element("figure", "upload-tile");
            if (entry.previewUrl) {
                const image = element("img", "kmc-soft-preview"); image.src = entry.previewUrl; image.alt = entry.name; tile.append(image);
            } else tile.append(element("span", "upload-preview-fallback", "Preview unavailable"));
            if (entry.type === "video") tile.append(element("span", "performance-gallery-video-badge", durationLabel(entry.duration)));
            const remove = element("button", "upload-remove", "×"); remove.type = "button";
            remove.setAttribute("aria-label", `Remove ${entry.name}`); remove.disabled = frozen || submitting || preparing;
            remove.addEventListener("click", () => { release(entry); files = files.filter(item => item.id !== entry.id); renderFiles(); pendingStatus(); });
            tile.append(remove); return tile;
        }));
        $("upload-submit").disabled = (!files.length && !deletions.size) || preparing || submitting || completed;
        $("upload-undo-deletions").hidden = !deletions.size;
        $("upload-undo-deletions").disabled = frozen || submitting || preparing || completed;
        $("upload-grid").querySelectorAll(".upload-gallery-delete").forEach(button => { button.disabled = frozen || submitting || preparing || completed; });
        $("upload-browse").disabled = preparing || submitting || frozen;
    }
    function pendingStatus() { status(files.length || deletions.size ? "Changes are not published yet" : ""); }
    const safeMedia = url => { try { return ["https:", "http:"].includes(new URL(url).protocol); } catch (_) { return false; } };
    function renderGallery() {
        window.KMCUploadPreviews.reset();
        const visible = gallery.filter(item => !deletions.has(item.deletionKey));
        $("upload-empty").hidden = visible.length > 0;
        $("upload-grid").replaceChildren(...visible.map(item => {
            const tile = element("figure", "upload-tile upload-published-tile"); tile.dataset.key = item.deletionKey;
            window.KMCUploadPreviews.attach(tile, item);
            if (item.type === "video") tile.append(element("span", "performance-gallery-video-badge", durationLabel(item.duration)));
            const remove = element("button", "upload-remove upload-gallery-delete", "×"); remove.type = "button";
            remove.setAttribute("aria-label", `Delete ${item.name || (item.type === "video" ? "video" : "image")}`);
            remove.disabled = frozen || submitting || preparing || completed;
            remove.onclick = event => {
                if (frozen || submitting || preparing || completed) return;
                // Pointer clicks require either Alt key; keyboard activation remains accessible.
                if (event.detail !== 0 && !event.altKey) return;
                deletions.add(item.deletionKey); renderGallery(); renderFiles(); pendingStatus();
            };
            tile.append(remove); return tile;
        }));
    }
    function setAlt(active) { $("upload-grid").classList.toggle("is-alt-held", active); }
    document.addEventListener("keydown", event => setAlt(event.altKey));
    document.addEventListener("keyup", event => setAlt(event.altKey));
    $("upload-grid").addEventListener("pointermove", event => setAlt(event.altKey));
    window.addEventListener("blur", () => setAlt(false));
    document.addEventListener("visibilitychange", () => { if (document.hidden) setAlt(false); });
    $("upload-undo-deletions").onclick = () => { if (frozen || submitting || preparing || completed) return; deletions.clear(); renderGallery(); renderFiles(); pendingStatus(); };
    async function publishIntoGrid(result) {
        const pending = [...$("upload-pending").children];
        const before = files.map((entry, index) => ({ entry, rect: pending[index]?.getBoundingClientRect() }));
        const previousKeys = new Set(gallery.map(item => item.deletionKey));
        gallery = result.galleryItems; deletions.clear(); renderGallery();
        const added = [...$("upload-grid").children].filter(tile => !previousKeys.has(tile.dataset.key));
        const animations = [];
        if (added.length) {
            const wrap = $("upload-grid").parentElement;
            wrap.scrollTop = Math.max(0, added[0].offsetTop - $("upload-grid").offsetTop);
        }
        if (!reducedMotion.matches) added.forEach((tile, index) => {
            const from = before[index]?.rect, to = tile.getBoundingClientRect();
            if (!tile.animate || to.bottom < 0 || to.top > innerHeight) return;
            const ghost = tile.cloneNode(true); ghost.removeAttribute("data-key"); ghost.querySelectorAll("button, video").forEach(node => node.remove());
            ghost.setAttribute("aria-hidden", "true"); ghost.classList.add("upload-flight");
            Object.assign(ghost.style, {position:"fixed",left:`${to.left}px`,top:`${to.top}px`,width:`${to.width}px`,height:`${to.height}px`,zIndex:"10000",pointerEvents:"none",margin:"0"});
            document.body.append(ghost); tile.style.opacity = "0";
            const dx = from ? from.left - to.left : 0, dy = from ? from.top - to.top : 30;
            const animation = ghost.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.65)`, opacity: .25 }, { transform: "none", opacity: 1 }], { duration: 650, delay: Math.min(index * 45, 300), fill:"both", easing: "cubic-bezier(.22,1,.36,1)" });
            animations.push(animation.finished.catch(() => {}).finally(() => { ghost.remove(); tile.style.opacity = ""; }));
        });
        files.forEach(release); files = []; renderFiles(); setDropState("idle");
        await Promise.all(animations);
    }
    function videoDuration(file) {
        return new Promise(resolve => {
            const video = document.createElement("video"), url = URL.createObjectURL(file);
            const timer = setTimeout(() => finish(0), 12000);
            let done = false;
            const finish = value => { if (done) return; done = true; clearTimeout(timer); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); resolve(Number.isFinite(value) ? value : 0); };
            video.preload = "metadata"; video.muted = true; video.playsInline = true;
            video.onloadedmetadata = () => finish(video.duration); video.onerror = () => finish(0); video.src = url;
        });
    }
    function typeOf(file) {
        const extension = file.name.split(".").pop().toLowerCase();
        if (/^(mp4|m4v|mov|webm)$/.test(extension) || /^video\/(mp4|quicktime|webm)$/.test(file.type)) return "video";
        if (/^(jpe?g|png|webp|heic|heif)$/.test(extension) || /^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return "image";
        return "";
    }
    async function addFiles(chosen) {
        if (!session || preparing || submitting || frozen || !chosen.length) return;
        preparing = true; setDropState("preparing"); renderFiles();
        const errors = [];
        let added = 0;
        try {
            // Preparing sequentially avoids decoding many large photos/videos at once on iPhones.
            for (const file of chosen) {
                if (files.length >= 100) { errors.push("You can submit up to 100 files at a time."); break; }
                const type = typeOf(file);
                if (!type || !file.size || file.size > maxFileBytes) { errors.push(`${file.name}: choose a supported photo or video under 500 MB.`); continue; }
                if (files.some(entry => entry.originalName === file.name && entry.originalSize === file.size && entry.lastModified === file.lastModified)) continue;
                status(`Preparing ${file.name}…`);
                let blob = file, thumbnail = null, duration = 0;
                try {
                    if (type === "image") {
                        const optimized = await window.kmcImageOptimizer.optimize(file, { maxWidth: 2000, maxHeight: 2000, quality: .84, maxInputBytes: maxFileBytes });
                        blob = optimized.blob;
                        thumbnail = await window.kmcImageOptimizer.optimize(new File([blob], "preview.jpg", { type: blob.type }), { maxWidth: 320, maxHeight: 320, quality: .7, jpegQuality: .72, maxInputBytes: maxFileBytes });
                    } else {
                        duration = await videoDuration(file);
                        try { thumbnail = await window.KMCVideoPreview.capture(file, { maxEdge: 320, quality: .7, timeout: 15000 }); }
                        catch (_) { errors.push(`${file.name}: this browser could not create a video preview; the video can still be submitted.`); }
                    }
                    if (thumbnail?.blob.size > 150000) thumbnail = null;
                    const total = files.reduce((sum, entry) => sum + entry.blob.size + (entry.thumbnail?.blob.size || 0), 0) + blob.size + (thumbnail?.blob.size || 0);
                    if (total > maxBatchBytes) { errors.push("The selected files exceed 5 GB. Submit these files first, then start another upload."); break; }
                    const mimeType = type === "image" ? blob.type : file.type === "video/quicktime" || /\.mov$/i.test(file.name) ? "video/quicktime" : /\.webm$/i.test(file.name) ? "video/webm" : "video/mp4";
                    files.push({ id: crypto.randomUUID(), name: file.name.slice(0, 200), originalName: file.name, originalSize: file.size, lastModified: file.lastModified,
                        blob, thumbnail, duration, mimeType, type, previewUrl: thumbnail ? URL.createObjectURL(thumbnail.blob) : type === "image" ? URL.createObjectURL(blob) : "" });
                    added++; renderFiles();
                } catch (error) { errors.push(`${file.name}: ${error.message}`); }
            }
        } finally {
            preparing = false; renderFiles(); setDropState(added ? "ready" : "idle");
            status(errors.length ? errors.join(" ") : (files.length || deletions.size ? "Changes are not published yet" : ""), errors.length > 0);
        }
    }
    $("upload-browse").addEventListener("click", () => $("upload-files").click());
    $("upload-files").addEventListener("change", () => { const chosen = [...$("upload-files").files]; $("upload-files").value = ""; addFiles(chosen); });
    for (const eventName of ["dragover", "drop"]) document.addEventListener(eventName, event => {
        if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault();
    });
    $("upload-drop").addEventListener("dragenter", event => { event.preventDefault(); if (!frozen && !preparing && !submitting) { dragDepth++; $("upload-drop").classList.add("is-dragging"); } });
    $("upload-drop").addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = frozen || preparing || submitting ? "none" : "copy"; });
    $("upload-drop").addEventListener("dragleave", () => { if (--dragDepth <= 0) $("upload-drop").classList.remove("is-dragging"); });
    $("upload-drop").addEventListener("drop", event => { event.preventDefault(); dragDepth = 0; $("upload-drop").classList.remove("is-dragging"); addFiles([...event.dataTransfer.files]); });

    function cancelConfirmation() {
        $("upload-confirm").close(); $("upload-submit").innerHTML = "Submit";
        $("upload-submit").removeAttribute("aria-label"); $("upload-submit").removeAttribute("aria-busy");
        renderFiles(); $("upload-submit").focus({ preventScroll: true });
    }
    $("upload-submit").addEventListener("click", () => {
        if ((!files.length && !deletions.size) || preparing || submitting || completed) return;
        if (frozen) { submit(); return; }
        $("upload-submit").innerHTML = spinner; $("upload-submit").setAttribute("aria-label", "Awaiting upload confirmation");
        $("upload-submit").setAttribute("aria-busy", "true");
        $("upload-confirm").showModal();
    });
    $("upload-no").addEventListener("click", cancelConfirmation);
    $("upload-confirm").addEventListener("cancel", event => { event.preventDefault(); cancelConfirmation(); });
    $("upload-yes").addEventListener("click", () => { $("upload-confirm").close(); frozen = true; submit(); });
    async function submit() {
        if (submitting) return;
        submitting = true; renderFiles();
        $("upload-submit").innerHTML = spinner; $("upload-submit").setAttribute("aria-label", "Uploading files");
        $("upload-submit").setAttribute("aria-busy", "true"); $("upload-progress-wrap").hidden = false;
        const total = files.reduce((sum, entry) => sum + entry.blob.size + (entry.thumbnail?.blob.size || 0), 0);
        const transferred = new Map();
        const progress = (key, value, done = false) => {
            transferred.set(key, value);
            const loaded = [...transferred.values()].reduce((a, b) => a + b, 0);
            const percent = done ? 100 : Math.min(99, Math.floor(loaded / (total || 1) * 100));
            $("upload-progress").value = percent;
            $("upload-percent").textContent = `${percent}%`;
            $("upload-bytes").textContent = `${bytes(loaded)} of ${bytes(total)}`;
        };
        progress("start", 0);
        try {
            status("Preparing upload…");
            const manifest = files.map(entry => ({ id: entry.id, name: entry.name, size: entry.blob.size, mimeType: entry.mimeType, duration: entry.duration,
                thumbnail: entry.thumbnail ? { size: entry.thumbnail.blob.size, mimeType: entry.thumbnail.blob.type } : null }));
            const prepared = await api.request("prepare", { token: session, files: manifest, deletions: [...deletions] });
            if (!prepared.galleryEditing) throw new Error("The gallery editing service needs to be updated. Please contact the administrator.");
            let result = prepared;
            if (!prepared.complete) {
                let next = 0, done = 0, failed = null;
                async function worker() {
                    while (next < files.length && !failed) {
                        const entry = files[next++], policy = prepared.files.find(item => item.id === entry.id);
                        try {
                            if (!entry.uploaded) { await api.sendFile(policy.media, entry.blob, value => progress(entry.id, value)); entry.uploaded = true; }
                            else progress(entry.id, entry.blob.size);
                            if (entry.thumbnail) {
                                if (!entry.thumbnailUploaded) { await api.sendFile(policy.thumbnail, entry.thumbnail.blob, value => progress(`${entry.id}-thumb`, value)); entry.thumbnailUploaded = true; }
                                else progress(`${entry.id}-thumb`, entry.thumbnail.blob.size);
                            }
                            done++; status(`Uploaded ${done} of ${files.length} files…`);
                        } catch (error) { failed = error; }
                    }
                }
                await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
                if (failed) throw failed;
                status("Adding files to the gallery…");
                result = await api.request("finish", { token: session });
            }
            progress("complete", total - [...transferred.values()].reduce((a, b) => a + b, 0), true);
            if (!result.complete || !Array.isArray(result.galleryItems)) throw new Error("Changes could not be confirmed. Press Submit to retry.");
            completed = true; status("Changes published.");
            await publishIntoGrid(result);
            $("upload-submit").innerHTML = check; $("upload-submit").classList.add("is-complete");
            $("upload-submit").setAttribute("aria-label", "Upload complete");
            $("upload-submit").removeAttribute("aria-busy");
            returnTimer = setTimeout(() => {
                location.assign(new URL(`/performances/?uploaded=${Date.now()}#${encodeURIComponent(selected.id)}`, document.baseURI).href);
            }, 3000);
        } catch (error) {
            status(error.message, true); $("upload-submit").textContent = "Submit";
            $("upload-submit").removeAttribute("aria-busy"); $("upload-submit").removeAttribute("aria-label");
        } finally { submitting = false; renderFiles(); }
    }
    window.addEventListener("hashchange", route);
    window.addEventListener("beforeunload", event => {
        if ((files.length || deletions.size || preparing || submitting) && !completed) { event.preventDefault(); event.returnValue = ""; }
    });
    window.addEventListener("pagehide", event => { if (!event.persisted) files.forEach(release); });
    (async () => {
        try {
            if (!window.kmcFirebase?.db) throw new Error("Performances could not be loaded. Please refresh to try again.");
            records = await window.KMCPerformanceList.list(); renderPicker(); await route();
        } catch (error) {
            $("upload-loading").replaceChildren(element("p", "", error.message));
            const retry = element("button", "upload-button", "Try again"); retry.type = "button"; retry.addEventListener("click", () => location.reload());
            $("upload-loading").append(retry);
        }
    })();
});
