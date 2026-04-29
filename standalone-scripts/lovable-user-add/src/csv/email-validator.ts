/**
 * User Add — email format validator (project-scoped duplicate).
 *
 * Identical to Owner Switch's validator; duplicated for isolation
 * (no cross-project imports of internals). When the contract changes,
 * update both files together — the test suites in each project's
 * `__tests__/email-validator.test.ts` enforce parity.
 */

const FORBIDDEN_CHARS = [" ", ",", ";", "\t", "\r", "\n", "<", ">", "\"", "'"];

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MIN_EMAIL_LENGTH = 3;

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
