# Plan: Credit Formula Revisions & Progress Bar Overhaul (v7.9.9–v7.9.15)

**Status**: COMPLETED
**Date Completed**: 2026-02-22
**Version**: v7.9.9 → v7.9.15

## Summary
Iterative refinement of credit calculation logic and progress bar visuals across both controllers. Established precise, documented formulas and extracted shared helper functions.

## Issues Fixed

### 1. Total Credits Formula (v7.9.9 → v7.9.15)
- **Root Cause**: Repeated confusion about what constitutes "Total Credits" — initial implementations conflated total capacity with available amounts
- **Final Formula**: `credits_granted + daily_credits_limit + billing_period_credits_limit + topup_credits_limit + rollover_credits_limit`
- **Fix**: Extracted `calcTotalCredits()` helper function in both controllers

### 2. Available Credits Formula (v7.9.15)
- **Formula**: `Total Credits - rollover_credits_used - daily_credits_used - billing_period_credits_used`
- **Fix**: Extracted `calcAvailableCredits()` helper

### 3. Free Credit Available (v7.9.15)
- **Formula**: `daily_credits_limit - daily_credits_used`
- **Fix**: Extracted `calcFreeCreditAvailable()` helper

### 4. Progress Bar Visual Overhaul (v7.9.10–v7.9.14)
- Widened bars (combo 300px, macro 260px)
- Height increased to 14px/12px
- Reddish used-credit background (`rgba(239,68,68,0.25)`)
- Clarified ⚡ label: bold available + dimmed `/total`
- Enhanced emoji tooltips explaining each credit type

### 5. Total Capacity Formula Fix (v7.9.13)
- **Root Cause**: Used `billing_period_credits_used` (often 0) instead of `total_credits_used_in_billing_period`
- **Fix**: Parse and use correct field

### 6. Topup Credits Parsing (v7.9.9)
- **Fix**: `topup_credits_limit` now correctly parsed from API response

## Files Changed
- `combo.js`, `macro-looping.js`, `Automator.ahk`, `GeneralDefaults.ahk`, `config.ini`, `json-schema.md`

## Principles Established
- **Bar Segment Completeness**: Every credit type in Total Credits formula MUST have a corresponding progress bar segment
- **Formula Documentation**: Credit formulas must be documented in `specs/json-schema.md`
