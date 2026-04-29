import { describe, it, expect } from "vitest";
import { computeContentHash } from "../library-content-hasher";

describe("computeContentHash", () => {
  it("returns a 64-char hex string (SHA-256)", async () => {
    const hash = await computeContentHash("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic output", async () => {
    const a = await computeContentHash("test content");
    const b = await computeContentHash("test content");
    expect(a).toBe(b);
  });

  it("produces different hashes for different content", async () => {
    const a = await computeContentHash("content-a");
    const b = await computeContentHash("content-b");
    expect(a).not.toBe(b);
  });

  it("handles empty string", async () => {
    const hash = await computeContentHash("");
    expect(hash).toHaveLength(64);
    // Known SHA-256 of empty string
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("handles unicode content", async () => {
    const hash = await computeContentHash("你好世界 🌍");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles large content", async () => {
    const large = "x".repeat(100_000);
    const hash = await computeContentHash(large);
    expect(hash).toHaveLength(64);
  });
});
