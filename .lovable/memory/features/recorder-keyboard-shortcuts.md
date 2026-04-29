
Verification (2026-04-27):
- Hook `src/hooks/use-recorder-shortcuts.ts` mounted via `src/components/recorder/FloatingControllerHost.tsx` → `src/pages/Options.tsx`.
- Chord matcher requires `ctrl+alt` and explicitly rejects `shift`/`meta`.
- Editable-target guard (`INPUT`/`TEXTAREA`/`SELECT`/`isContentEditable`) prevents swallowing typing.
- Listener only registered when `phase !== null && phase !== "Idle"`.
- `useRecorderShortcuts` test suite: 7/7 pass.
