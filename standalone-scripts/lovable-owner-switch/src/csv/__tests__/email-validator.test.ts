/**
 * Owner Switch — email validator tests.
 *
 * Locks down the stricter rules introduced when CSV validation was
 * tightened (length caps, leading/trailing dot, consecutive dots, etc.)
 * so future loosening shows up as a red test rather than silent drift.
 */

import { describe, it, expect } from "vitest";
import { isValidEmail } from "../email-validator";

describe("isValidEmail (owner-switch)", () => {
    describe("accepts well-formed addresses", () => {
        it.each([
            "user@example.com",
            "first.last@example.co.uk",
            "user+tag@example.io",
            "u@a.io",
        ])("ok: %s", (value) => {
            expect(isValidEmail(value)).toBe(true);
        });
    });

    describe("rejects malformed addresses", () => {
        it.each([
            ["", "empty string"],
            ["a@b", "domain has no dot"],
            ["a@@b.com", "double @"],
            ["@nolocal.com", "missing local part"],
            ["nolocal@", "missing domain"],
            [".leading@example.com", "leading dot in local"],
            ["trailing.@example.com", "trailing dot in local"],
            ["a..b@example.com", "consecutive dots in local"],
            ["a@.example.com", "leading dot in domain"],
            ["a@example.com.", "trailing dot in domain"],
            ["a@exam..ple.com", "consecutive dots in domain"],
            ["a b@example.com", "whitespace in value"],
            ["a,b@example.com", "comma in value"],
            ["<a@example.com>", "angle brackets"],
        ])("reject: %s (%s)", (value) => {
            expect(isValidEmail(value)).toBe(false);
        });

        it("rejects emails > 254 chars", () => {
            const local = "a".repeat(64);
            const domain = `${"d".repeat(250)}.com`;
            const tooLong = `${local}@${domain}`;
            expect(tooLong.length).toBeGreaterThan(254);
            expect(isValidEmail(tooLong)).toBe(false);
        });

        it("rejects local-part > 64 chars", () => {
            const local = "a".repeat(65);
            expect(isValidEmail(`${local}@example.com`)).toBe(false);
        });
    });
});
