# Solved Issues: Issues 76–88 Summary

**Resolved**: Various dates (2026-03-20 through 2026-03-27)

## Issue 76: Cookie Namespace Binding Gap
- **Root Cause**: Cookie values not bound into the SDK namespace
- **Solution**: Added cookie binding to namespace enrichment pipeline
- **Learning**: All data surfaces (cookies, storage, DOM) must be reflected in the namespace

## Issue 77: Live Script Hot-Reload
- **Root Cause**: No mechanism to reload scripts without full page refresh
- **Solution**: Hot-reload poller detects new builds and re-injects
- **Learning**: File hash comparison is more reliable than timestamp-based detection

## Issue 79: Window Globals Migration
- **Root Cause**: 40+ `window.__*` globals created maintenance and collision risk
- **Solution**: Migrated to `nsRead`/`nsCall` namespace pattern with deprecation traps
- **Learning**: Dual-write during migration ensures backward compatibility

## Issue 80: Auth Token Bridge Null on Preview
- **Root Cause**: JWT fallback didn't cover platform tab Supabase storage
- **Solution**: Added JWT fallback from platform tab, actionable error propagation, apex domain coverage
- **Learning**: Auth must work across all tab types (preview, platform, editor)

## Issue 81: Auth No Token (Stale Macro Bundle)
- **Root Cause**: Stale cached macro bundle didn't include latest auth fixes
- **Solution**: Cache invalidation on deploy, forced rebuild
- **Learning**: Always invalidate injection cache when deploying auth changes

## Issue 83: Dependency Globals + Auth Cookie Header
- **Root Cause**: Globals not injected before dependent scripts; auth cookie stripped by browser
- **Solution**: Fixed injection order; added proper cookie handling
- **Learning**: Script dependency order is critical — document and enforce it

## Issue 85: SDK Notifier, Config Seeding & DB Overhaul
- **Root Cause**: Multiple related issues consolidated
- **Solution**: JSON Schema meta engine, per-project meta tables, migration engine, doc generators
- **Learning**: Consolidating related issues reduces context-switching overhead

## Issue 86: SDK Notifier, Config & DB Overhaul (Consolidated)
- **Root Cause**: SDK `marco.notify` rendering regression, config seeding gaps, DB panel needed overhaul
- **Solution**: 13 tasks delivered: notifier fix, version toast, config seeding pipeline, reusable editors, Schema/Data/JSON tabs
- **Learning**: Reusable components (ColumnEditor, ValidationRuleEditor, ForeignKeyEditor) pay off across panels

## Issue 87: Injection Pipeline Performance
- **Root Cause**: Sequential reads, per-project loops, unoptimized IPC
- **Solution**: 8 optimizations: caching, bulk queries, parallelization, batch injection, pre-serialization
- **Learning**: Measure first (timing instrumentation), then optimize the biggest bottleneck

## Issue 88: IndexedDB Injection Cache
- **Root Cause**: `resolveScriptCode()` falls back to stub when build artifacts missing
- **Solution**: IndexedDB cache with auto-invalidation on deploy, manual invalidation button
- **Learning**: Cache invalidation is harder than caching — always provide manual override
