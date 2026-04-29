/**
 * Owner Switch — email format validator.
 *
 * Lightweight RFC-5321/5322-lite check. Stricter than a regex one-liner
 * because real-world CSVs leak whitespace, smart-quotes, mailto: prefixes,
 * and trailing commas. Rules enforced (in order):
 *
 *   1. No forbidden whitespace/structural chars.
 *   2. Total length 3..254 (RFC 5321 §4.5.3.1.3).
 *   3. Exactly one '@'.
 *   4. Local part 1..64 chars, no leading/trailing dot, no '..'.
 *   5. Domain ≥ 3 chars, contains a dot, no leading/trailing dot, no '..'.
 *
 * Returns plain boolean — the caller (csv-validator) builds the
 * structured CsvParseError so we keep error messages in one place.
 */

const FORBIDDEN_CHARS = [" ", ",", ";", "\t", "\r", "\n", "<", ">", "\"", "'"];

// RFC 5321 §4.5.3.1.3: max 254 chars total, 64 for local-part.
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MIN_EMAIL_LENGTH = 3; // "a@b" is the absolute floor; we also require a dot in domain below.

const hasForbiddenChars = (value: string): boolean => {
    for (const ch of FORBIDDEN_CHARS) {
        if (value.includes(ch)) {
            return true;
        }
    }

    return false;
};

const isValidPart = (part: string): boolean => {
    if (part.length === 0) return false;
    if (part.startsWith(".") || part.endsWith(".")) return false;
    if (part.includes("..")) return false;
    return true;
};

export const isValidEmail = (value: string): boolean => {
    if (value.length < MIN_EMAIL_LENGTH || value.length > MAX_EMAIL_LENGTH) {
        return false;
    }

    if (hasForbiddenChars(value)) {
        return false;
    }

    const at = value.indexOf("@");

    if (at <= 0 || at !== value.lastIndexOf("@")) {
        return false;
    }

    const local = value.slice(0, at);
    const domain = value.slice(at + 1);

    if (local.length > MAX_LOCAL_LENGTH) {
        return false;
    }

    if (!isValidPart(local) || !isValidPart(domain)) {
        return false;
    }

    return domain.length >= 3 && domain.includes(".");
};
