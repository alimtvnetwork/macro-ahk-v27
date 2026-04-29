/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/eslint.config.template.js
 *
 * Purpose: Flat ESLint config enforcing the zero-warnings policy with
 *          typescript-eslint, sonarjs, react-hooks, import, and custom guards.
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use: none.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default tseslint.config(
    {
        ignores: [
            "dist/**",
            "release/**",
            "node_modules/**",
            "coverage/**",
            "playwright-report/**",
            "test-results/**",
            "**/*.config.js",
            "**/*.config.ts",
        ],
    },

    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: { ...globals.browser, ...globals.webextensions, ...globals.serviceworker },
            parserOptions: {
                project: ["./tsconfig.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "react-hooks": reactHooks,
            sonarjs,
            import: importPlugin,
        },
        rules: {
            // ── Type safety (zero-warnings policy) ─────────────────────────
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unsafe-argument": "error",
            "@typescript-eslint/no-unsafe-assignment": "error",
            "@typescript-eslint/no-unsafe-call": "error",
            "@typescript-eslint/no-unsafe-member-access": "error",
            "@typescript-eslint/no-unsafe-return": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],

            // ── Naming (PascalCase types, camelCase locals, SCREAMING for consts) ──
            "@typescript-eslint/naming-convention": [
                "error",
                { selector: "typeLike", format: ["PascalCase"] },
                { selector: "enumMember", format: ["PascalCase"] },
                { selector: "variable", modifiers: ["const", "global"], format: ["UPPER_CASE", "PascalCase", "camelCase"] },
                { selector: "variable", format: ["camelCase", "UPPER_CASE", "PascalCase"], leadingUnderscore: "allow" },
                { selector: "function", format: ["camelCase", "PascalCase"] },
            ],

            // ── React hooks ────────────────────────────────────────────────
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",

            // ── SonarJS (logic / complexity) ───────────────────────────────
            "sonarjs/cognitive-complexity": ["error", 15],
            "sonarjs/no-duplicate-string": ["error", { threshold: 5 }],
            "sonarjs/no-identical-functions": "error",
            "sonarjs/no-collapsible-if": "error",

            // ── Imports ────────────────────────────────────────────────────
            "import/order": [
                "error",
                {
                    groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
                    "newlines-between": "always",
                    alphabetize: { order: "asc", caseInsensitive: true },
                },
            ],
            "import/no-duplicates": "error",
            "import/no-cycle": "error",

            // ── Project hygiene ────────────────────────────────────────────
            "no-console": ["error", { allow: ["debug"] }], // use NamespaceLogger instead
            "no-restricted-globals": ["error", "localStorage", "sessionStorage"], // prefer chrome.storage / typed bridges
            eqeqeq: ["error", "always"],
            curly: ["error", "all"],
        },
    },

    // ── Test files: relax some rules ─────────────────────────────────────
    {
        files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "no-console": "off",
            "sonarjs/no-duplicate-string": "off",
        },
    },
);
