# Memory: features/macro-controller/prompts-system-v2
Updated: 2026-03-22

The macro prompts system uses a persistent relational architecture in SQLite, replacing the legacy dynamic loading models. The macro controller (v1.60+) fetches prompt data from the `PromptsDetails` database view via a `window.postMessage` SDK relay, with an IndexedDB cache-first pattern (stale-while-revalidate). Cached prompts are shown instantly on dropdown open; background revalidation compares a hash of prompt names+lengths against the fresh backend data and updates silently if changed.

**Prompt injection** uses `document.execCommand('insertText')` for contenteditable editors (ProseMirror/React), avoiding raw DOM manipulation that broke on subsequent injections. Fallback chain: execCommand → DataTransfer paste event → clipboard copy.

**Task Next** finds the submit button using multiple CSS selectors (form submit, aria-label, data-testid) with the user-configured XPath as priority. The "Next Tasks" prompt is found by slug match, then by name containing 'next' and 'task', then falls back to the first available prompt.
