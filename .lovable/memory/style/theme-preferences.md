# Memory: style/theme-preferences
Updated: 2026-03-20

The macro controller uses a centralized theme configuration (04-macro-theme.json) injected as window.__MARCO_THEME__. It follows a VS Code-inspired theme with support for both Dark and Light modes. The Dark+ preset uses warm white (#e8e8e8) and highlight yellow (#f5e6b8) as primary text colors against the dark background (#1e1e2e) for high contrast readability. A critical design constraint is that progress bar segment colors and their order (defined in Spec 06) must remain unchanged regardless of theme updates. The system utilizes purple-accented HSL tokens and CSS animations for UI transitions.
