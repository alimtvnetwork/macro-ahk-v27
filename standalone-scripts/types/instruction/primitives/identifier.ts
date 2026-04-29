/**
 * Stable string identifier — typically `kebab-case`. Used for
 * `ProjectInstruction.Name`, `SeedBlock.Id`, dependency project IDs, etc.
 *
 * Kept as a structural alias (not a branded type) for the Phase 1
 * PascalCase migration: every `instruction.ts` ships plain string
 * literals, so a brand would force a wave of `as Identifier` casts
 * with no extra safety. A future phase may introduce `asIdentifier()`
 * + a brand if/when construction helpers are added.
 */
export type Identifier = string;
