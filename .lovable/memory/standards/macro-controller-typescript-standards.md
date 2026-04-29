# Memory: standards/macro-controller-typescript-standards
Updated: now

The macro controller codebase (standalone-scripts/macro-controller/src/) adheres to strict TypeScript standards to ensure type safety and prevent runtime crashes. It enforces 'noImplicitAny', 'noUnusedLocals', 'noUnusedParameters', 'noImplicitOverride', and 'noFallthroughCasesInSwitch' via tsconfig.macro.json. The use of 'any' and 'Record<string, any>' is prohibited in favor of explicit interfaces (e.g., ControllerState, PromptEntry, LoopCreditState) and enums (e.g., LoopDirection, CreditSource) for state management, API responses, and configuration.

## Error Handling Convention
- All `catch` blocks use `catch (e: unknown)` — this is correct TypeScript practice.
- **Never** use `(e as Error)?.message || e` or `e instanceof Error ? e.message : String(e)` inline. Instead, use the centralized `toErrorMessage(e)` helper from `src/error-utils.ts`.
- For catch blocks that need specific error type detection (e.g., `DOMException` quota checks), use `instanceof` directly — `toErrorMessage` is for message extraction only.

## Derived Types Convention
- When a type is derivable from an existing interface, use a type alias instead of repeating the union. Example: `type TaskNextSettingValue = TaskNextSettings[keyof TaskNextSettings]` resolves to `string | number`.
- Functions returning promises should use concrete return types (e.g., `Promise<void> | undefined`), never `unknown`.

## Key Rules
- No `any` anywhere (enforced by `noImplicitAny`)
- No `Record<string, any>` — use derived types or explicit interfaces
- Functions must have concrete return types, not `unknown` (exception: `parseWithRecovery` which parses arbitrary JSON)
- Error messages extracted via `toErrorMessage()` from `error-utils.ts`
- `[key: string]: unknown` index signatures are acceptable for extensible interfaces in `types.ts`
