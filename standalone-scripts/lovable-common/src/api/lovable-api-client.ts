import { LovableApiEndpoint } from "./lovable-api-endpoint";
import { lovableHttpJson, type LovableHttpMethod } from "./lovable-http";
import { MembershipRoleApiCode } from "./membership-role-api-code";
import {
    mapMembership,
    mapMembershipArray,
    mapWorkspaceArray,
} from "./lovable-wire-mappers";
import type {
    AddMembershipRequest,
    MembershipSummary,
    UpdateMembershipRoleRequest,
    WorkspaceSummary,
} from "./lovable-api-types";

/**
 * BearerTokenProvider — injected dependency. Wired by callers to the
 * unified `getBearerToken()` contract (mem://auth/unified-auth-contract).
 */
export type BearerTokenProvider = () => Promise<string>;

const HTTP_GET = "GET";
const HTTP_POST = "POST";
const HTTP_PUT = "PUT";

/**
 * LovableApiClient — single source of truth for Lovable membership REST
 * calls. Consumed by both `lovable-owner-switch` (promoteToOwner) and
 * `lovable-user-add` (addMembership + promoteToOwner).
 *
 * Phase: P3 — real `fetch` wired via `lovableHttpJson`. Errors throw raw
 * `LovableApiError`; callers MUST wrap with `RiseupAsiaMacroExt.Logger.error`.
 */
export class LovableApiClient {
    private readonly endpoint: LovableApiEndpoint;
    private readonly tokenProvider: BearerTokenProvider;

    public constructor(tokenProvider: BearerTokenProvider, apiBase?: string) {
        this.endpoint = new LovableApiEndpoint(apiBase);
        this.tokenProvider = tokenProvider;
    }

    public async getWorkspaces(): Promise<WorkspaceSummary[]> {
        const wire = await this.send(HTTP_GET, this.endpoint.workspaces());

        return mapWorkspaceArray(wire);
    }

    public async getMemberships(workspaceId: string): Promise<MembershipSummary[]> {
        const wire = await this.send(HTTP_GET, this.endpoint.memberships(workspaceId));

        return mapMembershipArray(wire);
    }

    public async addMembership(workspaceId: string, body: AddMembershipRequest): Promise<MembershipSummary> {
        const jsonBody = { email: body.Email, role: body.Role };
        const wire = await this.send(HTTP_POST, this.endpoint.memberships(workspaceId), jsonBody);

        return mapMembership(wire);
    }

    public async updateMembershipRole(workspaceId: string, userId: string, body: UpdateMembershipRoleRequest): Promise<MembershipSummary> {
        const jsonBody = { role: body.Role };
        const wire = await this.send(HTTP_PUT, this.endpoint.membership(workspaceId, userId), jsonBody);

        return mapMembership(wire);
    }

    public async promoteToOwner(workspaceId: string, userId: string): Promise<MembershipSummary> {
        return this.updateMembershipRole(workspaceId, userId, { Role: MembershipRoleApiCode.Owner });
    }

    private async send(method: LovableHttpMethod, endpoint: string, jsonBody?: object): Promise<object> {
        const bearerToken = await this.tokenProvider();

        return lovableHttpJson({ method, endpoint, bearerToken, jsonBody });
    }
}
