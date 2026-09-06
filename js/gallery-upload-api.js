"use strict";
(() => {
    // This service verifies codes on the server. Codes are never put in a public performance document.
    const endpoint = () => window.KMC_UPLOAD_CONFIG?.endpoint ||
        `https://us-central1-${window.KMC_CONFIG.firebase.projectId}.cloudfunctions.net/galleryUploads`;
    async function request(action, body = {}, { admin = false, signal } = {}) {
        const headers = { "Content-Type": "application/json" };
        if (admin) {
            const user = window.kmcFirebase?.auth?.currentUser;
            if (!user) throw new Error("Sign in as an administrator to view upload codes.");
            headers.Authorization = `Bearer ${await user.getIdToken()}`;
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) controller.abort();
        const timer = setTimeout(abort, 120000);
        try {
            const response = await fetch(`${endpoint()}/${action}`, {
                method: "POST", headers, body: JSON.stringify(body),
                cache: "no-store", credentials: "omit", signal: controller.signal
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(result.error || "The upload service is unavailable. Please try again.");
                error.code = result.code || "service-unavailable";
                error.retryAfter = result.retryAfter || 0;
                throw error;
            }
            return result;
        } catch (error) {
            if (error instanceof TypeError) {
                throw new Error(admin
                    ? "The upload service is not available. Complete UPLOAD-SETUP.md, then try again."
                    : "The upload service is not available right now. Please try again later.");
            }
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
        }
    }
    function sendFile(policy, blob, onProgress) {
        return new Promise((resolve, reject) => {
            const form = new FormData();
            Object.entries(policy.fields).forEach(([key, value]) => form.append(key, value));
            // Cloud Storage requires the file to be the final form field.
            form.append("file", blob, "media");
            const xhr = new XMLHttpRequest();
            xhr.open("POST", policy.url);
            xhr.timeout = 60 * 60 * 1000;
            xhr.upload.onprogress = event => {
                if (event.lengthComputable) onProgress(Math.min(blob.size, Math.floor(event.loaded / event.total * blob.size)));
            };
            xhr.onerror = () => reject(new Error("The connection was interrupted. Press Submit to retry."));
            xhr.ontimeout = () => reject(new Error("This upload timed out. Press Submit to retry."));
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) { onProgress(blob.size); resolve(); }
                else reject(new Error("A file could not be uploaded. Press Submit to retry."));
            };
            xhr.send(form);
        });
    }
    window.KMCGalleryUploadAPI = { request, sendFile };
})();
