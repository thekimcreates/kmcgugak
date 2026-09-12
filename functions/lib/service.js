"use strict";
const { randomInt, randomBytes, createHash, timingSafeEqual } = require("node:crypto");

const MAX_FILE_BYTES = 500 * 1024 * 1024;
const MAX_BATCH_BYTES = 5 * 1024 * 1024 * 1024;
const SESSION_MS = 4 * 60 * 60 * 1000;
const mimeExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
const hash = value => createHash("sha256").update(value).digest("hex");
function fail(code, message, status = 400, extra = {}) { throw Object.assign(new Error(message), { code, status, ...extra }); }
function performanceId(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail("invalid-performance", "Choose a valid performance.");
    return value;
}
function validateManifest(input) {
    if (!Array.isArray(input) || !input.length || input.length > 100) fail("invalid-files", "Select between 1 and 100 files.");
    const ids = new Set();
    let total = 0;
    const files = input.map(file => {
        if (!file || typeof file.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(file.id) || ids.has(file.id)) fail("invalid-files", "The file list is invalid.");
        ids.add(file.id);
        if (!Object.hasOwn(mimeExtensions, file.mimeType) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE_BYTES) fail("invalid-files", "Choose supported photos or videos no larger than 500 MB.");
        if (typeof file.name !== "string" || !file.name.trim() || file.name.length > 200) fail("invalid-files", "A filename is invalid.");
        let thumbnail = null;
        if (file.thumbnail) {
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.thumbnail.mimeType) || !Number.isSafeInteger(file.thumbnail.size) || file.thumbnail.size < 1 || file.thumbnail.size > 150000) fail("invalid-preview", "A file preview is invalid.");
            thumbnail = { size: file.thumbnail.size, mimeType: file.thumbnail.mimeType };
        }
        total += file.size + (thumbnail?.size || 0);
        const duration = Number(file.duration) || 0;
        return { id: file.id, name: file.name.trim(), size: file.size, mimeType: file.mimeType,
            duration: Math.max(0, Math.min(duration, 86400)), thumbnail };
    });
    if (total > MAX_BATCH_BYTES) fail("batch-too-large", "Select no more than 5 GB per submission.");
    return files;
}
function matchesMedia(bytes, mime) {
    if (!Buffer.isBuffer(bytes) || bytes.length < 12) return false;
    if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    if (mime === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (mime === "video/webm") return bytes.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
    // ISO base media and QuickTime containers. Older MOV files can start with mdat/moov/wide.
    if (mime === "video/mp4") return bytes.toString("ascii", 4, 8) === "ftyp";
    if (mime === "video/quicktime") return ["ftyp", "moov", "mdat", "wide", "free"].includes(bytes.toString("ascii", 4, 8));
    return false;
}
async function parallelMap(items, limit, action) {
    const results = new Array(items.length); let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) { const index = next++; results[index] = await action(items[index], index); }
    }));
    return results;
}

function createUploadService({ db, bucket, serverTimestamp, now = Date.now }) {
    const records = kind => db.collection("_galleryUploads").doc(kind).collection("records");
    const performance = id => db.collection("performances").doc(id);
    async function getSession(token, { allowComplete = true } = {}) {
        if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) fail("invalid-session", "Enter the upload code again.", 401);
        const ref = records("sessions").doc(hash(token));
        const snapshot = await ref.get();
        if (!snapshot.exists) fail("invalid-session", "Enter the upload code again.", 401);
        const session = snapshot.data();
        if (!(allowComplete && session.state === "complete") && session.expiresAt <= now()) fail("session-expired", "Your upload session expired. Reload this page and enter the code again.", 401);
        return { ref, session };
    }
    async function ensureCode(id, allowDraft = false) {
        id = performanceId(id);
        if (!allowDraft && !(await performance(id).get()).exists) fail("not-found", "This performance is no longer available.", 404);
        const codeRef = records("codes").doc(id);
        for (let attempt = 0; attempt < 200; attempt++) {
            const candidate = String(randomInt(10000)).padStart(4, "0");
            const claim = records("claims").doc(candidate);
            const result = await db.runTransaction(async tx => {
                const existing = await tx.get(codeRef);
                if (existing.exists) return existing.data().code;
                const claimed = await tx.get(claim);
                if (claimed.exists) return null;
                tx.set(claim, { performanceId: id, createdAt: now() });
                tx.set(codeRef, { code: candidate, createdAt: now() });
                return candidate;
            });
            if (result) return result;
        }
        fail("code-capacity", "A unique upload code could not be generated. Try again.", 503);
    }
    async function throttle(ip, id) {
        const windowMs = 15 * 60 * 1000;
        const checks = [
            { key: hash(`ip:${ip}`), max: 40 },
            { key: hash(`ip-performance:${ip}:${id}`), max: 8 }
        ];
        await db.runTransaction(async tx => {
            const refs = checks.map(item => records("limits").doc(item.key));
            const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
            const next = checks.map((item, index) => {
                const prior = snapshots[index].data();
                const state = prior && prior.expiresAt > now() ? prior : { attempts: 0, expiresAt: now() + windowMs };
                if (state.attempts >= item.max) fail("too-many-attempts", "Too many attempts. Please wait 15 minutes and try again.", 429, { retryAfter: Math.ceil((state.expiresAt - now()) / 1000) });
                return { attempts: state.attempts + 1, expiresAt: state.expiresAt };
            });
            refs.forEach((ref, index) => tx.set(ref, next[index]));
        });
    }
    // Opaque identity bound to this performance and this exact gallery entry.
    const deletionKey = (id, item) => hash(JSON.stringify([id, item.id || "", item.path || "", item.url || ""]));
    const galleryFor = (id, data) => (Array.isArray(data?.galleryItems) ? data.galleryItems : []).map(item => ({ ...item, deletionKey: deletionKey(id, item) }));
    async function completedResult(id) {
        const show = await performance(id).get();
        if (!show.exists) fail("not-found", "This performance is no longer available.", 404);
        return { complete: true, performanceId: id, galleryItems: galleryFor(id, show.data()), galleryEditing: true };
    }
    async function verify({ performanceId: id, code }, ip) {
        id = performanceId(id);
        await throttle(ip, id);
        const [show, secret] = await Promise.all([performance(id).get(), records("codes").doc(id).get()]);
        const expected = secret.exists ? String(secret.data().code) : "";
        const supplied = typeof code === "string" && /^\d{4}$/.test(code) ? code : "----";
        if (!show.exists || !expected || !timingSafeEqual(Buffer.from(hash(expected)), Buffer.from(hash(supplied)))) {
            fail("incorrect-code", "Incorrect code. Try again.", 403);
        }
        const token = randomBytes(32).toString("hex");
        await records("sessions").doc(hash(token)).set({ performanceId: id, state: "unlocked", createdAt: now(), expiresAt: now() + SESSION_MS });
        return { token, expiresAt: now() + SESSION_MS, galleryItems: galleryFor(id, show.data()), galleryEditing: true };
    }
    function mediaPath(sessionId, file, thumbnail = false) {
        const info = thumbnail ? file.thumbnail : file;
        return `gallery-upload-staging/${sessionId}/${file.id}${thumbnail ? "-thumb" : ""}.${mimeExtensions[info.mimeType]}`;
    }
    async function signedPolicy(path, info, expires) {
        const [policy] = await bucket.file(path).generateSignedPostPolicyV4({
            expires,
            fields: { "Content-Type": info.mimeType, success_action_status: "201" },
            conditions: [["content-length-range", info.size, info.size]]
        });
        return policy;
    }
    async function prepare({ token, files: input, deletions = [] }) {
        if (!Array.isArray(deletions) || deletions.length > 2000 || deletions.some(key => typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) || new Set(deletions).size !== deletions.length) fail("invalid-deletions", "The deletion list is invalid.");
        deletions = [...deletions].sort();
        const files = Array.isArray(input) && input.length === 0 && deletions.length ? [] : validateManifest(input);
        const { ref } = await getSession(token);
        const session = await db.runTransaction(async tx => {
            const snapshot = await tx.get(ref), state = snapshot.data();
            if (state.state === "complete") return state;
            if (state.expiresAt <= now()) fail("session-expired", "Your upload session expired. Reload and enter the code again.", 401);
            if (state.files && JSON.stringify(state.files) !== JSON.stringify(files)) fail("batch-locked", "This submission is already locked. Retry the original files.", 409);
            if (state.files && JSON.stringify(state.deletions || []) !== JSON.stringify(deletions)) fail("batch-locked", "This submission is already locked. Retry the original changes.", 409);
            const show = await tx.get(performance(state.performanceId));
            if (!show.exists) fail("not-found", "This performance is no longer available.", 404);
            if (!state.files) {
                const allowed = new Set(galleryFor(state.performanceId, show.data()).map(item => item.deletionKey));
                if (deletions.some(key => !allowed.has(key))) fail("invalid-deletions", "A selected file is no longer in this performance. Reload the gallery and try again.", 409);
            }
            const next = { ...state, files, deletions, state: "prepared" };
            tx.set(ref, next);
            return next;
        });
        if (session.state === "complete") return completedResult(session.performanceId);
        const expires = Math.min(now() + 60 * 60 * 1000, session.expiresAt);
        const policies = await parallelMap(files, 4, async file => ({
            id: file.id,
            media: await signedPolicy(mediaPath(ref.id, file), file, expires),
            thumbnail: file.thumbnail ? await signedPolicy(mediaPath(ref.id, file, true), file.thumbnail, expires) : null
        }));
        return { complete: false, files: policies, galleryEditing: true };
    }
    async function publishAsset(sessionId, session, file, thumbnail = false) {
        const info = thumbnail ? file.thumbnail : file;
        const path = `performance-highlights/${session.performanceId}/community-${sessionId}-${file.id}${thumbnail ? "-thumb" : ""}.${mimeExtensions[info.mimeType]}`;
        const destination = bucket.file(path);
        let metadata;
        try { [metadata] = await destination.getMetadata(); }
        catch (error) { if (error.code !== 404) throw error; }
        if (!metadata) {
            const staged = bucket.file(mediaPath(sessionId, file, thumbnail));
            let sourceMetadata;
            try { [sourceMetadata] = await staged.getMetadata(); }
            catch (error) { if (error.code === 404) fail("missing-file", "A file has not finished uploading. Press Submit to retry.", 409); throw error; }
            if (Number(sourceMetadata.size) !== info.size || sourceMetadata.contentType !== info.mimeType) fail("invalid-media", "An uploaded file did not match the selected file.");
            // Bind both validation and the copy to this exact immutable object generation.
            const source = bucket.file(staged.name, { generation: sourceMetadata.generation });
            const [signature] = await source.download({ start: 0, end: 63, validation: false });
            if (!matchesMedia(signature, info.mimeType)) fail("invalid-media", "A file is not a supported photo or video.");
            const downloadToken = randomBytes(24).toString("hex");
            try {
                await source.copy(destination, {
                    preconditionOpts: { ifGenerationMatch: 0 },
                    contentType: info.mimeType, cacheControl: "public,max-age=31536000,immutable",
                    metadata: { firebaseStorageDownloadTokens: downloadToken, uploadSession: sessionId }
                });
            } catch (error) { if (error.code !== 412) throw error; }
            [metadata] = await destination.getMetadata();
        }
        if (Number(metadata.size) !== info.size || metadata.contentType !== info.mimeType || metadata.metadata?.uploadSession !== sessionId) fail("invalid-media", "A gallery file could not be verified.", 409);
        const downloadToken = metadata.metadata?.firebaseStorageDownloadTokens;
        if (!downloadToken) fail("missing-token", "A gallery file could not be published. Press Submit to retry.", 409);
        return { path, url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(downloadToken)}` };
    }
    async function finish({ token }) {
        const { ref, session } = await getSession(token);
        if (session.state === "complete") return completedResult(session.performanceId);
        if (session.state !== "prepared" || (!session.files?.length && !session.deletions?.length)) fail("empty-batch", "Select files before submitting.", 409);
        if (!(await performance(session.performanceId).get()).exists) fail("not-found", "This performance is no longer available.", 404);
        const published = await parallelMap(session.files, 3, async file => {
            const media = await publishAsset(ref.id, session, file);
            const thumb = file.thumbnail ? await publishAsset(ref.id, session, file, true) : null;
            return { ...media, id: `${ref.id}-${file.id}`, name: file.name, type: file.mimeType.startsWith("video/") ? "video" : "image",
                mimeType: file.mimeType, duration: file.duration, size: file.size,
                thumbnailUrl: thumb?.url || "", thumbnailPath: thumb?.path || "", uploadedAt: new Date(now()).toISOString() };
        });
        await db.runTransaction(async tx => {
            const [currentSession, currentPerformance] = await Promise.all([tx.get(ref), tx.get(performance(session.performanceId))]);
            if (currentSession.data()?.state === "complete") return;
            if (!currentPerformance.exists) fail("not-found", "This performance is no longer available.", 404);
            if (currentSession.data().expiresAt <= now()) fail("session-expired", "Your upload session expired. Please start again.", 401);
            const removed = new Set(currentSession.data().deletions || []);
            const existing = (currentPerformance.data().galleryItems || []).filter(item => !removed.has(deletionKey(session.performanceId, item)));
            const paths = new Set(existing.map(item => item.path || item.url));
            const galleryItems = [...existing, ...published.filter(item => !paths.has(item.path))];
            // Firestore has a 1 MiB document limit. Leave space for field encoding and future edits.
            if (Buffer.byteLength(JSON.stringify({ ...currentPerformance.data(), galleryItems })) > 850000) fail("gallery-full", "This gallery has reached its storage limit. Please contact the administrator.", 409);
            tx.update(performance(session.performanceId), { galleryItems, updatedAt: serverTimestamp() });
            tx.update(ref, { state: "complete", completedAt: now(), expiresAt: now() + 7 * 86400000 });
        });
        return completedResult(session.performanceId);
    }
    async function cleanup() {
        // Bound each daily job; leftover expired records will be collected on the next run.
        const expired = await records("sessions").where("expiresAt", "<", now()).limit(200).get();
        for (const snapshot of expired.docs) {
            const session = snapshot.data();
            await bucket.deleteFiles({ prefix: `gallery-upload-staging/${snapshot.id}/`, force: true });
            // Remove abandoned copies, but preserve anything referenced by a completed gallery.
            if (session.state !== "complete" && session.files) {
                const show = await performance(session.performanceId).get();
                const used = new Set((show.data()?.galleryItems || []).flatMap(item => [item.path, item.thumbnailPath]));
                for (const file of session.files) for (const thumb of [false, true]) {
                    if (thumb && !file.thumbnail) continue;
                    const info = thumb ? file.thumbnail : file;
                    const path = `performance-highlights/${session.performanceId}/community-${snapshot.id}-${file.id}${thumb ? "-thumb" : ""}.${mimeExtensions[info.mimeType]}`;
                    if (!used.has(path)) await bucket.file(path).delete({ ignoreNotFound: true });
                }
            }
            await snapshot.ref.delete();
        }
        const oldLimits = await records("limits").where("expiresAt", "<", now()).limit(500).get();
        if (oldLimits.docs.length) {
            const batch = db.batch(); oldLimits.docs.forEach(snapshot => batch.delete(snapshot.ref)); await batch.commit();
        }
        const oldCodes = await records("codes").where("createdAt", "<", now() - 86400000).limit(500).get();
        for (const snapshot of oldCodes.docs) {
            if ((await performance(snapshot.id).get()).exists) continue;
            await db.runTransaction(async tx => {
                const [current, show] = await Promise.all([tx.get(snapshot.ref), tx.get(performance(snapshot.id))]);
                if (!current.exists || show.exists) return;
                tx.delete(records("claims").doc(current.data().code)); tx.delete(snapshot.ref);
            });
        }
    }
    return { ensureCode, verify, prepare, finish, cleanup };
}
module.exports = { createUploadService, validateManifest, matchesMedia, performanceId, MAX_FILE_BYTES, MAX_BATCH_BYTES };
