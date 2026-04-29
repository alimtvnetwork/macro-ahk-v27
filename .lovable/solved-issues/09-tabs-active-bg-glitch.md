# UI Glitch: Active Tab Background in Dark Mode

## Root Cause

In dark mode, the `TabsTrigger` active state uses `bg-background` (HSL 224 28% **8%**),
while the `TabsList` container uses `bg-muted` (HSL 224 18% **16%**).

This means the active tab is **darker** than the surrounding bar, creating an
inverted-contrast "black hole" effect — the active tab looks like a void
instead of a raised/selected surface.

| Token        | Light (L%) | Dark (L%) |
|-------------|-----------|----------|
| `--background` | 96%       | **8%**   |
| `--muted`      | 92%       | **16%**  |

In light mode the relationship is correct (active 96% > bar 92%), but in dark
mode it's inverted (active 8% < bar 16%).

## Solution

Change the active `TabsTrigger` background from `bg-background` to
`bg-secondary`. In dark mode `--secondary` has **18%** lightness — slightly
above `--muted` (16%) — giving the active tab a subtle lift. In light mode
`--secondary` is 90% vs `--muted` 92%, still providing clear visual
distinction.
