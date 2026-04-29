/**
 * Marco — Chrome API Ambient Types
 *
 * Minimal ambient declarations for chrome.* APIs used by the
 * PlatformAdapter. In the extension build, @types/chrome provides
 * the full definitions; this file prevents TS errors in preview.
 */

/* eslint-disable @typescript-eslint/no-namespace */

export {};

declare global {
    namespace chrome {
        namespace runtime {
            const id: string | undefined;
            function sendMessage(message: Record<string, string | number | boolean | null | undefined | object>): Promise<string | number | boolean | null | object>;
            function getURL(path: string): string;
        }
        namespace storage {
            namespace local {
                function get(key: string): Promise<Record<string, string | number | boolean | null | object>>;
                function set(items: Record<string, string | number | boolean | null | object>): Promise<void>;
                function remove(key: string): Promise<void>;
            }
        }
        namespace tabs {
            function create(props: { url: string }): void;
            function query(
                queryInfo: { active: boolean; currentWindow: boolean },
            ): Promise<Array<{ id?: number }>>;
        }
    }
}
