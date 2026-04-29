/**
 * Owner Switch — workspace + user resolvers.
 *
 * Each function consults the TTL cache first, then falls back to the
 * shared `LovableApiClient`. Throws a typed Error when the lookup
 * yields no match so the orchestrator records a clean failure.
 */

import type { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import type { TtlCache } from "./ttl-cache";

export const resolveWorkspaceId = async (
    api: LovableApiClient,
    cache: TtlCache<string>,
    loginEmail: string,
): Promise<string> => {
    const cached = cache.get(loginEmail);

    if (cached !== null) {
        return cached;
    }

    const workspaces = await api.getWorkspaces();

    if (workspaces.length === 0) {
        throw new Error(`No workspaces visible to ${loginEmail}`);
    }

    const first = workspaces[0];
    cache.set(loginEmail, first.Id);

    return first.Id;
};

export const resolveUserId = async (
    api: LovableApiClient,
    cache: TtlCache<string>,
    workspaceId: string,
    ownerEmail: string,
): Promise<string> => {
    const cacheKey = `${workspaceId}::${ownerEmail}`;
    const cached = cache.get(cacheKey);

    if (cached !== null) {
        return cached;
    }

    const memberships = await api.getMemberships(workspaceId);
    const match = memberships.find((m) => m.Email === ownerEmail);

    if (match === undefined) {
        throw new Error(`Membership not found for ${ownerEmail} in workspace ${workspaceId}`);
    }

    cache.set(cacheKey, match.UserId);

    return match.UserId;
};
