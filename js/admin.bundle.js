/* KMC Samulnori production bundle — generated 2026-07-25 */

/* ===== config.js ===== */
"use strict";

/*
 * KMC Samulnori deployment configuration
 *
 * This file is loaded before firebase.js and maps-loader.js.
 * Browser API keys are visible to visitors, so restrict the Google Maps
 * key by website/referrer and API in Google Cloud Console.
 */
window.KMC_CONFIG = Object.freeze({
    googleMapsApiKey: "AIzaSyD-MVpD9Qvsag1sJKHblNsBdQXZDXPTbMI",

    firebase: Object.freeze({
        apiKey: "AIzaSyClVxcqLellscu9ZOCuU0kW8odixzxAy9E",
        authDomain: "kmc-samulnori.firebaseapp.com",
        projectId: "kmc-samulnori",
        storageBucket: "kmc-samulnori.firebasestorage.app",
        messagingSenderId: "699194804568",
        appId: "1:699194804568:web:ce1f50a1a728c78d52bd2d"
    })
});

/* ===== firebase.js ===== */
"use strict";

(() => {
    const config = window.KMC_CONFIG?.firebase;

    const isConfigured =
        config &&
        Object.values(config).every((value) => {
            const text = String(value || "");
            return text && !text.includes("YOUR_") && !text.includes("PASTE_YOUR");
        });

    if (!isConfigured || typeof firebase === "undefined") {
        console.warn("KMC Firebase configuration is missing or Firebase failed to load.");
        window.kmcFirebase = {
            auth: null,
            db: null,
            storage: null
        };
        return;
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(config);
    }

    const auth = typeof firebase.auth === "function" ? firebase.auth() : null;
    const db = typeof firebase.firestore === "function" ? firebase.firestore() : null;
    const storage = typeof firebase.storage === "function" ? firebase.storage() : null;

    const persistenceReady = db && typeof db.enablePersistence === "function"
        ? db.enablePersistence({ synchronizeTabs: true }).catch((error) => {
            if (error?.code === "failed-precondition") {
                console.info("Firestore persistence is already controlled by another open tab.");
            } else if (error?.code === "unimplemented") {
                console.info("This browser does not support Firestore offline persistence.");
            } else {
                console.warn("Firestore offline persistence could not be enabled:", error);
            }
            return false;
        })
        : Promise.resolve(false);

    window.kmcFirebase = { auth, db, storage, persistenceReady };
})();

/* ===== admin-tools.js ===== */
"use strict";

(() => {
  const allowedTags = new Set(["P","BR","STRONG","B","EM","I","U","UL","OL","LI","A"]);

  function sanitizeHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!allowedTags.has(child.tagName)) {
            child.replaceWith(...child.childNodes);
            return;
          }
          const href = child.tagName === "A" ? child.getAttribute("href") || "" : "";
          [...child.attributes].forEach(attribute => child.removeAttribute(attribute.name));
          if (child.tagName === "A") {
            if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) child.removeAttribute("href");
            else {
              child.setAttribute("target", "_blank");
              child.setAttribute("rel", "noopener noreferrer");
            }
          }
          walk(child);
        } else if (child.nodeType !== Node.TEXT_NODE) child.remove();
      });
    };
    walk(template.content);
    return template.innerHTML;
  }

  function plainTextToHtml(text) {
    return String(text || "").split(/\n\s*\n/).map(part => part.trim()).filter(Boolean)
      .map(part => `<p>${part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`).join("");
  }

  function createRichEditor(initialHtml = "", ariaLabel = "Rich text editor") {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-editor";
    wrapper.innerHTML = `<div class="rich-editor-toolbar" role="toolbar" aria-label="Text formatting">
      <button type="button" data-command="bold" title="Bold"><strong>B</strong></button>
      <button type="button" data-command="italic" title="Italic"><em>I</em></button>
      <button type="button" data-command="underline" title="Underline"><u>U</u></button>
      <button type="button" data-command="insertUnorderedList" title="Bulleted list">• List</button>
      <button type="button" data-command="insertOrderedList" title="Numbered list">1. List</button>
      <button type="button" data-command="createLink" title="Add link">Link</button>
      <button type="button" data-command="removeFormat" title="Clear formatting">Clear</button>
    </div><div class="rich-editor-surface" contenteditable="true" role="textbox" aria-multiline="true"></div>`;
    const surface = wrapper.querySelector(".rich-editor-surface");
    surface.setAttribute("aria-label", ariaLabel);
    surface.innerHTML = sanitizeHtml(initialHtml);
    wrapper.querySelectorAll("[data-command]").forEach(button => button.addEventListener("click", () => {
      surface.focus({ preventScroll: true });
      const command = button.dataset.command;
      if (command === "createLink") {
        const url = window.prompt("Enter a full link beginning with https://");
        if (!url) return;
        if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return;
        document.execCommand(command, false, url);
      } else document.execCommand(command, false, null);
    }));
    wrapper.getHtml = () => sanitizeHtml(surface.innerHTML);
    wrapper.setHtml = value => { surface.innerHTML = sanitizeHtml(value); };
    wrapper.getText = () => surface.textContent.trim();
    return wrapper;
  }

  function ensureDialog() {
    let modal = document.getElementById("admin-confirm-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "admin-confirm-modal";
    modal.className = "admin-confirm-modal";
    modal.hidden = true;
    modal.innerHTML = `<div class="admin-confirm-backdrop"></div><section class="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title"><h2 id="admin-confirm-title">Confirm action</h2><p id="admin-confirm-message"></p><div class="admin-confirm-actions"><button class="admin-secondary-button" data-cancel type="button">Cancel</button><button class="admin-danger-button" data-confirm type="button">Confirm</button></div></section>`;
    document.body.appendChild(modal);
    return modal;
  }

  function confirmAction({ title = "Confirm action", message = "Are you sure?", confirmText = "Confirm", danger = true } = {}) {
    const modal = ensureDialog();
    modal.querySelector("h2").textContent = title;
    modal.querySelector("p").textContent = message;
    const confirmButton = modal.querySelector("[data-confirm]");
    confirmButton.textContent = confirmText;
    confirmButton.className = danger ? "admin-danger-button" : "admin-submit";
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    confirmButton.focus({ preventScroll: true });
    return new Promise(resolve => {
      const finish = result => {
        if (window.KMCOverlayHistory?.leave(modal.id, () => finish(result))) return;
        modal.classList.remove("is-open");
        setTimeout(() => { modal.hidden = true; }, 180);
        confirmButton.onclick = null;
        modal.querySelector("[data-cancel]").onclick = null;
        document.removeEventListener("keydown", onKey);
        resolve(result);
      };
      window.KMCOverlayHistory?.enter(modal.id, { close: () => finish(false), duration: 180 });
      const onKey = event => { if (event.key === "Escape") finish(false); };
      confirmButton.onclick = () => finish(true);
      modal.querySelector("[data-cancel]").onclick = () => finish(false);
      document.addEventListener("keydown", onKey);
    });
  }

  function showUndo(message, undo, { duration = 8000, onExpire } = {}) {
    let toast = document.getElementById("admin-undo-toast");
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.id = "admin-undo-toast";
    toast.className = "admin-undo-toast";
    toast.innerHTML = `<span></span><button type="button">Undo</button>`;
    toast.querySelector("span").textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    let completed = false;
    const close = async expired => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 220);
      if (expired && onExpire) await onExpire();
    };
    toast.querySelector("button").onclick = async () => { await undo(); await close(false); };
    const timer = setTimeout(() => close(true), duration);
    return () => close(true);
  }

  async function logActivity(db, auth, action, entity, entityId = "", label = "") {
    try {
      const user = auth?.currentUser;
      await db.collection("adminActivity").add({
        action, entity, entityId, label,
        userId: user?.uid || "",
        userEmail: user?.email || "Administrator",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.warn("Unable to record admin activity:", error);
    }
  }

  async function deleteStoragePath(storage, path) {
    if (!path) return;
    try { await storage.ref(path).delete(); }
    catch (error) { if (error?.code !== "storage/object-not-found") console.warn("Unable to remove old image:", error); }
  }

  const ADMIN_CACHE_PREFIX = "kmc-admin-access:";

  function adminCacheKey(user) {
    return `${ADMIN_CACHE_PREFIX}${user?.uid || "unknown"}`;
  }

  function clearAdminAccessCache(user) {
    try {
      if (user?.uid) sessionStorage.removeItem(adminCacheKey(user));
      else {
        Object.keys(sessionStorage)
          .filter(key => key.startsWith(ADMIN_CACHE_PREFIX))
          .forEach(key => sessionStorage.removeItem(key));
      }
    } catch (error) {
      console.info("Administrator session cache is unavailable:", error);
    }
  }

  function readCachedAdminAccess(user, ttl) {
    try {
      const raw = sessionStorage.getItem(adminCacheKey(user));
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (cached?.active === true && Date.now() - Number(cached.checkedAt || 0) < ttl) return true;
      sessionStorage.removeItem(adminCacheKey(user));
    } catch (error) {
      clearAdminAccessCache(user);
    }
    return null;
  }

  function cacheAdminAccess(user) {
    try {
      sessionStorage.setItem(adminCacheKey(user), JSON.stringify({ active: true, checkedAt: Date.now() }));
    } catch (error) {
      console.info("Administrator session cache could not be saved:", error);
    }
  }

  async function verifyAdmin(auth, db, user, { force = false, ttl = 5 * 60 * 1000, attempts = 3 } = {}) {
    if (!auth || !db || !user?.uid) return false;
    if (!force && readCachedAdminAccess(user, ttl) === true) return true;

    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const record = await db.collection("admins").doc(user.uid).get();
        const active = record.exists && record.data()?.active === true;
        if (active) cacheAdminAccess(user);
        else clearAdminAccessCache(user);
        return active;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 400));
      }
    }
    throw lastError;
  }

  async function signOut(auth) {
    const user = auth?.currentUser;
    clearAdminAccessCache(user);
    if (auth) await auth.signOut();
  }

  window.kmcAdminTools = {
    sanitizeHtml, plainTextToHtml, createRichEditor, confirmAction, showUndo,
    logActivity, deleteStoragePath, verifyAdmin, clearAdminAccessCache, signOut
  };
})();

/* ===== admin-motion.js ===== */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    const header = document.querySelector(".admin-site-header");
    const revealSelectors = [
        ".admin-dashboard-header",
        ".admin-login-card",
        ".admin-panel",
        ".dashboard-card",
        ".performance-admin-card",
        ".team-admin-card",
        ".admin-security-note",
        ".admin-public-footer"
    ];

    document.documentElement.classList.add("admin-motion-ready");

    if (header) {
        requestAnimationFrame(() => {
            header.classList.add("admin-header-visible");
        });
    }

    function prepareRevealElements(root = document) {
        const elements = root.matches?.(revealSelectors.join(","))
            ? [root]
            : [...root.querySelectorAll?.(revealSelectors.join(",")) || []];

        elements.forEach((element, index) => {
            if (element.dataset.adminRevealPrepared === "true") return;

            element.dataset.adminReveal = "";
            element.dataset.adminRevealPrepared = "true";
            element.style.setProperty(
                "--admin-reveal-delay",
                `${Math.min(index * 55, 275)}ms`
            );

            if (reduceMotion) {
                element.classList.add("admin-reveal-visible");
                return;
            }

            revealObserver.observe(element);
        });
    }

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("admin-reveal-visible");
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.08,
        rootMargin: "0px 0px -24px"
    });

    prepareRevealElements();

    const dynamicLists = document.querySelectorAll(
        "#performance-list, .admin-dashboard-grid, .team-admin-list"
    );

    dynamicLists.forEach((list) => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    node.classList.add("admin-new-record");
                    prepareRevealElements(node);
                });
            });
        });

        observer.observe(list, {
            childList: true
        });
    });

    /*
     * Enhances the existing popup without changing its form, map,
     * Firebase, or Google Places behavior.
     */
    const modalObserver = new MutationObserver(() => {
        const modal = document.querySelector(".performance-modal");
        if (!modal || modal.dataset.motionEnhanced === "true") return;

        modal.dataset.motionEnhanced = "true";

        const closeButton = modal.querySelector(".performance-modal-close");
        const originalClose = closeButton?.onclick;

        if (closeButton) {
            closeButton.addEventListener("click", () => {
                modal.classList.add("is-closing");
                window.setTimeout(() => {
                    modal.classList.remove("is-closing");
                }, 340);
            }, {
                capture: true
            });
        }

        modal.addEventListener("transitionend", (event) => {
            if (
                event.target.classList.contains("performance-modal-dialog") &&
                !modal.classList.contains("is-open")
            ) {
                modal.classList.remove("is-closing");
            }
        });

        void originalClose;
    });

    modalObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
});
