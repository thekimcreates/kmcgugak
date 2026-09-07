"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const header = document.querySelector(".admin-site-header");

    document.documentElement.classList.add("admin-motion-ready");

    if (header) {
        requestAnimationFrame(() => {
            header.classList.add("admin-header-visible");
        });
    }

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
