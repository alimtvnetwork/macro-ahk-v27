---
name: Blank line before return
description: Every non-trivial return statement has a blank line above it
type: preference
---

A `return` statement MUST be preceded by a blank line when:

- It is not the only statement in its block.
- The previous line is not the opening `{` of the block.

Examples:

```ts
// ✅ ok — sole statement
function getName(): string {
    return this.name;
}

// ✅ ok — first statement after `{`
function getName(): string {
    if (cached) {
        return cached;
    }

    return computeName();
}

// ✅ ok — blank line above
function compute(): number {
    const partial = step1();
    const full = step2(partial);

    return full;
}

// ❌ wrong — no blank line
function compute(): number {
    const partial = step1();
    const full = step2(partial);
    return full;
}
```

**Why**: Visual separation makes the exit point of every function obvious during review. Project formatting standard CQ15 already required this; the 2026-04-24 banner-hider RCA showed multiple violations slipping through.

**How to apply**: ESLint rule `padding-line-between-statements: ["error", { blankLine: "always", prev: "*", next: "return" }]` — planned in `plan.md` Task 0.8. Until enabled, agent must visually inspect every `return` in the diff.
