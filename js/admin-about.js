"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const { auth, db, storage } = window.kmcFirebase || {};
  const tools = window.kmcAdminTools;
  const optimizer = window.kmcImageOptimizer;
  const loading = document.getElementById("information-loading");
  const page = document.getElementById("information-admin");
  const email = document.getElementById("admin-user-email");
  const logout = document.getElementById("admin-logout");
  const form = document.getElementById("information-form");
  const status = document.getElementById("information-status");
  const save = document.getElementById("save-information");
  const saveBar = document.getElementById("information-save-bar");
  const saveMessage = document.getElementById("information-save-message");
  const revertButton = document.getElementById("revert-information");
  const redirect = () => location.replace("/login");
  let current = window.KMCSiteInformation?.fallback || {};
  let pending = { circle: null, full: null };
  let savedTimer = null;

  const setStatus = (message = "", type = "") => {
    status.textContent = message;
    status.className = "login-status";
    if (type) status.classList.add(`is-${type}`);
  };

  function setDirty(dirty = true) {
    window.clearTimeout(savedTimer);
    saveBar.classList.toggle("is-visible", dirty);
    saveBar.setAttribute("aria-hidden", String(!dirty));
    saveBar.inert = !dirty;
    if (!dirty) return;
    saveMessage.textContent = "Your changes are not saved. Press the button to save changes.";
    saveMessage.classList.remove("is-saved");
    revertButton.hidden = false;
    save.disabled = false;
    save.classList.remove("is-saving", "is-saved");
    save.textContent = "Save Changes";
    save.removeAttribute("aria-label");
  }

  function showSaving() {
    saveBar.classList.add("is-visible");
    saveBar.setAttribute("aria-hidden", "false");
    saveBar.inert = false;
    revertButton.hidden = true;
    save.disabled = true;
    save.classList.add("is-saving");
    save.innerHTML = '<span class="information-save-spinner" aria-hidden="true"></span>';
    save.setAttribute("aria-label", "Saving changes");
  }

  function showSaved() {
    saveMessage.textContent = "Changes saved successfully.";
    saveMessage.classList.add("is-saved");
    setStatus();
    revertButton.hidden = true;
    save.classList.remove("is-saving");
    save.classList.add("is-saved");
    save.disabled = true;
    save.textContent = "✓";
    save.setAttribute("aria-label", "Changes saved successfully");
    savedTimer = window.setTimeout(() => setDirty(false), 3000);
  }

  function populate(data) {
    current = window.KMCSiteInformation.normalize(data);
    window.KMCHistoryEditor.populate(current.aboutHistory, () => setDirty());
    document.getElementById("contact-label").value = current.footer.contactLabel;
    document.getElementById("contact-email").value = current.footer.contactEmail;
    document.getElementById("copyright-text").value = current.footer.copyrightText;
    document.getElementById("footer-message").value = current.footer.message;
    document.getElementById("show-contact").checked = current.footer.showContact;
    document.getElementById("show-footer-logo").checked = current.footer.showLogo;
    setPreview("circle", current.circleLogoUrl || "/assets/logo/kmcoc-circlelogo.png");
    setPreview("full", current.fullLogoUrl || "../assets/logo/full.webp");
    updateFooterPreview();
  }

  function setPreview(kind, url) {
    document.getElementById(`${kind}-logo-preview`).src = url;
  }

  async function selectLogo(kind, file) {
    if (!file) return;
    try {
      setStatus(`Preparing ${kind} logo…`);
      const result = await optimizer.optimize(file, kind === "circle"
        ? { maxWidth: 900, maxHeight: 900, quality: 0.9, preserveTransparency: true }
        : { maxWidth: 2200, maxHeight: 900, quality: 0.9, preserveTransparency: true });
      pending[kind] = result;
      setPreview(kind, URL.createObjectURL(result.blob));
      document.getElementById(`${kind}-logo-note`).textContent = optimizer.summary(result);
      setDirty();
      setStatus("Logo prepared. Press Save Changes to publish it.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Unable to prepare this image.", "error");
    }
  }

  async function uploadLogo(kind, result) {
    if (!result) return current[`${kind}LogoUrl`] || "";
    if (!storage) throw new Error("Firebase Storage is unavailable.");
    const path = `site-information/logos/${kind}-${Date.now()}.${result.extension}`;
    const reference = storage.ref().child(path);
    const snapshot = await reference.put(result.blob, { contentType: result.contentType, cacheControl: "public,max-age=31536000,immutable" });
    return snapshot.ref.getDownloadURL();
  }

  function updateFooterPreview() {
    const label = document.getElementById("contact-label").value.trim() || "Contact";
    const address = document.getElementById("contact-email").value.trim();
    document.getElementById("footer-preview-contact").textContent = address ? `${label}: ${address}` : label;
    document.getElementById("footer-preview-message").textContent = document.getElementById("footer-message").value.trim();
    document.getElementById("footer-preview-copyright").textContent = document.getElementById("copyright-text").value.trim();
    document.getElementById("footer-preview-contact").hidden = !document.getElementById("show-contact").checked;
    document.getElementById("footer-preview-logo").hidden = !document.getElementById("show-footer-logo").checked;
  }

  auth?.onAuthStateChanged(async user => {
    if (!user) return redirect();
    try {
      if (!await tools.verifyAdmin(auth, db, user)) { await tools.signOut(auth); return redirect(); }
      email.textContent = user.email || "Administrator";
      const snap = await db.collection("siteContent").doc("information").get();
      populate(snap.exists ? snap.data() : window.KMCSiteInformation.fallback);
      setDirty(false);
      loading.hidden = true;
      page.hidden = false;
    } catch (error) {
      console.error(error);
      setStatus("Unable to load the About page settings.", "error");
    }
  });

  ["circle", "full"].forEach(kind => {
    document.getElementById(`${kind}-logo-input`).addEventListener("change", event => selectLogo(kind, event.target.files?.[0]));
    document.getElementById(`reset-${kind}-logo`).addEventListener("click", () => {
      pending[kind] = null;
      setPreview(kind, current[`${kind}LogoUrl`] || `../assets/logo/${kind}.webp`);
      document.getElementById(`${kind}-logo-note`).textContent = "";
      setDirty();
    });
  });

  ["input", "change"].forEach(eventName => form.addEventListener(eventName, () => {
    updateFooterPreview();
    setDirty();
  }));
  revertButton.addEventListener("click", () => window.location.reload());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const contactEmail = document.getElementById("contact-email").value.trim();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      setDirty();
      return setStatus("Enter a valid contact email address.", "error");
    }
    const historyError = window.KMCHistoryEditor.validate();
    if (historyError) { setDirty(); return setStatus(historyError, "error"); }
    const aboutHistory = window.KMCHistoryEditor.read();
    showSaving();
    try {
      const [circleLogoUrl, fullLogoUrl] = await Promise.all([
        uploadLogo("circle", pending.circle),
        uploadLogo("full", pending.full)
      ]);
      const data = {
        circleLogoUrl,
        fullLogoUrl,
        footer: {
          contactLabel: document.getElementById("contact-label").value.trim() || "Contact",
          contactEmail,
          copyrightText: document.getElementById("copyright-text").value.trim(),
          message: document.getElementById("footer-message").value.trim(),
          showContact: document.getElementById("show-contact").checked,
          showLogo: document.getElementById("show-footer-logo").checked
        },
        aboutHistory,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: auth.currentUser?.uid || ""
      };
      await db.collection("siteContent").doc("information").set(data, { merge: true });
      current = window.KMCSiteInformation.normalize(data);
      pending = { circle: null, full: null };
      window.KMCSiteInformation.apply(current);
      try { localStorage.removeItem("kmc-shared-data-v1:site-information"); } catch (_) {}
      await tools.logActivity(db, auth, "Updated", "information", "information", "Website About page");
      showSaved();
    } catch (error) {
      console.error(error);
      setDirty();
      setStatus("Unable to save. Check Firestore and Storage rules.", "error");
    }
  });

  logout.addEventListener("click", async () => { logout.disabled = true; await tools.signOut(auth); redirect(); });
});
