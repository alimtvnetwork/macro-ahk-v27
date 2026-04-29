/**
 * LovableApiEndpoint — centralised path builders. All callers MUST go
 * through this — no string-concatenated URLs anywhere else.
 */

const API_BASE_DEFAULT = "https://api.lovable.dev";

export class LovableApiEndpoint {
    private readonly apiBase: string;

    public constructor(apiBase: string = API_BASE_DEFAULT) {
        this.apiBase = apiBase.replace(/\/+$/, "");
    }

    public workspaces(): string {
        return `${this.apiBase}/workspaces`;
    }

    public memberships(workspaceId: string): string {
        return `${this.apiBase}/workspaces/${workspaceId}/memberships`;
    }

    public membership(workspaceId: string, userId: string): string {
        return `${this.apiBase}/workspaces/${workspaceId}/memberships/${userId}`;
    }
}
