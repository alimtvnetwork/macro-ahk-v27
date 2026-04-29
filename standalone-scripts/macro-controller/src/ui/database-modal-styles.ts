/**
 * MacroLoop Controller — Database Modal Styles
 *
 * Scoped CSS injection for the database browser modal.
 * Extracted from database-modal.ts during Phase 5 module splitting.
 *
 * @see spec/02-coding-guidelines/01-code-quality-improvement.md — Rule CQ4
 */

import {
  cInputBg,
  cInputBorder,
  cInputFg,
  cNeutral600,
  cPanelBg,
  cPanelBgAlt,
  cPanelText,
  cPrimary,
  cPrimaryBgAL,
  cPrimaryBgAS,
  cPrimaryLight,
  cPrimaryLighter,
  cSectionHeader,
  lModalRadius,
  lModalShadow,
} from '../shared-state';

import { StyleId } from '../types';
const STYLE_ID = StyleId.DbModal;

/** Inject scoped CSS for the database modal (idempotent). */
export function injectDatabaseStyles(): void {
  const isAlreadyInjected = document.getElementById(STYLE_ID) !== null;

  if (isAlreadyInjected) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = STYLE_ID;
  styleElement.textContent = buildStyleSheet();
  document.head.appendChild(styleElement);
}

function buildStyleSheet(): string {
  return buildModalLayoutStyles()
    + buildSidebarStyles()
    + buildContentStyles()
    + buildTableStyles()
    + buildPaginationStyles()
    + buildTabStyles()
    + buildFilterStyles();
}

function buildModalLayoutStyles(): string {
  return `
    .marco-db-modal {
      background: ${cPanelBg};
      border: 1px solid ${cPrimaryBgAL};
      border-radius: ${lModalRadius};
      width: 90%;
      max-width: 820px;
      max-height: 85vh;
      color: ${cPanelText};
      font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      box-shadow: ${lModalShadow};
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .marco-db-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid ${cPrimaryBgAL};
    }
    .marco-db-title {
      font-size: 16px;
      font-weight: 700;
      color: ${cPrimaryLighter};
    }
    .marco-db-close {
      font-size: 18px;
      color: #64748b;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.15s;
      border: none;
      background: none;
    }
    .marco-db-close:hover {
      color: #e2e8f0;
      background: rgba(255,255,255,0.1);
    }
    .marco-db-body {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
  `;
}

function buildSidebarStyles(): string {
  return `
    .marco-db-sidebar {
      width: 180px;
      border-right: 1px solid ${cPrimaryBgAL};
      overflow-y: auto;
      padding: 8px 0;
      flex-shrink: 0;
    }
    .marco-db-sidebar-title {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${cSectionHeader};
      font-weight: 700;
      padding: 8px 12px 4px;
    }
    .marco-db-table-item {
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      color: #94a3b8;
      transition: all 0.12s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .marco-db-table-item:hover {
      background: rgba(255,255,255,0.05);
      color: #e2e8f0;
    }
    .marco-db-table-item.active {
      background: ${cPrimaryBgAS};
      color: ${cPrimaryLight};
      font-weight: 600;
    }
    .marco-db-table-count {
      font-size: 9px;
      color: ${cNeutral600};
      margin-left: auto;
    }
  `;
}

function buildContentStyles(): string {
  return `
    .marco-db-content {
      flex: 1;
      overflow: auto;
      padding: 12px 16px;
      min-width: 0;
    }
    .marco-db-empty {
      color: #64748b;
      font-size: 12px;
      padding: 32px 0;
      text-align: center;
    }
    .marco-db-table-wrapper {
      overflow-x: auto;
    }
    .marco-db-loading {
      color: #64748b;
      font-size: 12px;
      padding: 24px 0;
      text-align: center;
    }
    .marco-db-status-bar {
      padding: 8px 16px;
      border-top: 1px solid ${cPrimaryBgAL};
      font-size: 10px;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 12px;
    }
  `;
}

function buildTableStyles(): string {
  return `
    .marco-db-data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      font-family: monospace;
    }
    .marco-db-data-table th {
      background: ${cPanelBgAlt};
      color: ${cSectionHeader};
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9px;
      letter-spacing: 0.5px;
      padding: 6px 10px;
      border-bottom: 1px solid ${cPrimaryBgAL};
      text-align: left;
      white-space: nowrap;
      position: sticky;
      top: 0;
    }
    .marco-db-data-table td {
      padding: 5px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      color: #cbd5e1;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .marco-db-data-table tr:hover td {
      background: rgba(255,255,255,0.03);
    }
  `;
}

function buildPaginationStyles(): string {
  return `
    .marco-db-pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 11px;
      color: #64748b;
    }
    .marco-db-page-btn {
      padding: 4px 10px;
      border: 1px solid ${cInputBorder};
      border-radius: 4px;
      background: ${cInputBg};
      color: ${cInputFg};
      cursor: pointer;
      font-size: 11px;
      transition: all 0.12s;
    }
    .marco-db-page-btn:hover:not(:disabled) {
      background: ${cPrimaryBgAS};
      border-color: ${cPrimaryBgAL};
    }
    .marco-db-page-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }
  `;
}

function buildTabStyles(): string {
  return `
    .marco-db-tab-bar {
      display: flex;
      border-bottom: 1px solid ${cPrimaryBgAL};
      padding: 0 16px;
    }
    .marco-db-tab {
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }
    .marco-db-tab:hover { color: #94a3b8; }
    .marco-db-tab.active {
      color: ${cPrimaryLight};
      border-bottom-color: ${cPrimary};
    }
  `;
}

// eslint-disable-next-line max-lines-per-function
function buildFilterStyles(): string {
  return `
    .marco-db-filter-bar {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 8px 0;
      flex-wrap: wrap;
    }
    .marco-db-filter-input {
      padding: 5px 8px;
      font-size: 11px;
      background: ${cInputBg};
      border: 1px solid ${cInputBorder};
      color: ${cInputFg};
      border-radius: 4px;
      outline: none;
      flex: 1;
      min-width: 120px;
    }
    .marco-db-filter-input:focus { border-color: ${cPrimary}; }
    .marco-db-filter-select {
      padding: 5px 6px;
      font-size: 11px;
      background: ${cInputBg};
      border: 1px solid ${cInputBorder};
      color: ${cInputFg};
      border-radius: 4px;
      outline: none;
    }
    .marco-db-filter-btn {
      padding: 5px 10px;
      font-size: 11px;
      border: 1px solid ${cInputBorder};
      border-radius: 4px;
      background: ${cInputBg};
      color: ${cInputFg};
      cursor: pointer;
      transition: all 0.12s;
    }
    .marco-db-filter-btn:hover {
      background: ${cPrimaryBgAS};
      border-color: ${cPrimaryBgAL};
    }
    .marco-db-filter-active {
      font-size: 10px;
      color: ${cPrimaryLight};
      background: ${cPrimaryBgAS};
      padding: 2px 8px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .marco-db-filter-clear {
      cursor: pointer;
      font-size: 12px;
      color: #94a3b8;
    }
    .marco-db-filter-clear:hover { color: #f87171; }
  `;
}
