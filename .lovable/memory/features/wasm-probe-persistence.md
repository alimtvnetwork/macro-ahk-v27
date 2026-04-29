---
name: WASM Probe Persistence
description: Capturing HEAD-probe status, content-length, and head-error from verifyWasmPresence and surfacing them in BootFailureBanner across SW restarts
type: feature
---

# WASM Probe Persistence (v2.179.0+)

## Problem

The popup banner classified `[WASM_FILE_MISSING_404]` failures with a dedicated fix block but the *evidence* (what HEAD actually returned) lived only in the SW console — often unreachable mid-failure.

## Capture pipeline

1. `boot-diagnostics.ts` exports `WasmProbeResult` ({ url, status, contentLength, headError, ok, at }) plus `setWasmProbeResult()` / `getWasmProbeResult()` module state.
2. `db-manager.ts → verifyWasmPresence()` builds a probe object up front and calls `setWasmProbeResult(probe)` on every exit branch — HEAD threw, 404, non-2xx, content-length 0, AND success. Errors continue to throw the existing `[WASM_FILE_MISSING_404]` tag so `classifyCause()` still picks `kind: "wasm-missing"`.
3. `status-handler.ts` includes `wasmProbe: getWasmProbeResult()` in `StatusResponse`.
4. `boot.ts → persistBootFailure()` embeds `wasmProbe: getWasmProbeResult()` in the `marco_last_boot_failure` payload, mirroring the existing `context` field. The probe survives SW restarts because the persisted record is the source of truth.
5. `use-popup-data.ts` exposes `effectiveWasmProbe = status?.wasmProbe ?? persistedFailure?.wasmProbe ?? null` (live overlaid on persisted).
6. `BootFailureBanner` renders a dedicated `WasmProbeResult` collapsible block (open by default) with status / content-length / ok / url / head-error and includes the same fields in the `Copy report` and `Create support report` bundles under `── WASM HEAD probe ───`.

## Type mirroring

`WasmProbeResult` is duplicated in:
- `src/background/boot-diagnostics.ts` (source of truth)
- `src/shared/messages.ts` (StatusResponse contract)
- `src/hooks/use-popup-data.ts` (popup hook)
- `src/popup/hooks/usePopupData.ts` (legacy popup hook)
- `src/components/popup/BootFailureBanner.tsx` (UI prop)

Keep these in sync when the shape changes.
