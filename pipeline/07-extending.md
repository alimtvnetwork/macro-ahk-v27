# 07 — Extending the Pipeline

## Adding a New Standalone Script

1. **Create the project folder**:
   ```
   standalone-scripts/{name}/
   ├── src/
   │   ├── instruction.ts    # Manifest (name, version, assets)
   │   └── main.ts           # Entry point
   └── dist/                 # Will be created by build
   ```

2. **Create `src/instruction.ts`**:
   ```typescript
   export default {
     projectId: "your-project-id",
     displayName: "Your Script Name",
     version: "2.119.0",                  // Must match global version
     description: "What this script does",
     entry: "your-script.js",
     assets: {
       configs: [],
       templates: [],
       prompts: [],
       css: [],
       scripts: [],
     },
   };
   ```

3. **Create a Vite config** at repo root (`vite.config.{name}.ts`):
   ```typescript
   import { defineConfig } from "vite";
   import { resolve } from "path";

   export default defineConfig({
     build: {
       lib: {
         entry: resolve(__dirname, "standalone-scripts/{name}/src/main.ts"),
         name: "YourScript",
         fileName: "your-script",
         formats: ["iife"],
       },
       outDir: "standalone-scripts/{name}/dist",
       emptyOutDir: false,
     },
   });
   ```

4. **Create a TypeScript config** (`tsconfig.{name}.json`):
   ```json
   {
     "extends": "./tsconfig.json",
     "include": ["standalone-scripts/{name}/src/**/*.ts"],
     "compilerOptions": { "noEmit": true }
   }
   ```

5. **Add build script** to `package.json`:
   ```json
   "build:{name}": "node scripts/check-axios-version.mjs && node scripts/compile-instruction.mjs standalone-scripts/{name} && tsc --noEmit -p tsconfig.{name}.json && vite build --config vite.config.{name}.ts"
   ```

6. **Add to CI/Release workflows** — insert build step between XPath and Extension builds.

7. **Add version file to `check-version-sync.mjs`**:
   ```javascript
   {
     label: "instruction.ts ({name})",
     path: "standalone-scripts/{name}/src/instruction.ts",
     extract: (txt) => {
       const m = txt.match(/version:\s*"(\d+\.\d+\.\d+)/);
       return m ? m[1] : null;
     },
   },
   ```

8. **Add to release packaging** in `release.yml`:
   ```yaml
   cd standalone-scripts/{name}
   zip -r "../../release-assets/{name}-${VER}.zip" .
   cd ../..
   ```

## Adding a New Validation Script

1. Create `scripts/check-{name}.mjs`
2. Exit `process.exit(1)` on failure with clear error message
3. Add to the appropriate `build:*` command chain in `package.json`
4. Error messages should include: file path, what was expected, what was found

## Adding a New CI Step

Insert into both `.github/workflows/ci.yml` and `release.yml`:
```yaml
- name: Your new step
  run: pnpm run your-command
```

Place it in the correct position within the pipeline order:
```
Install → Lint → Test → Build SDK → Build XPath → [YOUR STEP] → Build Controller → Build Extension
```

## Design Principles

1. **Fail fast**: Validation scripts run before expensive builds
2. **Single source of truth**: `instruction.ts` defines each project's metadata
3. **Version unity**: All components share one version, enforced by CI
4. **No notifications**: CI/Release never sends emails or alerts (by design)
5. **Deterministic**: Same commit always produces same output
6. **Composable**: Each `build:*` script works standalone for local dev
