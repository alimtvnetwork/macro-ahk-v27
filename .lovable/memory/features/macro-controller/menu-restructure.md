# Memory: features/macro-controller/menu-restructure
Updated: 2026-03-21

The ☰ menu uses a hierarchical structure with hover-expandable submenus for Loop (Up/Down), Force (Move Up/Down), Export (CSV, Download/JS Bundle, Diagnostic Dump), and Read (Session Cookie Read). Legacy items like the Bot Panel and the Dark Mode toggle have been removed. The menu dropdown and all submenus are rendered with `position:fixed` and appended to `document.body` to prevent clipping by the parent container's `overflow:hidden`. Menu position is calculated dynamically from the trigger button's bounding rect.
