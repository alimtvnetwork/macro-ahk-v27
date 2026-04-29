import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { execSync } from "child_process";

/**
 * Runs scripts/bundle-developer-guide.mjs before each build to keep
 * src/lib/developer-guide-data.generated.ts in sync with the markdown source.
 */
function bundleDeveloperGuide(): Plugin {
  return {
    name: "bundle-developer-guide",
    buildStart() {
      try {
        execSync("node scripts/bundle-developer-guide.mjs", {
          cwd: path.resolve(__dirname),
          stdio: "pipe",
        });
      } catch {
        console.warn("[bundle-developer-guide] Failed — guide data may be stale");
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    bundleDeveloperGuide(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
