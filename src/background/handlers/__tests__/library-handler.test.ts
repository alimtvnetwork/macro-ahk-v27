import { describe, it, expect, beforeEach, vi } from "vitest";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import {
  bindLibraryDbManager,
  handleGetSharedAssets,
  handleGetSharedAsset,
  handleSaveSharedAsset,
  handleDeleteSharedAsset,
  handleGetAssetLinks,
  handleSaveAssetLink,
  handleDeleteAssetLink,
  handleSyncLibraryAsset,
  handlePromoteAsset,
  handleReplaceLibraryAsset,
  handleForkLibraryAsset,
  handleGetProjectGroups,
  handleSaveProjectGroup,
  handleDeleteProjectGroup,
  handleGetGroupMembers,
  handleAddGroupMember,
  handleRemoveGroupMember,
  handleExportLibrary,
  handleImportLibrary,
} from "../library-handler";

import {
  SHARED_ASSET_SCHEMA,
  ASSET_LINK_SCHEMA,
  PROJECT_GROUP_SCHEMA,
  PROJECT_GROUP_MEMBER_SCHEMA,
  ASSET_VERSION_SCHEMA,
} from "../../db-schemas";

let db: SqlJsDatabase;

function createSchema(database: SqlJsDatabase): void {
  const allSql = [
    SHARED_ASSET_SCHEMA,
    ASSET_LINK_SCHEMA,
    PROJECT_GROUP_SCHEMA,
    PROJECT_GROUP_MEMBER_SCHEMA,
    ASSET_VERSION_SCHEMA,
  ].join("\n");

  const statements = allSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    database.run(stmt + ";");
  }
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  createSchema(db);

  const mockDbManager = {
    getLogsDb: () => db,
    markDirty: vi.fn(),
  };
  bindLibraryDbManager(mockDbManager as any);
});

/* ------------------------------------------------------------------ */
/*  SharedAsset CRUD                                                   */
/* ------------------------------------------------------------------ */

describe("SharedAsset CRUD", () => {
  it("saves and retrieves a new asset", async () => {
    const { assetId } = await handleSaveSharedAsset({
      asset: { Type: "prompt", Name: "Test Prompt", Slug: "test-prompt", ContentJson: '{"text":"hello"}' },
    });
    expect(assetId).toBeGreaterThan(0);

    const { asset } = await handleGetSharedAsset({ assetId });
    expect(asset).not.toBeNull();
    expect(asset!.Name).toBe("Test Prompt");
    expect(asset!.Type).toBe("prompt");
    expect(asset!.Slug).toBe("test-prompt");
    expect(asset!.ContentHash).toHaveLength(64);
    expect(asset!.Version).toBe("1.0.0");
  });

  it("updates an existing asset", async () => {
    const { assetId } = await handleSaveSharedAsset({
      asset: { Type: "script", Name: "Script A", Slug: "script-a", ContentJson: '{"code":"v1"}' },
    });

    await handleSaveSharedAsset({
      asset: { Id: assetId, Type: "script", Name: "Script A Updated", Slug: "script-a", ContentJson: '{"code":"v2"}', Version: "1.1.0" },
    });

    const { asset } = await handleGetSharedAsset({ assetId });
    expect(asset!.Name).toBe("Script A Updated");
    expect(asset!.Version).toBe("1.1.0");
  });

  it("lists all assets", async () => {
    await handleSaveSharedAsset({ asset: { Type: "prompt", Name: "P1", Slug: "p1", ContentJson: "{}" } });
    await handleSaveSharedAsset({ asset: { Type: "script", Name: "S1", Slug: "s1", ContentJson: "{}" } });

    const { assets } = await handleGetSharedAssets({});
    expect(assets).toHaveLength(2);
  });

  it("filters assets by type", async () => {
    await handleSaveSharedAsset({ asset: { Type: "prompt", Name: "P1", Slug: "p1", ContentJson: "{}" } });
    await handleSaveSharedAsset({ asset: { Type: "script", Name: "S1", Slug: "s1", ContentJson: "{}" } });

    const { assets } = await handleGetSharedAssets({ assetType: "prompt" });
    expect(assets).toHaveLength(1);
    expect(assets[0].Type).toBe("prompt");
  });

  it("returns null for non-existent asset", async () => {
    const { asset } = await handleGetSharedAsset({ assetId: 999 });
    expect(asset).toBeNull();
  });

  it("deletes asset and detaches synced links", async () => {
    const { assetId } = await handleSaveSharedAsset({
      asset: { Type: "prompt", Name: "P", Slug: "p", ContentJson: "{}" },
    });

    // Create synced + pinned links
    await handleSaveAssetLink({ link: { SharedAssetId: assetId, ProjectId: 1, LinkState: "synced" } });
    await handleSaveAssetLink({ link: { SharedAssetId: assetId, ProjectId: 2, LinkState: "pinned" } });

    const { detachedCount } = await handleDeleteSharedAsset({ assetId });
    expect(detachedCount).toBe(1); // Only the synced one counts

    // Asset should be gone
    const { asset } = await handleGetSharedAsset({ assetId });
    expect(asset).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  AssetLink CRUD                                                     */
/* ------------------------------------------------------------------ */

describe("AssetLink CRUD", () => {
  let assetId: number;

  beforeEach(async () => {
    const result = await handleSaveSharedAsset({
      asset: { Type: "prompt", Name: "Linked", Slug: "linked", ContentJson: '{"a":1}' },
    });
    assetId = result.assetId;
  });

  it("creates and retrieves a link", async () => {
    const { linkId } = await handleSaveAssetLink({
      link: { SharedAssetId: assetId, ProjectId: 10 },
    });
    expect(linkId).toBeGreaterThan(0);

    const { links } = await handleGetAssetLinks({ projectId: 10 });
    expect(links).toHaveLength(1);
    expect(links[0].LinkState).toBe("synced");
  });

  it("updates link state", async () => {
    const { linkId } = await handleSaveAssetLink({
      link: { SharedAssetId: assetId, ProjectId: 10 },
    });

    await handleSaveAssetLink({
      link: { Id: linkId, SharedAssetId: assetId, ProjectId: 10, LinkState: "pinned", PinnedVersion: "1.0.0" },
    });

    const { links } = await handleGetAssetLinks({ projectId: 10 });
    expect(links[0].LinkState).toBe("pinned");
    expect(links[0].PinnedVersion).toBe("1.0.0");
  });

  it("filters by sharedAssetId", async () => {
    await handleSaveAssetLink({ link: { SharedAssetId: assetId, ProjectId: 1 } });

    const { links } = await handleGetAssetLinks({ sharedAssetId: assetId });
    expect(links).toHaveLength(1);
  });

  it("deletes a link", async () => {
    const { linkId } = await handleSaveAssetLink({
      link: { SharedAssetId: assetId, ProjectId: 10 },
    });

    await handleDeleteAssetLink({ linkId });

    const { links } = await handleGetAssetLinks({ projectId: 10 });
    expect(links).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Sync Engine                                                        */
/* ------------------------------------------------------------------ */

describe("Sync Engine", () => {
  it("syncs synced links and counts pinned", async () => {
    const { assetId } = await handleSaveSharedAsset({
      asset: { Type: "prompt", Name: "P", Slug: "p", ContentJson: '{"v":1}' },
    });

    await handleSaveAssetLink({ link: { SharedAssetId: assetId, ProjectId: 1, LinkState: "synced" } });
    await handleSaveAssetLink({ link: { SharedAssetId: assetId, ProjectId: 2, LinkState: "synced" } });
    await handleSaveAssetLink({ link: { SharedAssetId: assetId, ProjectId: 3, LinkState: "pinned", PinnedVersion: "1.0.0" } });

    const result = await handleSyncLibraryAsset({ assetId });
    expect(result.syncedCount).toBe(2);
    expect(result.pinnedNotified).toBe(1);
  });

  it("returns zeros for non-existent asset", async () => {
    const result = await handleSyncLibraryAsset({ assetId: 999 });
    expect(result.syncedCount).toBe(0);
    expect(result.pinnedNotified).toBe(0);
  });
});

describe("Promote Asset", () => {
  it("creates new asset when slug does not exist", async () => {
    const result = await handlePromoteAsset({
      slug: "new-prompt", name: "New", type: "prompt", contentJson: '{"t":"x"}',
    });
    expect(result.action).toBe("created");
    expect(result.assetId).toBeGreaterThan(0);
  });

  it("returns identical when content matches", async () => {
    const content = '{"t":"same"}';
    await handleSaveSharedAsset({
      asset: { Type: "prompt", Name: "Same", Slug: "same-slug", ContentJson: content },
    });

    const result = await handlePromoteAsset({
      slug: "same-slug", name: "Same", type: "prompt", contentJson: content,
    });
    expect(result.action).toBe("identical");
  });

  it("returns conflict when content differs", async () => {
    await handleSaveSharedAsset({
      asset: { Type: "prompt", Name: "Existing", Slug: "conflict-slug", ContentJson: '{"v":1}' },
    });

    const result = await handlePromoteAsset({
      slug: "conflict-slug", name: "Existing", type: "prompt", contentJson: '{"v":2}',
    });
    expect(result.action).toBe("conflict");
    expect(result.existingVersion).toBe("1.0.0");
  });
});

describe("Replace Library Asset", () => {
  it("bumps minor version and updates content", async () => {
    const { assetId } = await handleSaveSharedAsset({
      asset: { Type: "script", Name: "S", Slug: "s", ContentJson: '{"v":1}' },
    });

    const { newVersion } = await handleReplaceLibraryAsset({
      assetId, contentJson: '{"v":2}',
    });
    expect(newVersion).toBe("1.1.0");

    const { asset } = await handleGetSharedAsset({ assetId });
    expect(asset!.ContentJson).toBe('{"v":2}');
  });
});

describe("Fork Library Asset", () => {
  it("creates a forked asset with unique slug", async () => {
    await handleSaveSharedAsset({
      asset: { Type: "prompt", Name: "Original", Slug: "orig", ContentJson: '{}' },
    });

    const { assetId, slug } = await handleForkLibraryAsset({
      originalSlug: "orig", name: "Forked", type: "prompt", contentJson: '{"forked":true}',
    });
    expect(slug).toBe("orig-fork");
    expect(assetId).toBeGreaterThan(0);
  });

  it("increments fork counter on collision", async () => {
    await handleSaveSharedAsset({ asset: { Type: "prompt", Name: "O", Slug: "orig", ContentJson: '{}' } });
    await handleSaveSharedAsset({ asset: { Type: "prompt", Name: "F1", Slug: "orig-fork", ContentJson: '{}' } });

    const { slug } = await handleForkLibraryAsset({
      originalSlug: "orig", name: "F2", type: "prompt", contentJson: '{"f":2}',
    });
    expect(slug).toBe("orig-fork-2");
  });
});

/* ------------------------------------------------------------------ */
/*  ProjectGroup CRUD                                                  */
/* ------------------------------------------------------------------ */

describe("ProjectGroup CRUD", () => {
  it("creates and lists groups", async () => {
    await handleSaveProjectGroup({ group: { Name: "Group A" } });
    await handleSaveProjectGroup({ group: { Name: "Group B" } });

    const { groups } = await handleGetProjectGroups();
    expect(groups).toHaveLength(2);
    expect(groups[0].Name).toBe("Group A");
  });

  it("updates a group", async () => {
    const { groupId } = await handleSaveProjectGroup({ group: { Name: "Old" } });
    await handleSaveProjectGroup({ group: { Id: groupId, Name: "New", SharedSettingsJson: '{"x":1}' } });

    const { groups } = await handleGetProjectGroups();
    expect(groups[0].Name).toBe("New");
  });

  it("deletes a group", async () => {
    const { groupId } = await handleSaveProjectGroup({ group: { Name: "Gone" } });
    await handleDeleteProjectGroup({ groupId });

    const { groups } = await handleGetProjectGroups();
    expect(groups).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  GroupMember CRUD                                                    */
/* ------------------------------------------------------------------ */

describe("GroupMember CRUD", () => {
  let groupId: number;

  beforeEach(async () => {
    const result = await handleSaveProjectGroup({ group: { Name: "G1" } });
    groupId = result.groupId;
  });

  it("adds and retrieves members", async () => {
    await handleAddGroupMember({ groupId, projectId: 100 });
    await handleAddGroupMember({ groupId, projectId: 200 });

    const { members } = await handleGetGroupMembers({ groupId });
    expect(members).toHaveLength(2);
  });

  it("removes a member", async () => {
    await handleAddGroupMember({ groupId, projectId: 100 });
    await handleRemoveGroupMember({ groupId, projectId: 100 });

    const { members } = await handleGetGroupMembers({ groupId });
    expect(members).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Import / Export                                                     */
/* ------------------------------------------------------------------ */

describe("Import / Export", () => {
  it("round-trips assets and groups", async () => {
    await handleSaveSharedAsset({ asset: { Type: "prompt", Name: "P1", Slug: "p1", ContentJson: '{"text":"hello"}' } });
    const { groupId } = await handleSaveProjectGroup({ group: { Name: "G1" } });
    await handleAddGroupMember({ groupId, projectId: 42 });

    const { bundle } = await handleExportLibrary();
    expect(bundle.assets).toHaveLength(1);
    expect(bundle.groups).toHaveLength(1);
    expect(bundle.groups[0].memberProjectIds).toContain(42);

    // Import into fresh DB
    const SQL = await initSqlJs();
    const freshDb = new SQL.Database();
    createSchema(freshDb);
    bindLibraryDbManager({ getLogsDb: () => freshDb, markDirty: vi.fn() } as any);

    const result = await handleImportLibrary({ bundle });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.conflicts).toHaveLength(0);

    const { assets } = await handleGetSharedAssets({});
    expect(assets).toHaveLength(1);
    expect(assets[0].Name).toBe("P1");
  });

  it("skips identical assets on import", async () => {
    const content = '{"same":"content"}';
    await handleSaveSharedAsset({ asset: { Type: "prompt", Name: "P", Slug: "dup", ContentJson: content } });

    const { bundle } = await handleExportLibrary();

    const result = await handleImportLibrary({ bundle });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("reports conflicts for differing content", async () => {
    await handleSaveSharedAsset({ asset: { Type: "prompt", Name: "P", Slug: "conflict", ContentJson: '{"v":1}' } });

    const bundle = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      assets: [{ type: "prompt" as const, slug: "conflict", name: "P", version: "1.0.0", content: { v: 2 } }],
      groups: [],
    };

    const result = await handleImportLibrary({ bundle });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].slug).toBe("conflict");
  });
});
