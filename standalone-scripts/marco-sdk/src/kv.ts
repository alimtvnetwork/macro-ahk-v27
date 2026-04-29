/**
 * Riseup Macro SDK — KV Module
 *
 * Provides marco.kv.* methods for project-scoped key-value storage.
 *
 * Every KV message MUST carry a non-empty `projectId` so the background
 * SQLite handler has a value to bind. The SDK self-namespace uses its own
 * code name ("RiseupMacroSdk") as the projectId; per-project IIFEs supply
 * their resolved project id.
 *
 * See: spec/21-app/02-features/devtools-and-injection/sdk-convention.md §marco.kv
 */

import { sendMessage } from "./bridge";

export interface KvApi {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    list(): Promise<Array<{ key: string; value: string }>>;
}

const SDK_PROJECT_ID = "RiseupMacroSdk";

export function createKvApi(projectId: string = SDK_PROJECT_ID): KvApi {
    const pid = projectId && projectId.length > 0 ? projectId : SDK_PROJECT_ID;
    return {
        get(key: string) {
            return sendMessage<string | null>("KV_GET", { projectId: pid, key });
        },
        async set(key: string, value: string) {
            await sendMessage<void>("KV_SET", { projectId: pid, key, value });
        },
        async delete(key: string) {
            await sendMessage<void>("KV_DELETE", { projectId: pid, key });
        },
        list() {
            return sendMessage<Array<{ key: string; value: string }>>("KV_LIST", { projectId: pid });
        },
    };
}
