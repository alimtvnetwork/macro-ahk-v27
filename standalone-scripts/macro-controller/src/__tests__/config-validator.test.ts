/**
 * Tests for V2 Phase 05 — JSON Config Pipeline.
 * Verifies deep-merge, schema-version warnings, and type-mismatch handling.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateConfig,
  validateTheme,
  drainValidationWarnings,
} from '../config-validator';

beforeEach(() => {
  drainValidationWarnings();
});

describe('validateConfig', () => {
  it('returns full defaults when raw is not an object', () => {
    const cfg = validateConfig(null);
    expect(cfg.macroLoop?.creditBarWidthPx).toBe(160);
    expect(drainValidationWarnings()).toContain(
      'Config: received non-object — using all defaults',
    );
  });

  it('deep-merges user config over defaults', () => {
    const cfg = validateConfig({
      macroLoop: { creditBarWidthPx: 240, timing: { loopIntervalMs: 5000 } },
    });
    expect(cfg.macroLoop?.creditBarWidthPx).toBe(240);
    expect(cfg.macroLoop?.timing?.loopIntervalMs).toBe(5000);
    // Defaults preserved for unspecified keys
    expect(cfg.macroLoop?.timing?.countdownIntervalMs).toBe(1000);
  });

  it('warns on newer schemaVersion', () => {
    validateConfig({ schemaVersion: 99 });
    const warnings = drainValidationWarnings();
    expect(warnings.some(w => w.includes('schemaVersion 99'))).toBe(true);
  });

  it('drops bad-typed top-level fields and warns', () => {
    const cfg = validateConfig({ macroLoop: 'not-an-object' });
    expect(typeof cfg.macroLoop).toBe('object');
    const warnings = drainValidationWarnings();
    expect(warnings.some(w => w.includes('macroLoop'))).toBe(true);
  });
});

describe('validateTheme', () => {
  it('returns defaults when raw is missing', () => {
    const theme = validateTheme(undefined);
    expect(theme.activePreset).toBe('dark');
    expect(theme.presets?.dark).toBeDefined();
  });

  it('falls back to dark when activePreset is unknown', () => {
    const theme = validateTheme({ activePreset: 'rainbow' });
    expect(theme.activePreset).toBe('dark');
    const warnings = drainValidationWarnings();
    expect(warnings.some(w => w.includes('rainbow'))).toBe(true);
  });

  it('preserves user-supplied colors via deep merge', () => {
    const theme = validateTheme({
      presets: { dark: { colors: { primary: { base: '#ff0000' } } } },
    });
    expect(theme.presets?.dark?.colors?.primary?.base).toBe('#ff0000');
    // Default sibling colors preserved
    expect(theme.presets?.dark?.colors?.status?.success).toBe('#4ec9b0');
  });
});
