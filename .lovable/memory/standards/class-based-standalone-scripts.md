---
name: Class-based standalone scripts
description: Every standalone script entry point exports one default class; related logic lives as methods or injected dependencies
type: preference
---

Each `standalone-scripts/<name>/src/index.ts` MUST:

1. Export a single default class named in PascalCase matching the script (e.g. `PaymentBannerHider`, `XPathRecorder`, `MacroController`).
2. Place every operation related to the script (lifecycle, DOM access, event handling, settings IO) on the class — either as a method or as a dependency injected through the constructor.
3. NOT export top-level free functions for behaviour. The only acceptable top-level exports are: the default class, the bootstrap call (e.g. `new PaymentBannerHider().start()`), and `type` re-exports.

If multiple cohesive responsibilities exist (e.g. selector resolution + animation + telemetry), split them into their own classes and inject them through the constructor of the entry-point class.

**Why**: Reviewer requirement on 2026-04-24 banner-hider RCA: *"write code in terms of class, not just direct functions … any function related to this should actually come from this PaymentBannerHider definition. Every class should be injected inside this and then received from this."* Free-function entry points scatter related logic across a file and make it impossible to inject test doubles or mock dependencies.

**How to apply**: When scaffolding a new standalone script, the agent generates the class shell first, then fills methods. Refactor existing free-function scripts opportunistically when touched.
