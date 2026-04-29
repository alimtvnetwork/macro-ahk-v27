/**
 * Riseup Macro SDK — Auth Response Normalization
 *
 * Normalizes auth bridge responses across legacy object-shaped payloads and
 * canonical primitive payloads so mixed-version runtimes still resolve JWTs.
 */

const MAX_DEPTH = 4;

const TOKEN_KEYS = ["token", "authToken", "access_token", "jwt"] as const;
const WRAPPER_KEYS = ["result", "payload", "data", "response"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

function isLikelyJwt(value: string): boolean {
    return value.startsWith("eyJ") && value.split(".").length === 3;
}

function getNestedRecordValue(
    value: unknown,
    key: string,
): unknown {
    return isRecord(value) ? value[key] : undefined;
}

export function extractBearerTokenFromBridgePayload(
    raw: unknown,
    depth = 0,
): string | null {
    if (depth > MAX_DEPTH || raw == null) {
        return null;
    }

    if (typeof raw === "string") {
        return isLikelyJwt(raw) ? raw : null;
    }

    if (!isRecord(raw)) {
        return null;
    }

    for (const key of TOKEN_KEYS) {
        const candidate = extractBearerTokenFromBridgePayload(raw[key], depth + 1);
        if (candidate) {
            return candidate;
        }
    }

    const legacySessionId = raw.sessionId;
    if (typeof legacySessionId === "string" && isLikelyJwt(legacySessionId)) {
        return legacySessionId;
    }

    for (const key of WRAPPER_KEYS) {
        const candidate = extractBearerTokenFromBridgePayload(raw[key], depth + 1);
        if (candidate) {
            return candidate;
        }
    }

    return null;
}

export function extractAuthSourceFromBridgePayload(
    raw: unknown,
    depth = 0,
): string {
    if (depth > MAX_DEPTH || raw == null) {
        return "none";
    }

    if (typeof raw === "string") {
        return raw;
    }

    if (!isRecord(raw)) {
        return "none";
    }

    const directSource = raw.source;
    if (typeof directSource === "string" && directSource.length > 0) {
        return directSource;
    }

    const cookieName = raw.cookieName;
    if (typeof cookieName === "string" && cookieName.length > 0) {
        return cookieName;
    }

    for (const key of WRAPPER_KEYS) {
        const nested = extractAuthSourceFromBridgePayload(raw[key], depth + 1);
        if (nested !== "none") {
            return nested;
        }
    }

    if (typeof raw.sessionId === "string" || typeof raw.refreshToken === "string") {
        return "legacy-session-object";
    }

    return "none";
}

export function extractBooleanFromBridgePayload(
    raw: unknown,
    key: string,
    depth = 0,
): boolean {
    if (depth > MAX_DEPTH || raw == null) {
        return false;
    }

    if (typeof raw === "boolean") {
        return raw;
    }

    if (!isRecord(raw)) {
        return false;
    }

    const direct = raw[key];
    if (typeof direct === "boolean") {
        return direct;
    }

    for (const wrapperKey of WRAPPER_KEYS) {
        const nested = extractBooleanFromBridgePayload(raw[wrapperKey], key, depth + 1);
        if (nested) {
            return true;
        }
    }

    return false;
}

function decodeBase64Url(value: string): string | null {
    try {
        const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        return atob(padded);
    } catch {
        return null;
    }
}

export function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
    if (!token || !isLikelyJwt(token)) {
        return null;
    }

    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) {
        return null;
    }

    const decoded = decodeBase64Url(payloadSegment);
    if (!decoded) {
        return null;
    }

    try {
        const parsed = JSON.parse(decoded) as unknown;
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function extractJwtPayloadFromBridgePayload(raw: unknown): Record<string, unknown> | null {
    const directToken = extractBearerTokenFromBridgePayload(raw);
    if (directToken) {
        return decodeJwtPayload(directToken);
    }

    const jwtLike = getNestedRecordValue(raw, "jwt");
    if (typeof jwtLike === "string") {
        return decodeJwtPayload(jwtLike);
    }

    return null;
}