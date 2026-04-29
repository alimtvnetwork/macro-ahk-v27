/**
 * Marco Extension — Recorder Data Source Handler
 *
 * Phase 07 — Macro Recorder.
 *
 * Background-side message handlers for the data source drop zone:
 *   - RECORDER_DATA_SOURCE_ADD: parse CSV/JSON + persist into the
 *     project's per-project SQLite `DataSource` table.
 *   - RECORDER_DATA_SOURCE_LIST: list every persisted `DataSource` row
 *     for the active project.
 *
 * @see spec/31-macro-recorder/07-data-source-drop-zone.md
 */

import type { MessageRequest } from "../../shared/messages";
import {
    parseCsv,
    parseJsonRows,
    type ParsedDataSource,
} from "../recorder/data-source-parsers";
import {
    insertDataSource,
    listDataSources,
    type PersistedDataSource,
} from "../recorder/data-source-persistence";

interface AddRequest {
    projectSlug: string;
    filePath: string;
    mimeKind: "csv" | "json";
    rawText: string;
}

interface ListRequest {
    projectSlug: string;
}

/* ------------------------------------------------------------------ */
/*  Add                                                                */
/* ------------------------------------------------------------------ */

export async function handleRecorderDataSourceAdd(
    message: MessageRequest,
): Promise<{ isOk: true; dataSource: PersistedDataSource }> {
    const req = message as unknown as AddRequest;
    validateAddRequest(req);

    const parsed = parseByKind(req.mimeKind, req.rawText);
    const dataSource = await insertDataSource(req.projectSlug, req.filePath, parsed);

    return { isOk: true, dataSource };
}

function validateAddRequest(req: AddRequest): void {
    const missingSlug = !req.projectSlug;
    const missingPath = !req.filePath;
    const missingText = req.rawText === undefined || req.rawText === null;

    if (missingSlug || missingPath || missingText) {
        throw new Error(
            "RECORDER_DATA_SOURCE_ADD requires projectSlug, filePath, and rawText",
        );
    }
}

function parseByKind(kind: "csv" | "json", rawText: string): ParsedDataSource {
    if (kind === "csv") return parseCsv(rawText);
    if (kind === "json") return parseJsonRows(rawText);
    throw new Error(`Unsupported data source kind: ${kind as string}`);
}

/* ------------------------------------------------------------------ */
/*  List                                                               */
/* ------------------------------------------------------------------ */

export async function handleRecorderDataSourceList(
    message: MessageRequest,
): Promise<{ dataSources: ReadonlyArray<PersistedDataSource> }> {
    const req = message as unknown as ListRequest;
    if (!req.projectSlug) {
        throw new Error("RECORDER_DATA_SOURCE_LIST requires projectSlug");
    }

    const dataSources = await listDataSources(req.projectSlug);
    return { dataSources };
}
