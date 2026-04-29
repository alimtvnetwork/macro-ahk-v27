# Memory: Keyboard Shortcuts (v7.9.33)

## AHK Hotkeys (config.ini [Hotkeys])
- **ComboDown**: `Ctrl+Right` — triggers ComboSwitch down (was Ctrl+Down)
- **ComboUp**: `Ctrl+Left` — triggers ComboSwitch up (was Ctrl+Up)

## JS Controller Shortcuts (browser keydown)
- **Ctrl+Alt+Left/Right** — ComboSwitch on settings page (was Ctrl+Alt+Up/Down)
- **Ctrl+Up/Down** — Force move project to adjacent workspace via API (was Alt+Up/Down)
- **Ctrl+Alt+Up/Down** — MacroLoop toggle (unchanged, project pages only)
- **Ctrl+Alt+H** — Hide/show controller panel
- **Ctrl+Alt+S** — Credit status check
- **Ctrl+Alt+M** — Move project to selected workspace

## Key Design Decision
Force-move handler MUST be placed BEFORE the `if (!isCtrlAlt) return;` guard in the keydown listener, since Ctrl+Up/Down is not Ctrl+Alt.
