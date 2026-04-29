/**
 * CSV Export tests (v2.223.0) — verifies that:
 *   • CSV_HEADER and rows from buildCsvRow stay column-aligned
 *   • New lifecycle / ratio / export-meta columns are populated correctly
 *   • Status Kind reflects active / past_due / canceled scenarios
 *
 * Tests do NOT trigger downloads — they exercise the module's exported
 * `exportWorkspacesAsCsv` indirectly via assertions on a mocked Blob/anchor
 * pipeline, OR by replicating the row builder via the same shared helpers.
 *
 * For this suite we validate the header + mocked row counts by reading the
 * exported CSV text captured from a stubbed `URL.createObjectURL`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportWorkspacesAsCsv } from '../log-csv-export';
import { loopCreditState } from '../shared-state';
import type { WorkspaceCredit } from '../types';

const MS_PER_DAY = 86_400_000;

/** ISO timestamp `d` whole days before *real* now — keeps tests insensitive to wall-clock drift. */
function isoDaysAgo(d: number): string {
  return new Date(Date.now() - d * MS_PER_DAY).toISOString();
}

function makeWs(overrides: Partial<WorkspaceCredit>): WorkspaceCredit {
  return {
    id: 'ws_csv', name: 'CSV', fullName: 'CSV Workspace',
    dailyFree: 5, dailyUsed: 1, dailyLimit: 5,
    rolloverUsed: 0, rolloverLimit: 0,
    freeGranted: 0, freeRemaining: 0,
    used: 0, limit: 100, topupLimit: 0,
    totalCredits: 100, available: 50, rollover: 0, billingAvailable: 30,
    hasFree: false, totalCreditsUsed: 0,
    subscriptionStatus: 'active', subscriptionStatusChangedAt: '',
    plan: 'pro_1', role: 'owner', tier: 'PRO',
    raw: { membership: { email: 'a@b.com', role: 'owner' } },
    rawApi: {},
    numProjects: 3, gitSyncEnabled: true,
    nextRefillAt: '', billingPeriodEndAt: '',
    createdAt: '2025-01-15T00:00:00Z',
    membershipRole: 'Owner', planType: 'PRO',
    ...overrides,
  };
}

let capturedCsv = '';
let originalBlob: typeof Blob;

beforeEach(() => {
  capturedCsv = '';
  originalBlob = global.Blob;

  // Intercept Blob construction so we capture the CSV text synchronously,
  // before the export function calls URL.createObjectURL / a.click() / revoke.
  // jsdom Blob accepts BlobPart[]; we stringify the first text chunk.
  class CapturingBlob extends originalBlob {
    constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
      super(parts, opts);
      const first = parts && parts[0];
      if (typeof first === 'string') capturedCsv = first;
    }
  }
  vi.stubGlobal('Blob', CapturingBlob);

  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:stub',
    revokeObjectURL: () => { /* no-op */ },
  });

  // Stub anchor click so the real DOM isn't touched.
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreate(tag);
    if (tag === 'a') {
      (el as HTMLAnchorElement).click = (): void => { /* swallow */ };
    }
    return el;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  loopCreditState.perWorkspace = [];
});

function exportAndRead(workspaces: WorkspaceCredit[]): string[] {
  loopCreditState.perWorkspace = workspaces;
  exportWorkspacesAsCsv();
  return capturedCsv.split('\n');
}

describe('CSV export — header / row alignment', () => {
  it('header column count matches each row column count', () => {
    const lines = exportAndRead([
      makeWs({ id: 'a', fullName: 'A' }),
      makeWs({ id: 'b', fullName: 'B', subscriptionStatus: 'past_due', subscriptionStatusChangedAt: isoDaysAgo(3) }),
    ]);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const headerCols = lines[0].split(',').length;
    for (let i = 1; i < lines.length; i++) {
      // Cells may contain quoted commas → split on commas not inside quotes.
      // For our test data we don't use embedded commas, so a plain split works.
      const rowCols = lines[i].split(',').length;
      expect(rowCols, 'row ' + i + ': "' + lines[i] + '"').toBe(headerCols);
    }
  });

  it('header includes the new lifecycle columns', () => {
    const lines = exportAndRead([makeWs({})]);
    const header = lines[0];
    expect(header).toContain('Status Kind');
    expect(header).toContain('Status Label');
    expect(header).toContain('Subscription Status Changed At');
    expect(header).toContain('Days Since Status Change');
    expect(header).toContain('Days To Refill');
    expect(header).toContain('Active Grace Period (days)');
    expect(header).toContain('Active Refill Warning (days)');
    expect(header).toContain('Available % of Total');
    expect(header).toContain('Daily % Used');
    expect(header).toContain('Exported At (Asia/Kuala_Lumpur)');
    expect(header).toContain('Workspace Short Name');
    expect(header).toContain('Git Sync Enabled');
  });
});

describe('CSV export — lifecycle column values', () => {
  it('active workspace reports Status Kind = "normal"', () => {
    const lines = exportAndRead([makeWs({
      id: 'a', fullName: 'Active', subscriptionStatus: 'active',
    })]);
    const headers = lines[0].split(',');
    const cols = lines[1].split(',');
    const idx = headers.indexOf('Status Kind');
    expect(cols[idx]).toBe('normal');
  });

  it('past_due workspace reports Status Kind = "about-to-expire"', () => {
    const lines = exportAndRead([makeWs({
      id: 'p', fullName: 'PastDue',
      subscriptionStatus: 'past_due',
      subscriptionStatusChangedAt: isoDaysAgo(3),
      tier: 'EXPIRED',
    })]);
    const headers = lines[0].split(',');
    const cols = lines[1].split(',');
    expect(cols[headers.indexOf('Status Kind')]).toBe('about-to-expire');
    expect(cols[headers.indexOf('Days Since Status Change')]).toBe('3');
  });

  it('canceled workspace reports Status Kind = "expired-canceled" within grace', () => {
    const lines = exportAndRead([makeWs({
      id: 'c', fullName: 'Canceled',
      subscriptionStatus: 'canceled',
      subscriptionStatusChangedAt: isoDaysAgo(10),  // grace=30
      tier: 'EXPIRED',
    })]);
    const headers = lines[0].split(',');
    const cols = lines[1].split(',');
    expect(cols[headers.indexOf('Status Kind')]).toBe('expired-canceled');
    // Default config grace = 30
    expect(cols[headers.indexOf('Active Grace Period (days)')]).toBe('30');
  });

  it('Available % of Total computed correctly', () => {
    const lines = exportAndRead([makeWs({
      id: 'r', fullName: 'Ratio', available: 25, totalCredits: 100,
    })]);
    const headers = lines[0].split(',');
    const cols = lines[1].split(',');
    expect(cols[headers.indexOf('Available % of Total')]).toBe('25.0');
  });

  it('Exported At column is populated with Malaysia-timezone ISO string', () => {
    const lines = exportAndRead([makeWs({})]);
    const headers = lines[0].split(',');
    const cols = lines[1].split(',');
    const exported = cols[headers.indexOf('Exported At (Asia/Kuala_Lumpur)')];
    expect(exported).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  });
});
