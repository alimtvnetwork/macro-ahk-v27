# Memory: workflow/version-synchronization
Updated: 2026-03-20

The project enforces strict version synchronization for the Chrome extension (current version 1.48.0) across `manifest.json`, `src/shared/constants.ts`, and `src/options/sections/AboutSection.tsx`, validated via `scripts/check-version-sync.mjs`. The standalone macro-looping script maintains an independent versioning sequence (e.g., v7.35) to track its specific internal logic updates. Minor version bumps are mandatory for all implementation changes.
