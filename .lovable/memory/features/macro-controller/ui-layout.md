# Memory: features/macro-controller/ui-layout
Updated: 2026-03-22

The macro controller UI (v1.56.0+) uses a **Neo-Vibrant Dark Theme** with gradient-filled buttons, soft glow effects, and hover/active micro-interactions.

## Button System (Vibrant Gradients)

| Button | Gradient | Glow |
|--------|----------|------|
| Check (☑) | `#FF5F6D → #FFC371` (coral) | `rgba(255,95,109,0.35)` |
| Credits (💰) | `#FFB300 → #FF6F00` (amber) | `rgba(255,179,0,0.35)` |
| Prompts (📋) | `#00C6FF → #0072FF` (electric blue) | `rgba(0,198,255,0.35)` |
| Start (▶) | `#00E676 → #00C853` (neon green) | `rgba(0,230,118,0.35)` |
| Stop (⏹) | `#FF5252 → #D50000` (red) | `rgba(255,82,82,0.35)` |

All buttons use `border-radius: 8px`, `height: 34px`, and `padding: 6px 14px`.

## Interaction States

- **Hover**: `brightness(1.08)` + `scale(1.02)`
- **Active/mousedown**: `brightness(0.9)`
- **Focus**: `2px solid rgba(255,255,255,0.25)` outline

## Header

- Title color: `#E0E0E0` (increased contrast from `#ffffff`)
- Title shifted up by `translateY(-2px)` to fix visual centering
- Project name: `#ffffff`

## Utility/Menu Buttons

- Background: `#2A2D3A`
- Hover: `#3A3F55`
- Border: `rgba(255,255,255,0.08)`

## Theme Tokens

All gradient/glow values are stored in `04-macro-theme.json` under `button.*.gradient` and `button.*.glow`, exported via `shared-state.ts`. Progress bar segment colors remain unchanged per Spec 06.
