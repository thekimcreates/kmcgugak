"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const firebaseServices = window.kmcFirebase || {};
    const auth = firebaseServices.auth;
    const db = firebaseServices.db;
    const tools = window.kmcAdminTools;

    const DEFAULT_SECTIONS = [
        { id: "arrangements", type: "template", template: "arrangements", label: "Our Arrangements", order: 0 },
        { id: "performances", type: "template", template: "performances", label: "Our Performances", order: 1 },
        { id: "team", type: "template", template: "team", label: "Meet The Team", order: 2 }
    ];

    const page = document.getElementById("home-sections-admin");
    const loading = document.getElementById("home-sections-loading");
    const list = document.getElementById("home-section-list");
    const pageStatus = document.getElementById("home-section-status");
    const email = document.getElementById("admin-user-email");
    const logout = document.getElementById("admin-logout");
    const addButton = document.getElementById("add-text-section");
    const modal = document.getElementById("home-section-editor-modal");
    const form = document.getElementById("home-section-form");
    const idField = document.getElementById("home-section-id");
    const headingField = document.getElementById("home-section-heading");
    const formStatus = document.getElementById("home-section-form-status");

    let sections = [];
    let richEditor = null;
    let redirecting = false;

    const status = (element, message, type = "") => {
        if (!element) return;
        element.textContent = message;
        element.className = `login-status${type ? ` ${type}` : ""}`;
    };

    function redirectToLogin() {
        if (redirecting) return;
        redirecting = true;
        window.location.replace("/admin/login/");
    }

    function normalize(value) {
        const supplied = Array.isArray(value) ? value.filter(Boolean) : [];
        const byId = new Map(supplied.map(section => [section.id, section]));
        const output = [];

        DEFAULT_SECTIONS.forEach(defaultSection => {
            output.push({ ...defaultSection, ...(byId.get(defaultSection.id) || {}) });
            byId.delete(defaultSection.id);
        });

        byId.forEach(section => {
            if (section.type === "text" && section.id) output.push(section);
        });

        return output
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
            .map((section, order) => ({ ...section, order }));
    }

    async function saveSections(activity = null) {
        sections = normalize(sections);
        await db.collection("siteContent").doc("homeSections").set({ sections }, { merge: true });
        if (activity) {
            await tools?.logActivity?.(db, auth, activity.action, "homepage section", activity.id || "", activity.label || "");
        }
    }

    function sectionLabel(section) {
        if (section.type === "text") return section.heading || "Untitled text section";
        return section.label || DEFAULT_SECTIONS.find(item => item.id === section.id)?.label || "Homepage section";
    }

    function openModal(section = null) {
        idField.value = section?.id || "";
        headingField.value = section?.heading || "";
        document.getElementById("home-section-editor-title").textContent = section ? "Edit Header and Text" : "Add Header and Text";
        formStatus.textContent = "";

        const host = document.getElementById("home-section-body-editor");
        richEditor = tools.createRichEditor(section?.bodyHtml || "", "Homepage section text");
        host.replaceChildren(richEditor);

        modal.hidden = false;
        modal.setAttribute("aria-hidden", "false");
        requestAnimationFrame(() => modal.classList.add("is-open"));
        headingField.focus({ preventScroll: true });
    }

    function closeModal() {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        window.setTimeout(() => { modal.hidden = true; }, 180);
    }

    function renderList() {
        list.replaceChildren();
        sections = normalize(sections);

        sections.forEach(section => {
            const row = document.createElement("article");
            row.className = "home-section-admin-card";
            row.dataset.sectionId = section.id;

            const handle = document.createElement("button");
            handle.type = "button";
            handle.className = "home-section-drag-handle";
            handle.setAttribute("aria-label", `Reorder ${sectionLabel(section)}`);
            handle.title = "Drag to reorder";
            handle.innerHTML = "<span></span><span></span><span></span>";
            handle.addEventListener("pointerdown", beginDrag);

            const copy = document.createElement("div");
            copy.className = "home-section-admin-copy";
            const title = document.createElement("h3");
            title.textContent = sectionLabel(section);
            const meta = document.createElement("p");
            meta.textContent = section.type === "text" ? "Custom header and text" : "Built-in homepage template";
            copy.append(title, meta);

            const actions = document.createElement("div");
            actions.className = "home-section-admin-actions";

            if (section.type === "text") {
                const edit = document.createElement("button");
                edit.type = "button";
                edit.className = "admin-secondary-button admin-small-button";
                edit.textContent = "Edit";
                edit.addEventListener("click", () => openModal(section));

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "admin-danger-button admin-small-button";
                remove.textContent = "Delete";
                remove.addEventListener("click", () => deleteSection(section));
                actions.append(edit, remove);
            } else {
                const badge = document.createElement("span");
                badge.className = "home-section-template-badge";
                badge.textContent = "Template";
                actions.appendChild(badge);
            }

            row.append(handle, copy, actions);
            list.appendChild(row);
        });
    }

    function syncFromDom() {
        const byId = new Map(sections.map(section => [section.id, section]));
        sections = [...list.querySelectorAll(".home-section-admin-card")]
            .map((card, order) => ({ ...byId.get(card.dataset.sectionId), order }))
            .filter(Boolean);
    }

    function beginDrag(event) {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();

        const handle = event.currentTarget;
        const card = handle.closest(".home-section-admin-card");
        if (!card) return;

        const pointerId = event.pointerId;
        const rect = card.getBoundingClientRect();
        const offsetY = event.clientY - rect.top;
        const placeholder = document.createElement("div");
        placeholder.className = "home-section-sort-placeholder";
        placeholder.style.height = `${rect.height}px`;
        card.before(placeholder);

        const preview = card.cloneNode(true);
        preview.classList.add("home-section-drag-preview");
        preview.style.width = `${Math.min(rect.width, window.innerWidth - 24)}px`;
        preview.querySelectorAll("button").forEach(button => { button.tabIndex = -1; });
        document.body.appendChild(preview);

        card.classList.add("is-home-section-sort-source");
        document.body.classList.add("home-section-sorting");

        let lastY = event.clientY;
        let ended = false;
        let animationFrame = 0;

        const positionPreview = clientY => {
            const maxTop = Math.max(12, window.innerHeight - preview.offsetHeight - 12);
            const top = Math.max(12, Math.min(maxTop, clientY - offsetY));
            const left = Math.max(12, Math.min(rect.left, window.innerWidth - preview.offsetWidth - 12));
            preview.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        };

        const positionPlaceholder = clientY => {
            const candidates = [...list.querySelectorAll(".home-section-admin-card:not(.is-home-section-sort-source)")];
            const next = candidates.find(candidate => {
                const candidateRect = candidate.getBoundingClientRect();
                return clientY < candidateRect.top + candidateRect.height / 2;
            });
            if (next) list.insertBefore(placeholder, next);
            else list.appendChild(placeholder);
        };

        const move = moveEvent => {
            if (moveEvent.pointerId !== pointerId) return;
            moveEvent.preventDefault();
            lastY = moveEvent.clientY;
            positionPreview(lastY);
            positionPlaceholder(lastY);
        };

        const finish = async endEvent => {
            if (ended || (endEvent?.pointerId != null && endEvent.pointerId !== pointerId)) return;
            ended = true;
            document.removeEventListener("pointermove", move, true);
            document.removeEventListener("pointerup", finish, true);
            document.removeEventListener("pointercancel", finish, true);
            window.removeEventListener("blur", finish);
            cancelAnimationFrame(animationFrame);

            placeholder.replaceWith(card);
            preview.remove();
            card.classList.remove("is-home-section-sort-source");
            document.body.classList.remove("home-section-sorting");
            syncFromDom();

            try {
                await saveSections({ action: "Reordered", label: "Home page sections" });
                status(pageStatus, "Homepage order saved.", "success");
            } catch (error) {
                console.error(error);
                status(pageStatus, "The new order could not be saved.", "error");
            }
            handle.focus({ preventScroll: true });
        };

        const autoScroll = () => {
            const edge = Math.min(110, window.innerHeight * 0.18);
            if (lastY < edge) window.scrollBy(0, -Math.max(3, Math.round((edge - lastY) / 10)));
            else if (lastY > window.innerHeight - edge) window.scrollBy(0, Math.max(3, Math.round((lastY - (window.innerHeight - edge)) / 10)));
            positionPlaceholder(lastY);
            animationFrame = requestAnimationFrame(autoScroll);
        };

        positionPreview(lastY);
        document.addEventListener("pointermove", move, { capture: true, passive: false });
        document.addEventListener("pointerup", finish, true);
        document.addEventListener("pointercancel", finish, true);
        window.addEventListener("blur", finish);
        animationFrame = requestAnimationFrame(autoScroll);
    }

    async function deleteSection(section) {
        const confirmed = await tools.confirmAction({
            title: "Delete homepage section?",
            message: `Delete “${sectionLabel(section)}” from the homepage?`,
            confirmText: "Delete"
        });
        if (!confirmed) return;

        const previous = [...sections];
        sections = sections.filter(item => item.id !== section.id);
        try {
            await saveSections({ action: "Deleted", id: section.id, label: sectionLabel(section) });
            renderList();
            tools.showUndo("Homepage section deleted.", async () => {
                sections = previous;
                await saveSections({ action: "Restored", id: section.id, label: sectionLabel(section) });
                renderList();
            });
        } catch (error) {
            sections = previous;
            console.error(error);
            status(pageStatus, "The section could not be deleted.", "error");
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const heading = headingField.value.trim();
        if (!heading) return status(formStatus, "Enter a header.", "error");

        const oldId = idField.value;
        const existing = sections.find(section => section.id === oldId);
        const id = oldId || `text-${Date.now()}`;
        const record = {
            id,
            type: "text",
            heading,
            bodyHtml: richEditor.getHtml(),
            bodyText: richEditor.getText(),
            order: existing?.order ?? sections.length
        };

        sections = existing
            ? sections.map(section => section.id === id ? record : section)
            : [...sections, record];

        try {
            await saveSections({ action: existing ? "Updated" : "Created", id, label: heading });
            renderList();
            closeModal();
            status(pageStatus, "Homepage section saved.", "success");
        } catch (error) {
            console.error(error);
            status(formStatus, "The section could not be saved.", "error");
        }
    });

    addButton.addEventListener("click", () => openModal());
    modal.querySelector("[data-close-home-section-modal]").addEventListener("click", closeModal);
    logout.addEventListener("click", async () => {
        logout.disabled = true;
        await tools.signOut(auth);
        redirectToLogin();
    });

    if (!auth || !db || !tools) {
        loading.textContent = "Firebase or the admin tools could not be initialized.";
        return;
    }

    const unsubscribe = auth.onAuthStateChanged(async user => {
        unsubscribe();
        if (!user) return redirectToLogin();

        try {
            if (!await tools.verifyAdmin(auth, db, user)) {
                await tools.signOut(auth);
                return redirectToLogin();
            }

            email.textContent = user.email || "Administrator";
            const snapshot = await db.collection("siteContent").doc("homeSections").get();
            sections = normalize(snapshot.exists ? snapshot.data()?.sections : DEFAULT_SECTIONS);
            if (!snapshot.exists) await saveSections();
            renderList();
            loading.hidden = true;
            page.hidden = false;
        } catch (error) {
            console.error("Unable to load homepage editor:", error);
            loading.textContent = "The homepage editor could not be loaded. Check the Firestore rule included with this update.";
        }
    });
});
