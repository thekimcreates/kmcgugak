"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("admin-login-form");
  const email = document.getElementById("admin-email");
  const password = document.getElementById("admin-password");
  const toggle = document.getElementById("password-toggle");
  const submit = document.getElementById("admin-login-submit");
  const status = document.getElementById("login-status");
  const { auth, db } = window.kmcFirebase || {};
  const tools = window.kmcAdminTools;
  let manualSignInInProgress = false;
  let redirectStarted = false;

  const message = (text, type = "") => {
    status.textContent = text;
    status.className = "login-status" + (type ? ` is-${type}` : "");
  };

  if (new URLSearchParams(location.search).get("expired") === "1") {
    message("You have been logged out after 1 hour.");
  }

  const loading = on => {
    submit.disabled = on;
    submit.querySelector("span").textContent = on ? "Verifying…" : "Sign In";
  };

  const goToDashboard = () => {
    if (redirectStarted) return;
    redirectStarted = true;
    window.location.replace("dashboard.html");
  };

  const authorized = user => tools.verifyAdmin(auth, db, user);

  const friendly = error => ({
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/user-not-found": "The email or password is incorrect.",
    "auth/wrong-password": "The email or password is incorrect."
  }[error?.code] || "Unable to verify administrator access. Please try again.");

  toggle.addEventListener("click", () => {
    const hidden = password.type === "password";
    password.type = hidden ? "text" : "password";
    toggle.textContent = hidden ? "Hide" : "Show";
  });

  if (!auth || !db || !tools) {
    message("Firebase is not configured yet. Check the project configuration.", "error");
    submit.disabled = true;
    return;
  }

  auth.onAuthStateChanged(async user => {
    if (!user || manualSignInInProgress || redirectStarted) return;
    loading(true);
    message("Verifying your administrator access…");
    try {
      if (await authorized(user)) {
        goToDashboard();
        return;
      }
      await tools.signOut(auth);
      message("This account does not have administrator access.", "error");
    } catch (error) {
      console.warn("Existing administrator session could not be verified:", error);
      message(friendly(error), "error");
    } finally {
      if (!redirectStarted) loading(false);
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (manualSignInInProgress || redirectStarted) return;
    message("");

    if (!email.value.trim() || !password.value) {
      message("Enter your email and password.", "error");
      return;
    }

    manualSignInInProgress = true;
    loading(true);
    try {
      const result = await auth.signInWithEmailAndPassword(email.value.trim(), password.value);
      message("Login accepted. Verifying administrator access…");

      if (!(await authorized(result.user))) {
        await tools.signOut(auth);
        message("This account does not have administrator access.", "error");
        return;
      }

      message("Access verified. Opening the dashboard…", "success");
      goToDashboard();
    } catch (error) {
      console.error(error);
      message(friendly(error), "error");
    } finally {
      manualSignInInProgress = false;
      if (!redirectStarted) loading(false);
    }
  });
});
