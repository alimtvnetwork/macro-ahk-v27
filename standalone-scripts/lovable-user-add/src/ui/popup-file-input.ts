/**
 * User Add popup — file picker controller.
 *
 * Wires the file `<input>` change event to `parseUserAddCsv` and
 * forwards the result to caller-supplied render callbacks. No SQLite,
 * no run logic — pure UI plumbing for P14.
 */

import { parseUserAddCsv } from "../csv";
import type { UserAddCsvParseResult } from "../csv";

export type ParseHandler = (result: UserAddCsvParseResult, fileName: string) => void;

const readFileText = (file: File): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (): void => resolve(String(reader.result ?? ""));
        reader.onerror = (): void => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsText(file);
    });
};

const handleFile = async (file: File, onParsed: ParseHandler): Promise<void> => {
    const text = await readFileText(file);
    const result = parseUserAddCsv(text);
    onParsed(result, file.name);
};

export const wireFileInput = (input: HTMLInputElement, onParsed: ParseHandler): void => {
    input.addEventListener("change", (): void => {
        const file = input.files !== null && input.files.length > 0 ? input.files[0] : null;

        if (file === null) {
            return;
        }

        handleFile(file, onParsed).catch((caught: unknown): void => {
            const message = caught instanceof Error ? caught.message : String(caught);
            globalThis.console.error(`[LovableUserAdd] CSV read failed: ${message}`);
        });
    });
};
