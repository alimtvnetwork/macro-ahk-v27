/**
 * Marco Extension — Schema Migration v7 SQL
 *
 * Creates SharedAsset, AssetLink, ProjectGroup, ProjectGroupMember tables
 * for the Cross-Project Sync feature.
 *
 * See: spec/21-app/02-features/misc-features/cross-project-sync.md
 */

import {
    SHARED_ASSET_SCHEMA,
    ASSET_LINK_SCHEMA,
    PROJECT_GROUP_SCHEMA,
    PROJECT_GROUP_MEMBER_SCHEMA,
} from "./db-schemas";

/**
 * Returns all v7 SQL statements as individual strings for runIgnoringDuplicates.
 * Each schema constant may contain multiple statements separated by semicolons.
 */
export function getV7Statements(): string[] {
    const allSql = [
        SHARED_ASSET_SCHEMA,
        ASSET_LINK_SCHEMA,
        PROJECT_GROUP_SCHEMA,
        PROJECT_GROUP_MEMBER_SCHEMA,
    ].join("\n");

    return allSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s + ";");
}
