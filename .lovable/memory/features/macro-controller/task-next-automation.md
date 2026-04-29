# Memory: features/macro-controller/task-next-automation
Updated: 2026-03-21

The 'Task Next' feature (S-042) is an automation utility in the macro controller's prompts dropdown menu. It appears as the **first item** (⏭ Task Next) with a hover sub-menu offering preset counts (1, 2, 3, 5, 10, 20, 30, 40), a custom number input (1–999), and a ⚙ Settings button.

**Automation loop**: For each task, it injects the "Next Tasks" prompt (slug: `next-tasks`) into the chatbox via DOM append, waits a configurable pre-click delay, clicks the "Add To Tasks" button (XPath-based with CSS fallback), and waits a post-click delay. Button disabled state is handled with configurable retries. Users can cancel via Escape key.

**Settings** (persisted in `ProjectKv` SQLite table under key `task_next_settings`):
- `preClickDelayMs` (default: 500)
- `postClickDelayMs` (default: 2000)
- `retryCount` (default: 3)
- `retryDelayMs` (default: 1000)
- `buttonXPath` (default: `/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]/div/button[2]`)
- `promptSlug` (default: `next-tasks`)

Progress feedback shown via toast notifications (e.g., "⏭ Task Next: 3/10 completed").
