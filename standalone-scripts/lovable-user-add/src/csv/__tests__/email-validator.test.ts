/**
 * User Add — email validator tests.
 *
 * Mirrors the owner-switch suite — both validators must stay in sync.
 */

import { describe, it, expect } from "vitest";
import { isValidEmail } from "../email-validator";

describe("isValidEmail (user-add)", () => {
    it.each([
        "user@example.com",
        "first.last@example.co.uk",
        "user+tag@example.io",
    ])("accepts: %s", (value) => {
        expect(isValidEmail(value)).toBe(true);
    });

    it.each([
        ["", "empty"],
        ["a@b", "no dot in domain"],
        ["a@@b.com", "double @"],
        [".leading@example.com", "leading dot"],
        ["a..b@example.com", "consecutive dots"],
        ["a b@example.com", "whitespace"],
        ["<a@example.com>", "angle brackets"],
    ])("rejects: %s (%s)", (value) => {
        expect(isValidEmail(value)).toBe(false);
    });

    it("rejects emails > 254 chars", () => {
        const tooLong = `${"a".repeat(64)}@${"d".repeat(250)}.com`;
        expect(tooLong.length).toBeGreaterThan(254);
        expect(isValidEmail(tooLong)).toBe(false);
    });
});
