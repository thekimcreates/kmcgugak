"use strict";
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { createUploadService } = require("./lib/service");
initializeApp();
const db = getFirestore();
const service = createUploadService({ db, bucket: getStorage().bucket(), serverTimestamp: () => FieldValue.serverTimestamp() });

exports.galleryUploads = onRequest({ region: "us-central1", cors: true, invoker: "public", timeoutSeconds: 120, memory: "512MiB", maxInstances: 5 }, async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") { res.status(405).json({ error: "Use POST." }); return; }
    if (!req.is("application/json") || !req.body || Buffer.byteLength(JSON.stringify(req.body)) > 100000) {
        res.status(400).json({ error: "Invalid request." }); return;
    }
    try {
        let result;
        switch (req.path.replace(/\/$/, "")) {
            case "/codes": {
                const token = (req.get("Authorization") || "").replace(/^Bearer /, "");
                let user;
                try { user = await getAuth().verifyIdToken(token, true); }
                catch (_) { throw Object.assign(new Error("Sign in as an administrator."), { status: 401, code: "unauthorized" }); }
                const admin = await db.collection("admins").doc(user.uid).get();
                if (!admin.exists || admin.data().active !== true) throw Object.assign(new Error("Administrator access is required."), { status: 403, code: "forbidden" });
                const ids = req.body.performanceIds;
                if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw Object.assign(new Error("Choose 1 to 50 performances."), { status: 400 });
                result = { codes: {} };
                for (const id of ids) result.codes[id] = await service.ensureCode(id, req.body.allowDraft === true && ids.length === 1);
                break;
            }
            case "/verify": result = await service.verify(req.body, req.ip || req.socket.remoteAddress || "unknown"); break;
            case "/prepare": result = await service.prepare(req.body); break;
            case "/finish": result = await service.finish(req.body); break;
            default: res.status(404).json({ error: "Not found." }); return;
        }
        res.json(result);
    } catch (error) {
        // Do not log request bodies, PINs, signed URLs, or bearer capabilities.
        if (!error.status) console.error("Gallery upload service failure:", error.code || error.name);
        if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
        res.status(error.status || 500).json({ error: error.status ? error.message : "The upload service could not complete this request. Please try again.", code: error.code || "internal", retryAfter: error.retryAfter || 0 });
    }
});
exports.cleanupGalleryUploads = onSchedule({ schedule: "every 24 hours", region: "us-central1", timeoutSeconds: 540, memory: "512MiB", maxInstances: 1 }, () => service.cleanup());
