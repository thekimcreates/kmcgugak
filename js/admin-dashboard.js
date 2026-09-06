"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const firebaseServices = window.kmcFirebase || {};
    const auth = firebaseServices.auth;
    const db = firebaseServices.db;
    const tools = window.kmcAdminTools;

    const page = document.getElementById("admin-dashboard");
    const loading = document.getElementById("dashboard-loading");
    const email = document.getElementById("admin-user-email");
    const logout = document.getElementById("admin-logout");

    let redirecting = false;

    function redirectToLogin() {
        if (redirecting) return;
        redirecting = true;
        window.location.replace("login.html");
    }

    function showVerificationError(error) {
        console.error("Unable to verify administrator access:", error);

        if (loading) {
            loading.hidden = false;
            loading.innerHTML =
                'Unable to verify administrator access. ' +
                '<button type="button" id="admin-verification-retry">' +
                'Try Again</button>';
        }

        const retry = document.getElementById("admin-verification-retry");
        if (retry) {
            retry.addEventListener("click", () => {
                window.location.reload();
            }, { once: true });
        }
    }


    function renderActivity(container, documents) {
        container.replaceChildren();

        if (!documents.length) {
            const empty = document.createElement("p");
            empty.className = "activity-empty";
            empty.textContent = "No administrator activity has been recorded yet.";
            container.appendChild(empty);
            return;
        }

        documents.forEach(documentSnapshot => {
            const data = documentSnapshot.data();
            const article = document.createElement("article");
            article.className = "activity-item";

            const copy = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = `${data.action || "Updated"} ${data.entity || "content"}${data.label ? `: ${data.label}` : ""}`;

            const byline = document.createElement("p");
            byline.textContent = data.userEmail || "Administrator";

            const time = document.createElement("time");
            const date = data.createdAt?.toDate?.();
            time.textContent = date ? date.toLocaleString() : "Just now";

            copy.append(title, byline);
            article.append(copy, time);
            container.appendChild(article);
        });
    }

    async function loadActivity() {
        const container = document.getElementById("admin-activity-list");
        if (!container) return;

        try {
            let snapshot;

            try {
                snapshot = await db
                    .collection("adminActivity")
                    .orderBy("createdAt", "desc")
                    .limit(20)
                    .get();
            } catch (queryError) {
                /*
                 * A fallback is useful for old records that may not contain
                 * createdAt or for a temporarily disabled Firestore index.
                 * Permission errors must still be surfaced to the administrator.
                 */
                if (queryError?.code === "permission-denied" || queryError?.code === "unauthenticated") {
                    throw queryError;
                }

                console.warn("Ordered activity query failed; using client-side ordering:", queryError);
                snapshot = await db.collection("adminActivity").limit(100).get();
            }

            const documents = snapshot.docs.slice();
            documents.sort((left, right) => {
                const leftTime = left.data().createdAt?.toMillis?.() || 0;
                const rightTime = right.data().createdAt?.toMillis?.() || 0;
                return rightTime - leftTime;
            });

            renderActivity(container, documents.slice(0, 20));
        } catch (error) {
            console.error("Unable to load activity:", error);
            container.replaceChildren();

            const message = document.createElement("p");
            message.className = "activity-empty";

            if (error?.code === "permission-denied") {
                message.textContent = "Recent Activity is blocked by Firestore permissions. Publish the corrected rules file, then refresh this page.";
            } else if (error?.code === "unauthenticated") {
                message.textContent = "You have been logged out after 1 hour.";
            } else {
                message.textContent = `Recent Activity could not be loaded${error?.code ? ` (${error.code})` : ""}. Check the browser console for details.`;
            }

            container.appendChild(message);
        }
    }

    if (!auth || !db || !tools) {
        showVerificationError(
            new Error("Firebase Auth or Firestore did not initialize.")
        );
        return;
    }

    const unsubscribe = auth.onAuthStateChanged(async user => {
        unsubscribe();

        if (!user) {
            redirectToLogin();
            return;
        }

        try {
            if (!await tools.verifyAdmin(auth, db, user)) {
                await tools.signOut(auth);
                redirectToLogin();
                return;
            }

            if (email) {
                email.textContent = user.email || "Administrator";
            }

            if (loading) {
                loading.hidden = true;
            }

            if (page) {
                page.hidden = false;
            }

            await loadActivity();
        } catch (error) {
            /*
             * A temporary Firestore/network/rules error must not sign the user
             * out. The previous version did that, causing the login/dashboard
             * redirect loop.
             */
            showVerificationError(error);
        }
    });

    if (logout) {
        logout.addEventListener("click", async () => {
            logout.disabled = true;

            try {
                await tools.signOut(auth);
                redirectToLogin();
            } catch (error) {
                console.error("Unable to sign out:", error);
                logout.disabled = false;
            }
        });
    }
});
