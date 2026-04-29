/**
 * Service Worker Global Shims
 *
 * Service workers have no DOM. Libraries (sql.js, Vite helpers, etc.) may
 * probe browser globals at import time. We shim everything once to avoid
 * repeated ReferenceError crashes.
 *
 * MUST be imported before any other module in the service worker entry.
 */

const noop = () => {};
const emptyNodeList: never[] = [];

/** Typed accessor for assigning to globalThis in a service worker context. */
const _g = globalThis as unknown as Record<string, unknown>;

interface ShimElement {
    style: Record<string, unknown>;
    dataset: Record<string, unknown>;
    classList: { add: () => void; remove: () => void; toggle: () => void; contains: () => boolean };
    setAttribute: () => void;
    getAttribute: () => null;
    removeAttribute: () => void;
    appendChild: () => void;
    removeChild: () => void;
    insertBefore: () => void;
    remove: () => void;
    addEventListener: () => void;
    removeEventListener: () => void;
    dispatchEvent: () => boolean;
    getBoundingClientRect: () => { top: number; left: number; right: number; bottom: number; width: number; height: number };
    relList: { supports: () => boolean; add: () => void; remove: () => void; contains: () => boolean };
    children: never[];
    childNodes: never[];
    parentNode: null;
    innerHTML: string;
    textContent: string;
    tagName: string;
}

// eslint-disable-next-line max-lines-per-function
function makeElement(): ShimElement {
    return {
        style: {},
        dataset: {},
        classList: {
            add: noop,
            remove: noop,
            toggle: noop,
            contains: () => false,
        },
        setAttribute: noop,
        getAttribute: () => null,
        removeAttribute: noop,
        appendChild: noop,
        removeChild: noop,
        insertBefore: noop,
        remove: noop,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => true,
        getBoundingClientRect: () => ({
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
        }),
        relList: {
            supports: () => false,
            add: noop,
            remove: noop,
            contains: () => false,
        },
        children: emptyNodeList,
        childNodes: emptyNodeList,
        parentNode: null,
        innerHTML: "",
        textContent: "",
        tagName: "DIV",
    };
}

function shimWindow(): void {
    if (typeof window !== "undefined") {
        return;
    }
    _g.window = globalThis;
}

function shimDocument(): void {
    if (typeof document !== "undefined") {
        return;
    }

    const headEl = makeElement();
    const bodyEl = makeElement();

    _g.document = {
        currentScript: null,
        documentElement: makeElement(),
        head: headEl,
        body: bodyEl,
        title: "",
        cookie: "",
        readyState: "complete",
        getElementsByTagName: () => emptyNodeList,
        getElementsByClassName: () => emptyNodeList,
        querySelector: () => null,
        querySelectorAll: () => emptyNodeList,
        getElementById: () => null,
        createElement: () => makeElement(),
        createElementNS: () => makeElement(),
        createTextNode: () => makeElement(),
        createDocumentFragment: () => makeElement(),
        createComment: () => makeElement(),
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => true,
        adoptNode: (n: unknown) => n,
        importNode: (n: unknown) => n,
    };
}

function shimDomClasses(): void {
    if (typeof HTMLElement === "undefined") {
        _g.HTMLElement = class HTMLElement {};
    }
    if (typeof Element === "undefined") {
        _g.Element = class Element {};
    }
    if (typeof Node === "undefined") {
        _g.Node = class Node {};
    }
}

function shimNavigator(): void {
    if (typeof navigator !== "undefined") {
        return;
    }
    _g.navigator = {
        userAgent: "service-worker",
        platform: "service-worker",
        language: "en",
        languages: ["en"],
        onLine: true,
        hardwareConcurrency: 1,
    };
}

function shimStorage(): void {
    if (typeof localStorage === "undefined") {
        const store = new Map<string, string>();
        _g.localStorage = {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
            removeItem: (k: string) => store.delete(k),
            clear: () => store.clear(),
            get length() { return store.size; },
            key: () => null,
        };
    }
    if (typeof sessionStorage === "undefined") {
        const store = new Map<string, string>();
        _g.sessionStorage = {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
            removeItem: (k: string) => store.delete(k),
            clear: () => store.clear(),
            get length() { return store.size; },
            key: () => null,
        };
    }
}

function shimObservers(): void {
    if (typeof MutationObserver === "undefined") {
        _g.MutationObserver = class MutationObserver {
            observe() {}
            disconnect() {}
            takeRecords() { return []; }
        };
    }
    if (typeof IntersectionObserver === "undefined") {
        _g.IntersectionObserver = class IntersectionObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
    if (typeof ResizeObserver === "undefined") {
        _g.ResizeObserver = class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
}

function shimMiscApis(): void {
    if (typeof requestAnimationFrame === "undefined") {
        _g.requestAnimationFrame = (cb: (...args: unknown[]) => void) => setTimeout(cb, 0);
        _g.cancelAnimationFrame = (id: number) => clearTimeout(id);
    }
    if (typeof CustomEvent === "undefined") {
        _g.CustomEvent = class ShimCustomEvent extends Event {
            detail: unknown;
            constructor(type: string, params?: { detail?: unknown }) {
                super(type);
                this.detail = params?.detail ?? null;
            }
        };
    }
    if (typeof DOMParser === "undefined") {
        _g.DOMParser = class DOMParser {
            parseFromString() { return _g.document; }
        };
    }
    if (typeof XMLSerializer === "undefined") {
        _g.XMLSerializer = class XMLSerializer {
            serializeToString() { return ""; }
        };
    }
    if (typeof getComputedStyle === "undefined") {
        _g.getComputedStyle = () => new Proxy({}, { get: () => "" });
    }
    if (typeof matchMedia === "undefined") {
        _g.matchMedia = () => ({
            matches: false,
            media: "",
            addEventListener: noop,
            removeEventListener: noop,
            addListener: noop,
            removeListener: noop,
        });
    }
}

/** Installs all browser-global shims for the service worker environment. */
export function installSwShims(): void {
    shimWindow();
    shimDocument();
    shimDomClasses();
    shimNavigator();
    shimStorage();
    shimObservers();
    shimMiscApis();
}

installSwShims();