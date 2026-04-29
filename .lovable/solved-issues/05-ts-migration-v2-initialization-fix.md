# Pending Issue: TS Migration V2 — Phase 01 Initialization Fix

**Priority**: Critical  
**Spec**: `spec/04-macro-controller/ts-migration-v2/01-initialization-fix.md`  
**Status**: ✅ Done (v1.75.0)  
**Completed**: 2026-04-01

## Problem
Macro controller initialization order is fragile — workspace name detection can run before auth is ready, causing null token errors and missed workspace names on first load.

## Root Cause
The 200ms startup delay in `macro-looping.ts` is a race condition workaround. Auth, credits, and workspace detection run sequentially but without proper dependency gating.

## Blocked By
Nothing — this is the first phase.

## Blocks
- Phase 02 (Class architecture) depends on this being stable first.
