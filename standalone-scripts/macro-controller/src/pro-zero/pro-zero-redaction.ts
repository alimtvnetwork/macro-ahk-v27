/**
 * pro-zero-redaction — Authorization redaction helpers.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §2.7, §10.3
 *
 * Hard rule: Authorization tokens MUST NEVER reach a log line. This module
 * is the single chokepoint for producing log-safe header/header-map snapshots.
 */

import { HEADER_AUTHORIZATION, REDACTED_TOKEN_PLACEHOLDER } from './pro-zero-constants';

export interface RedactedHeaderMap {
    readonly [headerName: string]: string;
}

export function redactBearer(_token: string): string {
    return REDACTED_TOKEN_PLACEHOLDER;
}

export function buildRedactedHeaders(): RedactedHeaderMap {
    const redacted: { [k: string]: string } = {};
    redacted[HEADER_AUTHORIZATION] = REDACTED_TOKEN_PLACEHOLDER;

    return redacted;
}
