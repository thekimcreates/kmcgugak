/*
========================================
KMC SAMULNORI
Public interface controller
========================================
*/

"use strict";

(() => {
    const DESKTOP_MENU_BREAKPOINT = 900;
    const NAVBAR_SCROLL_POINT = 40;

    function onReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else {
            callback();
        }
    }

    onReady(() => {
        const navbar = document.getElementById("navbar");
        const menuButton = document.getElementById("menu-toggle");
        const mobileMenu = document.getElementById("mobile-menu");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        let scrollFrame = 0;
        let menuScrollPosition = 0;

        /* Navbar ---------------------------------------------------------- */

        function updateNavbar() {
            scrollFrame = 0;
            navbar?.classList.toggle("scrolled", window.scrollY > NAVBAR_SCROLL_POINT);
        }

        function requestNavbarUpdate() {
            if (scrollFrame) return;
            scrollFrame = window.requestAnimationFrame(updateNavbar);
        }

        updateNavbar();
        window.addEventListener("scroll", requestNavbarUpdate, { passive: true });

        /* Mobile navigation ---------------------------------------------- */

        function isMenuOpen() {
            return Boolean(mobileMenu?.classList.contains("open"));
        }

        function lockPageScroll() {
            menuScrollPosition = window.scrollY;
            document.body.style.position = "fixed";
            document.body.style.top = `-${menuScrollPosition}px`;
            document.body.style.left = "0";
            document.body.style.right = "0";
            document.body.style.width = "100%";
        }

        function unlockPageScroll() {
            const wasLocked = document.body.style.position === "fixed";
            document.body.style.position = "";
            document.body.style.top = "";
            document.body.style.left = "";
            document.body.style.right = "";
            document.body.style.width = "";

            if (wasLocked) {
                window.scrollTo({ top: menuScrollPosition, left: 0, behavior: "auto" });
            }
        }

        function openMenu() {
            if (!mobileMenu || !menuButton || isMenuOpen()) return;

            window.KMCOverlayHistory?.enter("mobile-menu", { close: () => closeMenu(true), open: openMenu });
            mobileMenu.classList.add("open");
            menuButton.classList.add("active");
            menuButton.setAttribute("aria-expanded", "true");
            menuButton.setAttribute("aria-label", "Close navigation menu");
            mobileMenu.setAttribute("aria-hidden", "false");
            lockPageScroll();

            window.setTimeout(() => {
                mobileMenu.querySelector("a")?.focus({ preventScroll: true });
            }, reducedMotion.matches ? 0 : 120);
        }

        function closeMenu(restoreFocus = false) {
            if (!mobileMenu || !menuButton || !isMenuOpen()) return;

            if (window.KMCOverlayHistory?.leave("mobile-menu")) return;
            mobileMenu.classList.remove("open");
            menuButton.classList.remove("active");
            menuButton.setAttribute("aria-expanded", "false");
            menuButton.setAttribute("aria-label", "Open navigation menu");
            mobileMenu.setAttribute("aria-hidden", "true");
            unlockPageScroll();

            if (restoreFocus) menuButton.focus({ preventScroll: true });
        }

        function trapMenuFocus(event) {
            if (event.key !== "Tab" || !isMenuOpen() || !mobileMenu || !menuButton) return;

            const focusable = [menuButton, ...mobileMenu.querySelectorAll("a[href]")];
            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        if (menuButton && mobileMenu) {
            menuButton.setAttribute("aria-controls", "mobile-menu");
            menuButton.setAttribute("aria-expanded", "false");
            mobileMenu.setAttribute("aria-hidden", "true");

            menuButton.addEventListener("click", event => {
                event.stopPropagation();
                isMenuOpen() ? closeMenu() : openMenu();
            });

            mobileMenu.addEventListener("click", event => {
                if (event.target === mobileMenu) closeMenu(true);
            });

            mobileMenu.querySelectorAll("a[href]").forEach(link => {
                link.addEventListener("click", () => closeMenu());
            });

            document.addEventListener("keydown", event => {
                if (event.key === "Escape" && isMenuOpen()) {
                    event.preventDefault();
                    closeMenu(true);
                    return;
                }
                trapMenuFocus(event);
            });

            window.addEventListener("resize", () => {
                if (window.innerWidth > DESKTOP_MENU_BREAKPOINT && isMenuOpen()) closeMenu();
            }, { passive: true });
        }

        /* Reveal animations ------------------------------------------------ */

        let revealObserver = null;

        if ("IntersectionObserver" in window && !reducedMotion.matches) {
            revealObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("visible");
                    revealObserver.unobserve(entry.target);
                });
            }, {
                threshold: 0.12,
                rootMargin: "0px 0px -40px 0px"
            });
        }

        function registerRevealElements(root = document) {
            root.querySelectorAll?.(".reveal:not(.visible):not([data-reveal-observed])")
                .forEach(element => {
                    element.dataset.revealObserved = "true";
                    if (revealObserver) revealObserver.observe(element);
                    else element.classList.add("visible");
                });
        }

        registerRevealElements();
        window.addEventListener("kmc:home-sections-rendered", () => registerRevealElements());

        /* Same-page anchor links ------------------------------------------ */

        document.addEventListener("click", event => {
            const link = event.target.closest?.('a[href^="#"]');
            if (!link) return;

            const href = link.getAttribute("href");
            if (!href || href === "#") return;

            let target = null;
            try {
                target = document.querySelector(href);
            } catch (_error) {
                return;
            }

            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({
                behavior: reducedMotion.matches ? "auto" : "smooth",
                block: "start"
            });
        });

        /* Device theme ---------------------------------------------------- */

        const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const updateTheme = event => {
            const dark = typeof event?.matches === "boolean" ? event.matches : themeQuery.matches;
            document.documentElement.dataset.theme = dark ? "dark" : "light";
        };

        updateTheme();
        if (themeQuery.addEventListener) themeQuery.addEventListener("change", updateTheme);
        else themeQuery.addListener(updateTheme);

        /* Page lifecycle -------------------------------------------------- */

        document.body.classList.add("page-loaded");

        window.addEventListener("pageshow", () => {
            if (isMenuOpen()) closeMenu();
            updateNavbar();
            registerRevealElements();
        });

        window.KMC = Object.assign(window.KMC || {}, {
            version: "3.1",
            closeMenu,
            openMenu,
            updateNavbar,
            registerRevealElements
        });
    });
})();
