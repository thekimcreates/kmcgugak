"use strict";

(() => {
    const DEFAULT_SECTIONS = [
        { id: "arrangements", type: "template", template: "arrangements", order: 0 },
        { id: "performances", type: "template", template: "performances", order: 1 },
        { id: "team", type: "template", template: "team", order: 2 }
    ];

    const ALLOWED_TAGS = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A"]);

    function sanitizeHtml(html) {
        const template = document.createElement("template");
        template.innerHTML = String(html || "");
        const clean = node => {
            [...node.childNodes].forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (!ALLOWED_TAGS.has(child.tagName)) {
                        child.replaceWith(...child.childNodes);
                        return;
                    }
                    const href = child.tagName === "A" ? child.getAttribute("href") || "" : "";
                    [...child.attributes].forEach(attribute => child.removeAttribute(attribute.name));
                    if (child.tagName === "A" && (/^https?:\/\//i.test(href) || /^mailto:/i.test(href))) {
                        child.setAttribute("href", href);
                        child.setAttribute("target", "_blank");
                        child.setAttribute("rel", "noopener noreferrer");
                    }
                    clean(child);
                } else if (child.nodeType !== Node.TEXT_NODE) {
                    child.remove();
                }
            });
        };
        clean(template.content);
        return template.innerHTML;
    }

    function normalizeSections(value) {
        const supplied = Array.isArray(value) ? value.filter(Boolean) : [];
        const byId = new Map(supplied.map(section => [section.id, section]));
        const result = DEFAULT_SECTIONS.map(defaultSection => {
            const merged = { ...defaultSection, ...(byId.get(defaultSection.id) || {}) };
            byId.delete(defaultSection.id);
            return merged;
        });
        byId.forEach(section => {
            if (["text", "images"].includes(section.type) && section.id) result.push(section);
        });
        return result
            .filter(section => section.hidden !== true)
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    }

    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("home-sections-root");
        if (!root) return;
        const dataApi = window.KMCHomeData;
        const templateNodes = new Map();
        let renderedSignature = "";

        function getTemplateNode(templateName) {
            if (templateNodes.has(templateName)) return templateNodes.get(templateName).cloneNode(true);
            const source = document.getElementById(`home-section-template-${templateName}`);
            const node = source?.content?.firstElementChild?.cloneNode(true);
            if (node) {
                node.dataset.homeSectionId = templateName;
                templateNodes.set(templateName, node);
                return node.cloneNode(true);
            }
            return null;
        }

        function createTextSection(section) {
            const element = document.createElement("section");
            element.className = "home-text-section section";
            element.dataset.homeSectionId = section.id;
            const container = document.createElement("div");
            container.className = "section-container home-text-section-container";
            const header = document.createElement("div");
            header.className = "section-header reveal visible";
            const heading = document.createElement("h2");
            heading.textContent = section.heading || "";
            header.appendChild(heading);
            const body = document.createElement("div");
            body.className = "home-custom-rich-text reveal visible";
            body.innerHTML = sanitizeHtml(section.bodyHtml || "");
            container.append(header, body);
            element.appendChild(container);
            return element;
        }

        function createImageSection(section) {
            const element = createTextSection({ ...section, bodyHtml: "" });
            element.classList.add("home-images-section");
            const grid = element.querySelector(".home-custom-rich-text");
            grid.className = "home-caption-grid";
            (Array.isArray(section.images) ? section.images : []).forEach(item => {
                if (!item || !/^https?:\/\//i.test(item.url || "")) return;
                const figure = document.createElement("figure");
                const image = document.createElement("img");
                image.src = item.url;
                image.alt = item.caption || "";
                image.loading = "lazy";
                image.decoding = "async";
                if (item.width > 0 && item.height > 0) { image.width = item.width; image.height = item.height; }
                figure.append(image);
                if (item.caption) {
                    const caption = document.createElement("figcaption");
                    caption.textContent = item.caption;
                    figure.append(caption);
                }
                grid.append(figure);
            });
            return grid.children.length ? element : null;
        }

        function render(sections, force = false) {
            const normalized = normalizeSections(sections);
            const signature = JSON.stringify(normalized);
            if (!force && signature === renderedSignature) return;
            renderedSignature = signature;
            const fragment = document.createDocumentFragment();
            normalized.forEach(section => {
                const node = section.type === "images" ? createImageSection(section) : section.type === "text"
                    ? createTextSection(section)
                    : getTemplateNode(section.template || section.id);
                if (node) fragment.appendChild(node);
            });
            root.replaceChildren(fragment);
            window.dispatchEvent(new CustomEvent("kmc:home-sections-rendered"));
        }

        const cached = dataApi?.cachedValue("home-content");
        render(cached?.sections || DEFAULT_SECTIONS, true);

        const refresh = () => dataApi?.getHomeContent()
            .then(content => render(content?.sections || DEFAULT_SECTIONS))
            .catch(error => console.warn("Unable to refresh homepage sections:", error));

        if ("requestIdleCallback" in window) requestIdleCallback(refresh, { timeout: 1200 });
        else window.setTimeout(refresh, 0);
    });
})();
