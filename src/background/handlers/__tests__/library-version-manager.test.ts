import { describe, it, expect } from "vitest";
import {
  parseSemver,
  formatSemver,
  bumpMinor,
  bumpPatch,
  bumpMajor,
  compareSemver,
} from "../library-version-manager";

describe("parseSemver", () => {
  it("parses standard semver", () => {
    expect(parseSemver("2.1.3")).toEqual([2, 1, 3]);
  });

  it("parses version with missing parts", () => {
    expect(parseSemver("1")).toEqual([1, 0, 0]);
    expect(parseSemver("3.2")).toEqual([3, 2, 0]);
  });

  it("handles empty string gracefully", () => {
    const [major, minor, patch] = parseSemver("");
    // Number("") returns 0, so fallback kicks in: parts[0] ?? 1 = 0 (0 is not nullish)
    expect(major).toBe(0);
    expect(minor).toBe(0);
    expect(patch).toBe(0);
  });
});

describe("formatSemver", () => {
  it("formats to dot-separated string", () => {
    expect(formatSemver(1, 2, 3)).toBe("1.2.3");
  });

  it("handles zero values", () => {
    expect(formatSemver(0, 0, 0)).toBe("0.0.0");
  });
});

describe("bumpMinor", () => {
  it("increments minor and resets patch", () => {
    expect(bumpMinor("2.1.5")).toBe("2.2.0");
  });

  it("handles 1.0.0", () => {
    expect(bumpMinor("1.0.0")).toBe("1.1.0");
  });
});

describe("bumpPatch", () => {
  it("increments patch only", () => {
    expect(bumpPatch("2.1.0")).toBe("2.1.1");
    expect(bumpPatch("1.0.9")).toBe("1.0.10");
  });
});

describe("bumpMajor", () => {
  it("increments major and resets minor + patch", () => {
    expect(bumpMajor("2.5.3")).toBe("3.0.0");
  });
});

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("compares major", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    expect(compareSemver("3.0.0", "2.0.0")).toBe(1);
  });

  it("compares minor when major equal", () => {
    expect(compareSemver("1.1.0", "1.2.0")).toBe(-1);
    expect(compareSemver("1.3.0", "1.2.0")).toBe(1);
  });

  it("compares patch when major+minor equal", () => {
    expect(compareSemver("1.2.1", "1.2.3")).toBe(-1);
    expect(compareSemver("1.2.5", "1.2.3")).toBe(1);
  });
});
