"use strict";
document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("performance-year");
    const wrapper = document.getElementById("performance-year-filter");
    const trigger = document.getElementById("performance-year-trigger");
    const summary = document.getElementById("performance-year-summary");
    const popover = document.getElementById("performance-year-popover");
    if (!select || !trigger || !popover) return;
    function close(restoreFocus = false) {
        if (window.KMCOverlayHistory?.leave("year-filter")) return;
        popover.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        wrapper.classList.remove("is-open");
        if (restoreFocus) trigger.focus();
    }
    function sync() {
        const focusedValue = popover.contains(document.activeElement) ? document.activeElement.dataset.value : null;
        trigger.disabled = select.disabled;
        summary.textContent = select.selectedOptions[0]?.textContent || "All";
        popover.replaceChildren(...[...select.options].map(option => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "performance-year-option";
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", String(option.value === select.value));
            button.tabIndex = option.value === select.value ? 0 : -1;
            button.dataset.value = option.value;
            button.textContent = option.textContent;
            button.addEventListener("click", () => {
                select.value = option.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                close(true);
            });
            return button;
        }));
        if (select.disabled) close();
        else if (focusedValue !== null) [...popover.children].find(button => button.dataset.value === focusedValue)?.focus();
    }
    function open(last = false) {
        if (trigger.disabled) return;
        document.getElementById("performance-arrangement-trigger")?.getAttribute("aria-expanded") === "true" &&
            document.getElementById("performance-arrangement-trigger").click();
        document.getElementById("performance-member-trigger")?.getAttribute("aria-expanded") === "true" &&
            document.getElementById("performance-member-trigger").click();
        if (window.KMCOverlayHistory?.deferOpen(() => open(last))) return;
        window.KMCOverlayHistory?.enter("year-filter", { close: () => close(true), open });
        popover.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        wrapper.classList.add("is-open");
        const buttons = [...popover.children];
        const target = last ? buttons.at(-1) : buttons.find(button => button.getAttribute("aria-selected") === "true") || buttons[0];
        target?.focus();
    }
    trigger.addEventListener("click", () => popover.hidden ? open() : close());
    trigger.addEventListener("keydown", event => {
        if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(event.key === "ArrowUp"); }
    });
    wrapper.addEventListener("keydown", event => {
        if (popover.hidden) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === "Tab") { close(); return; }
        const buttons = [...popover.children], current = buttons.indexOf(document.activeElement);
        let next = current;
        if (event.key === "ArrowDown") next = (current + 1) % buttons.length;
        else if (event.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = buttons.length - 1;
        else if (/^[0-9]$/.test(event.key)) next = buttons.findIndex(button => button.textContent.startsWith(event.key));
        else return;
        event.preventDefault();
        if (next >= 0) {
            buttons.forEach((button, index) => { button.tabIndex = index === next ? 0 : -1; });
            buttons[next]?.focus();
        }
    });
    document.addEventListener("click", event => { if (!wrapper.contains(event.target)) close(); });
    wrapper.addEventListener("focusout", event => { if (!wrapper.contains(event.relatedTarget)) close(); });
    select.addEventListener("change", sync);
    // The performance loader rebuilds the available years on background refresh.
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true });
    sync();
});
