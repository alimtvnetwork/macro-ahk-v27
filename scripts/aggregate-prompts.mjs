#!/usr/bin/env node
/**
 * aggregate-prompts.mjs
 *
 * Reads standalone-scripts/prompts/<seq>-<slug>/{info.json, prompt.md}
 * and produces:
 *   - chrome-extension/prompts/macro-prompts.json (single source of truth, lives
 *     directly inside the unpacked extension folder loaded into Chrome).
 *
 * Run: node scripts/aggregate-prompts.mjs
 * Called by: run.ps1 -d (seeding phase) and the Vite extension build's copy-prompts plugin.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PROMPTS_DIR = join(ROOT, "standalone-scripts", "prompts");
const DIST_PROMPTS_DIR = join(ROOT, "chrome-extension", "prompts");
const OUTPUT = join(DIST_PROMPTS_DIR, "macro-prompts.json");



async function main() {
    const entries = await readdir(PROMPTS_DIR, { withFileTypes: true });
    const folders = entries
        .filter(e => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const prompts = [];

    for (const folder of folders) {
        const dir = join(PROMPTS_DIR, folder.name);
        let info;
        try {
            info = JSON.parse(await readFile(join(dir, "info.json"), "utf-8"));
        } catch {
            console.warn(`⚠ Skipping ${folder.name}: missing/invalid info.json`);
            continue;
        }

        // Casing migration (spec/30-import-export/01-rca.md §2.5):
        // info.json is canonical PascalCase. We still accept legacy camelCase
        // keys but warn so authors update them. `pick()` reads PascalCase
        // first, then falls back to the camelCase alias.
        const pick = (pascal, camel) => {
            if (pascal in info) return info[pascal];
            if (camel in info) {
                console.warn(`⚠ ${folder.name}/info.json: legacy camelCase key "${camel}" — please rename to "${pascal}"`);
                return info[camel];
            }
            return undefined;
        };

        let text;
        try {
            text = (await readFile(join(dir, "prompt.md"), "utf-8")).trim();
        } catch {
            console.warn(`⚠ Skipping ${folder.name}: missing prompt.md`);
            continue;
        }

        const Title = pick("Title", "title") ?? pick("Name", "name");
        const Id = pick("Id", "id");
        const Slug = pick("Slug", "slug");
        const Version = pick("Version", "version");
        const Order = pick("Order", "order");
        const IsDefault = pick("IsDefault", "isDefault");
        const IsFavorite = pick("IsFavorite", "isFavorite");
        const Categories = pick("Categories", "categories") ?? pick("Category", "category");

        const entry = {
            name: Title || folder.name,
            text,
        };

        // Include id and slug for programmatic lookup (e.g., Task Next)
        if (Id) entry.id = Id;
        if (Slug) entry.slug = Slug;

        // Include version
        if (Version) entry.version = Version;

        // Include order for sorting
        if (typeof Order === "number") entry.order = Order;

        // Include default/favorite flags
        if (IsDefault) entry.isDefault = true;
        if (IsFavorite) entry.isFavorite = true;

        // Add category if present (array → first item for legacy compat, or string)
        if (Array.isArray(Categories) && Categories.length > 0) {
            entry.category = Categories[0];
        } else if (typeof Categories === "string" && Categories) {
            entry.category = Categories;
        }

        prompts.push(entry);
    }

    const output = { prompts };
    const payload = JSON.stringify(output, null, 2) + "\n";

    await mkdir(DIST_PROMPTS_DIR, { recursive: true });
    await writeFile(OUTPUT, payload, "utf-8");

    console.log(`✅ Aggregated ${prompts.length} prompts → ${OUTPUT}`);
}

main().catch(err => {
    console.error("❌ aggregate-prompts failed:", err);
    process.exit(1);
});
