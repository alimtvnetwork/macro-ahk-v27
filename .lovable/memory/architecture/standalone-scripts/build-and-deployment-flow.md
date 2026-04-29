# Memory: architecture/standalone-scripts/build-and-deployment-flow
Updated: 2026-04-21

Standalone scripts (e.g., XPath, macro-controller) are compiled into IIFE bundles in their respective `standalone-scripts/<name>/dist/` folders. Each project also has an `instruction.ts` (compiled to `dist/instruction.json`) that serves as the load manifest.

The build pipeline (`run.ps1 -d`) copies ALL per-project `dist/` artifacts into per-project subfolders **directly under the unpacked extension root** at `chrome-extension/projects/scripts/{project-name}/`. The unpacked extension that Chrome loads via "Load unpacked" lives at `./chrome-extension/` at the repo root — there is no longer a top-level `dist/` folder for the extension build. (`dist/` is reserved for the Lovable preview / web-app build only.)

At runtime, the seeder stores **file paths** (not embedded code) in `chrome.storage.local`. The script-resolver fetches code from `chrome.runtime.getURL(filePath)` at injection time, with fallback to the embedded `code` property.

The `copyProjectScripts()` Vite plugin now:
1. Creates a subfolder per project: `chrome-extension/projects/scripts/{name}/`
2. Copies ALL files from each `standalone-scripts/<name>/dist/` folder into it
3. Includes instruction.json, script-manifest.json, CSS, templates, prompts, and JS bundles

Path source of truth: `powershell.json -> distDir = "chrome-extension"`. The PowerShell deploy modules (`browser-deploy.ps1`, `extension-build.ps1`, `watch.ps1`) read this value and use it as the load-unpacked target, the post-build manifest validation root, and the path printed in direct-mode (`-dm`) instructions.
