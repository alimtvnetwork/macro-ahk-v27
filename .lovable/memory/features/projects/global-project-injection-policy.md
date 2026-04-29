# Memory: features/projects/global-project-injection-policy
Updated: 2026-03-26

## Global Project Behavior

Projects with `isGlobal: true` act as **implicit dependencies** for all other projects. When any non-global project's URL rules match and trigger injection, all global projects are automatically injected first, before the matched project's own scripts.

### Injection Order
1. **Global projects** — injected in topological order (respecting their own inter-dependencies)
2. **Explicit dependencies** — declared in `project.dependencies[]`, resolved via Kahn's algorithm
3. **Project scripts** — the matched project's own scripts in configured order

### Key Rules
- Global projects do NOT inject automatically on their own — they only inject when a non-global project matches
- Global projects can also be explicit dependencies of other projects (the dependency system deduplicates)
- The Riseup Macro SDK is the primary example of a global project (`isGlobal: true`, `isRemovable: false`, `loadOrder: 0`)
- Global projects with `onlyRunAsDependency: true` are even more restricted — they never trigger standalone injection

### UI Representation
The General tab's Dependencies section shows:
- A highlighted box listing all global projects as "auto-injected first" with Globe icons
- Explicit dependencies with resolved/missing status indicators
- An injection order explanation footer
