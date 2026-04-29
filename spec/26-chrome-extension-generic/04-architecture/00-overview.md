# Architecture

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

The keystone of the blueprint. Defines the six-phase lifecycle, the three-world model (background SW / content ISOLATED / page MAIN), the three-tier message relay, the platform-adapter abstraction, the namespace system (window.<RootNamespace>.Projects.<ProjectName>.*), namespace registration with self-test, and the seven-stage injection pipeline.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-six-phase-lifecycle.md](./01-six-phase-lifecycle.md) | Install → bootstrap → SW → injection → auth → teardown
| 02 | [02-three-world-model.md](./02-three-world-model.md) | Background SW / content ISOLATED / page MAIN — boundaries & comms
| 03 | [03-message-relay.md](./03-message-relay.md) | Three-tier relay: page ↔ content ↔ background
| 04 | [04-platform-adapter.md](./04-platform-adapter.md) | platform-adapter + chrome-adapter interfaces
| 05 | [05-namespace-system.md](./05-namespace-system.md) | window.<RootNamespace>.Projects.<ProjectName>.* shape & freezing
| 06 | [06-namespace-registration.md](./06-namespace-registration.md) | Register / freeze / runtime self-test pattern
| 07 | [07-injection-pipeline.md](./07-injection-pipeline.md) | 7-stage: resolve → bootstrap → require → mount → auth → ready → marker

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
