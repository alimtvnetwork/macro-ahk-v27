# 91 — Content Script Injection Strategy Audit

> **Purpose:** Document why the three "content scripts" — `prompt-injector.js`, `xpath-recorder.js`, `network-reporter.js` — are **NOT** declared in the `manifest.json` `content_scripts` array, and confirm this is intentional.
> **Status:** Active
> **Last audited:** 2026-04-20

---

## TL;DR

| Script | Manifest `content_scripts`? | How it reaches the page | Why this design |
|---|---|---|---|
| **`message-relay.js`** | ✅ YES | Static declaration, `run_at: document_start`, top frame only | Must exist on every page from the very first byte to bridge `window.postMessage` ↔ `chrome.runtime.sendMessage`. Static declaration is the only way to guarantee `document_start` timing. |
| **`prompt-injector.js`** | ❌ NO | `chrome.scripting.executeScript({ func: injectPromptInPage, args })` from `prompt-chain-handler.ts` | Runs **on demand** only when the user clicks "Run Chain" in the popup. Bundled as a webaccessibleresource so the inlined `func` body can `import()` shared logic if ever needed; today it is fully self-contained. |
| **`xpath-recorder.js`** | ❌ NO | `chrome.scripting.executeScript({ files: ["content-scripts/xpath-recorder.js"] })` from `xpath-handler.ts → startRecording()` | Runs **on demand** only when the user toggles XPath recording in the popup. Static injection on every page would attach `click` listeners on **every** site visited — privacy-hostile and wasteful. |
| **`network-reporter.js`** | ❌ NO | `chrome.scripting.executeScript({ files: ["content-scripts/network-reporter.js"] })` (planned) — currently only built; not yet auto-injected | Monkey-patches `XMLHttpRequest.prototype.open/send` and `window.fetch`. Forcing this on every page would corrupt every site's network stack permanently for the session. Must be opt-in per-tab. |

**Verdict: ✅ Intentional and correct.**

---

## Decision matrix: when does a script belong in `content_scripts`?

| Question | Answer = Static (`content_scripts`) | Answer = Dynamic (`chrome.scripting`) |
|---|---|---|
| Must run at `document_start`? | ✅ | ❌ (any timing works) |
| Required on every page the user visits? | ✅ | ❌ (only when feature is activated) |
| Pure observer (no monkey-patching of native APIs)? | ✅ | ❌ (mutates page state) |
| Acceptable to load even on `chrome://`, `about:`, sandboxed iframes? | ✅ (Chrome auto-skips) | ❌ (need to choose tab manually) |
| User has explicitly opted in (clicked a button, chose "record")? | ❌ | ✅ |

The four scripts split cleanly along this matrix:

- **`message-relay.js`** answers ✅ to all "Static" rows → declared statically.
- **The other three** answer ❌ to at least one "Static" row → injected dynamically.

---

## Per-script detail

### 1. `prompt-injector.js`

**Source:** `src/content-scripts/prompt-injector.ts`
**Bundle entry:** `vite.config.extension.ts` rollup input `content-scripts/prompt-injector` → emits `chrome-extension/dist/content-scripts/prompt-injector.js`.

**Trigger (v2.170.0+):**
```ts
// src/background/handlers/prompt-chain-handler.ts
await chrome.storage.session.set({
    [PROMPT_ARGS_KEY]: { [correlationId]: { text, chatBoxXPath } },
});
await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-scripts/prompt-injector.js"],
});
const result = await awaitInjectResult(correlationId); // one-shot onMessage listener, 10s timeout
```

**Args / result handoff:** `executeScript({ files })` cannot pass arguments. Args are written to `chrome.storage.session.marco_prompt_args[<correlationId>]` and the bundle drains the queue on bootstrap. Results are posted back via `chrome.runtime.sendMessage({ type: "PROMPT_INJECT_RESULT", correlationId, success, verified, submitted, method })` — the handler's inline one-shot listener resolves with a 10s timeout. The `finally` block clears the pending arg even on success/failure/timeout to keep session storage clean.

**Why dynamic:**
1. **User-initiated only** — runs the moment the user presses "Run Chain". No reason to be present before that.
2. **Active-tab-scoped** — only the focused tab needs it; static injection would put it in 50+ tabs simultaneously.
3. **No `document_start` requirement** — the editor DOM must already exist; running early would just no-op.
4. **Captures result** — bundle posts `{success, verified, submitted, method}` back via `chrome.runtime.sendMessage`. Static content scripts cannot return values to the background.

---

### 2. `xpath-recorder.js`

**Source:** `src/content-scripts/xpath-recorder.ts` (147 lines, plus `xpath-strategies.ts`)

**Trigger:**
```ts
// src/background/handlers/xpath-handler.ts:66
await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-scripts/xpath-recorder.js"],
});
```

Stop event:
```ts
// src/background/handlers/xpath-handler.ts:82
await chrome.scripting.executeScript({
    target: { tabId },
    func: () => { window.dispatchEvent(new CustomEvent("marco-xpath-stop")); },
});
```

**Why dynamic:**
1. **Privacy boundary** — recording attaches global `click` listeners that capture every element the user clicks. Loading this on **every page** would be a covert keystroke/click logger. Dynamic injection keeps the privilege scoped to the tab the user explicitly enabled it on.
2. **User-initiated toggle** — controlled by the popup's "Record XPaths" switch.
3. **Cleanup is event-driven** — the script self-removes by listening for `marco-xpath-stop`. Static content scripts cannot be unloaded once injected.
4. **Single-tab semantics** — recording is bound to one tab at a time (`activeRecordingTabId`); broadcasting recorders to every tab would corrupt the recorded path stream.

---

### 3. `network-reporter.js`

**Source:** `src/content-scripts/network-reporter.ts` (305 lines)

**Trigger:** Currently **bundled but not auto-injected**. Wiring lives in the file itself (XHR/fetch monkey-patches plus `flush()` timer). When activated, it will be invoked the same way as `xpath-recorder.js`:
```ts
await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-scripts/network-reporter.js"],
});
```

**Why dynamic (mandatory):**
1. **Native API monkey-patching is destructive** — the script overwrites `XMLHttpRequest.prototype.open`, `XMLHttpRequest.prototype.send`, and `window.fetch`. Doing this on every page the user visits would:
   - Break sites that detect modified prototypes (banking, anti-fraud).
   - Permanently corrupt the network stack of every tab for the session — there is no safe "uninject" for prototype overwrites.
   - Add a 50-byte buffer + 3-second flush timer to every page, even ones with no Marco automation.
2. **Per-feature opt-in** — only macros that need to inspect outbound network calls require this; the vast majority don't.
3. **Buffered reporting** — `MAX_BUFFER_SIZE = 50`, `FLUSH_INTERVAL_MS = 3000` make sense per active automation, not per page-view.

---

## Why `message-relay.js` IS static

For contrast, `message-relay.js` (322 lines) is the **only** content script declared in the manifest:

```json
{
    "matches": ["<all_urls>"],
    "js": ["content-scripts/message-relay.js"],
    "run_at": "document_start",
    "all_frames": false
}
```

Reasons:
1. **`document_start` requirement** — it must establish the `window.postMessage` listener **before** any user script (injected later by `chrome.scripting.executeScript({ world: "MAIN" })`) tries to send messages. Dynamic injection cannot guarantee this ordering.
2. **Universal need** — every Marco-injected user script (macro-looping, custom project scripts, SDK calls) talks through this relay. There is no path where it would be unwanted.
3. **Pure forwarder** — only listens for messages with the magic source string (`"marco-controller"`, `"marco-sdk"`, `"marco-extension"`); does not modify any page state, attach DOM listeners, or patch native APIs.
4. **Top-frame only (`all_frames: false`)** — sandboxed iframes don't run user scripts, so the relay is unnecessary there. This narrowing is the only "permission economy" optimisation needed for this script.

---

## What would break if we moved them into `content_scripts`?

| Script | Symptom of moving to static `content_scripts` |
|---|---|
| `prompt-injector` | Wasted 8 KB JS payload in every page load. Cannot return injection result to background — the entire chain feature would need to be re-architected through `chrome.runtime.sendMessage` round-trips. |
| `xpath-recorder` | Every site the user visits would get a global click listener — Chrome Web Store would flag this as covert tracking and reject the extension. |
| `network-reporter` | Every site's `XMLHttpRequest` and `fetch` get monkey-patched. Banks, OAuth flows, and anti-bot vendors (Cloudflare, hCaptcha, Akamai) would refuse to load. Extension would be unusable. |

---

## Validation

The split is enforced by two automated checks already wired into `npm run build:extension`:

1. **`scripts/check-manifest-permissions.mjs`** — confirms `chrome.scripting` is declared in `manifest.json` `permissions` (it is). Without this, `chrome.scripting.executeScript({ files: ... })` would throw at runtime.

2. **`scripts/check-manifest-version.mjs`** — confirms `manifest.json` exists and matches `EXTENSION_VERSION`.

To strengthen this audit further, a future check could parse `vite.config.extension.ts` rollup inputs and verify every `content-scripts/*.ts` entry is **either** in `manifest.json` `content_scripts` **or** in `web_accessible_resources` (as a programmatically-injectable file).

---

## Cross-references

- [05 — Content Script Adaptation](./05-content-script-adaptation.md) — overall content-script architecture
- [42 — User Script Logging & Data Bridge](./42-user-script-logging-and-data-bridge.md) — `message-relay` protocol details
- [43 — Macro Controller ↔ Extension Bridge](./43-macro-controller-extension-bridge.md) — `window.postMessage` contract that `message-relay` enforces
- [45 — Prompt Manager CRUD](./45-prompt-manager-crud.md) — prompt-chain feature that drives `prompt-injector`
- `mem://architecture/message-relay-system` — 3-tier extension-to-page communication memory
- `mem://architecture/script-injection-lifecycle` — full 7-stage injection lifecycle
