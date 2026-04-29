---
name: content-script-injection-strategy
description: Why prompt-injector, xpath-recorder, network-reporter are NOT in manifest content_scripts (intentional — dynamic via chrome.scripting)
type: architecture
---

The extension declares ONLY `message-relay.js` in `manifest.json` `content_scripts` (run_at: document_start, top frame only). The other three content-script bundles (`prompt-injector.js`, `xpath-recorder.js`, `network-reporter.js`) are intentionally injected on-demand via `chrome.scripting.executeScript` and listed only in `web_accessible_resources`.

Reasons:
- **prompt-injector**: User-initiated only (popup "Run Chain"); needs to return success/verified result to background — static content scripts can't return values. Today inlined as `func: injectPromptInPage` in `prompt-chain-handler.ts:120`; bundle preserved for future `files: [...]` use.
- **xpath-recorder**: Privacy boundary — attaches global click listeners. Static injection on every page would be a covert click logger and Chrome Web Store would reject it. Triggered by `xpath-handler.ts:66 startRecording()`.
- **network-reporter**: Monkey-patches `XMLHttpRequest.prototype.open/send` and `window.fetch`. Static injection would break banks, OAuth, anti-bot vendors and corrupt every tab's network stack permanently. Currently bundled but not auto-injected.

`message-relay.js` MUST be static because it must establish the `window.postMessage` listener at `document_start` before any user script can talk to it. Pure forwarder — no DOM listeners, no API patching.

Audit doc: `spec/21-app/02-features/chrome-extension/91-content-script-injection-strategy-audit.md`. Do NOT propose moving any of the three dynamic scripts into manifest content_scripts.
