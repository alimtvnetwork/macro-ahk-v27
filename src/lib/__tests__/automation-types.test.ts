/**
 * Unit tests for automation-types.ts — flattenSteps, createDefaultStep, STEP_TYPE_META
 */

import { describe, it, expect } from "vitest";
import {
  flattenSteps,
  createDefaultStep,
  STEP_TYPE_META,
  type ChainStep,
} from "../automation-types";

describe("flattenSteps", () => {
  it("flattens a simple linear chain", () => {
    const steps: ChainStep[] = [
      { type: "wait", durationMs: 100 },
      { type: "notify", message: "done" },
    ];
    const flat = flattenSteps(steps);
    expect(flat).toHaveLength(2);
    expect(flat[0].depth).toBe(0);
    expect(flat[1].depth).toBe(0);
  });

  it("flattens a condition with then/else branches", () => {
    const steps: ChainStep[] = [
      {
        type: "condition",
        check: { type: "element_exists", selector: ".foo" },
        then: [{ type: "notify", message: "yes" }],
        else: [{ type: "notify", message: "no" }],
      },
    ];
    const flat = flattenSteps(steps);
    expect(flat).toHaveLength(3); // condition + 1 then + 1 else
    expect(flat[0].depth).toBe(0);
    expect(flat[1].depth).toBe(1);
    expect(flat[1].branchLabel).toBe("then");
    expect(flat[2].depth).toBe(1);
    expect(flat[2].branchLabel).toBe("else");
  });

  it("handles empty then/else", () => {
    const steps: ChainStep[] = [
      {
        type: "condition",
        check: { type: "element_absent", selector: ".bar" },
        then: [],
        else: [],
      },
    ];
    const flat = flattenSteps(steps);
    expect(flat).toHaveLength(1);
  });
});

describe("createDefaultStep", () => {
  const stepTypes: ChainStep["type"][] = [
    "inject_prompt", "click_button", "wait", "wait_for_element",
    "wait_for_text", "run_script", "set_kv", "notify", "condition",
  ];

  it.each(stepTypes)("creates a valid default for %s", (type) => {
    const step = createDefaultStep(type);
    expect(step.type).toBe(type);
  });

  it("creates wait with 1000ms default", () => {
    const step = createDefaultStep("wait") as { type: "wait"; durationMs: number };
    expect(step.durationMs).toBe(1000);
  });

  it("creates condition with empty branches", () => {
    const step = createDefaultStep("condition") as { type: "condition"; then: ChainStep[]; else: ChainStep[] };
    expect(step.then).toEqual([]);
    expect(step.else).toEqual([]);
  });
});

describe("STEP_TYPE_META", () => {
  it("has entries for all 9 step types", () => {
    expect(Object.keys(STEP_TYPE_META)).toHaveLength(9);
  });

  it("each entry has label, icon, and color", () => {
    for (const meta of Object.values(STEP_TYPE_META)) {
      expect(meta.label).toBeTruthy();
      expect(meta.icon).toBeTruthy();
      expect(meta.color).toBeTruthy();
    }
  });
});
