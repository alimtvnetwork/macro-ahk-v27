# Memory: style/neo-vibrant-theme
Updated: 2026-03-22

The macro controller uses a 'Neo-Vibrant Dark Theme' with flat solid colors (no gradients) and subtle depth via `inset` highlights and soft drop shadows. Button palette: Check (Rose #E8475F, white text), Credits (Amber #F59E0B, dark text #1a1a2e), Prompts (Purple #6C5CE7, white text), Start (Green #00C853, white text), Stop (Red #EF4444, white text). All buttons have an 8px radius, 34px height, a `1px solid rgba(255,255,255,0.08)` border, and a compound shadow (`0 1px 3px color/0.3, inset 0 1px 0 rgba(255,255,255,0.1-0.15)`). Hover states use brightness(1.12) and a slightly deeper shadow — no neon glow spread. The header title is pure white (#ffffff).

## Interaction Rules (v1.56+)

- **Hover on buttons**: Use `filter: brightness()` and `background-color` transitions only. NO `scale()`, `translateY()`, or `transform` animations on hover.
- **Hover on collapsible section lines**: Subtle background-color highlight on hover with smooth transition.
- **Click animations**: Use opacity + color flash only, NO scale pulse.
- **Transition property**: `transition: filter 150ms ease, background-color 150ms ease, box-shadow 150ms ease` — never include `transform`.
