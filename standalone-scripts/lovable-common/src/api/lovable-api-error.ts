/**
 * LovableApiError — narrow, typed error surface for the shared client.
 * Wraps the HTTP status, the resolved endpoint, and the response body.
 */

export class LovableApiError extends Error {
    public readonly Status: number;
    public readonly Endpoint: string;
    public readonly BodyText: string;

    public constructor(message: string, status: number, endpoint: string, bodyText: string) {
        super(message);
        this.name = "LovableApiError";
        this.Status = status;
        this.Endpoint = endpoint;
        this.BodyText = bodyText;
    }
}
