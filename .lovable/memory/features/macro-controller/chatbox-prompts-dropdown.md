# Memory: features/macro-controller/chatbox-prompts-dropdown
Updated: 2026-03-22

The chatbox toolbar includes a Prompts button (clipboard-list icon) alongside the Save button. It opens a floating dropdown (#marco-chatbox-prompts-dropdown) with category filters, a real-time search/filter input, and quick-paste functionality. The dropdown uses fixed positioning to avoid container clipping.

The chatbox prompts dropdown now includes:
- **Task Next submenu** as the first item (⏭ Task Next) with hover sub-menu offering preset counts (1, 2, 3, 5, 7, 10, 12, 15, 20, 30, 40), a custom number input (1–999), and a ⚙ Settings button — matching the main panel dropdown.
- **Edit mode toggle** (✏️ Edit button in header, Ctrl+E shortcut) that shows per-prompt edit buttons when active.
