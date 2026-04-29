/**
 * MacroLoop Controller — Database Schema Tab Styles
 *
 * Scoped CSS for the schema editor UI.
 * Extracted from database-schema-tab.ts during Phase 5 module splitting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import {
  cPanelBgAlt,
  cPrimary,
  cPrimaryBgAL,
  cPrimaryBgAS,
  cInputBg,
  cInputBorder,
  cInputFg,
  cSectionHeader,
} from '../shared-state';

import { StyleId } from '../types';
const STYLE_ID = StyleId.DbSchema;

/** Inject scoped CSS for the schema tab (idempotent). */
export function injectSchemaStyles(): void {
  const isAlreadyInjected = document.getElementById(STYLE_ID) !== null;

  if (isAlreadyInjected) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = STYLE_ID;
  styleElement.textContent = buildSchemaStyleSheet();
  document.head.appendChild(styleElement);
}

function buildSchemaStyleSheet(): string {
  return _schemaInputStyles() + _schemaColumnStyles() + _schemaButtonStyles() + _schemaValidationStyles() + _schemaTableListStyles();
}

function _schemaInputStyles(): string {
  return `
    .marco-schema-wrap { padding: 12px 0; }
    .marco-schema-section { margin-bottom: 16px; }
    .marco-schema-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;
      color: ${cSectionHeader}; font-weight: 700; margin-bottom: 6px;
    }
    .marco-schema-input {
      width: 100%; padding: 6px 8px; font-size: 12px;
      background: ${cInputBg}; border: 1px solid ${cInputBorder};
      color: ${cInputFg}; border-radius: 4px; outline: none;
      box-sizing: border-box;
    }
    .marco-schema-input:focus { border-color: ${cPrimary}; }
    .marco-schema-select {
      padding: 5px 6px; font-size: 11px;
      background: ${cInputBg}; border: 1px solid ${cInputBorder};
      color: ${cInputFg}; border-radius: 4px; outline: none;
    }
  `;
}

function _schemaColumnStyles(): string {
  return `
    .marco-schema-col-row {
      display: flex; gap: 6px; align-items: center; margin-bottom: 6px;
      padding: 6px 8px; background: ${cPanelBgAlt}; border-radius: 4px;
      flex-wrap: wrap;
    }
    .marco-schema-col-main { display: flex; gap: 6px; align-items: center; flex: 1; min-width: 300px; }
    .marco-schema-col-extras { display: flex; gap: 6px; align-items: center; width: 100%; margin-top: 4px; }
    .marco-schema-checkbox { width: 14px; height: 14px; cursor: pointer; }
  `;
}

function _schemaButtonStyles(): string {
  return `
    .marco-schema-btn {
      padding: 5px 12px; font-size: 11px; border-radius: 4px; cursor: pointer;
      border: 1px solid ${cInputBorder}; background: ${cInputBg}; color: ${cInputFg};
      transition: all 0.12s;
    }
    .marco-schema-btn:hover { background: ${cPrimaryBgAS}; border-color: ${cPrimaryBgAL}; }
    .marco-schema-btn-primary {
      background: ${cPrimary}; color: #fff; border-color: ${cPrimary};
    }
    .marco-schema-btn-primary:hover { opacity: 0.9; }
    .marco-schema-btn-danger { color: #f87171; border-color: #f87171; }
    .marco-schema-btn-danger:hover { background: rgba(248,113,113,0.15); }
    .marco-schema-btn-sm { padding: 3px 8px; font-size: 10px; }
  `;
}

function _schemaValidationStyles(): string {
  return `
    .marco-schema-val-panel {
      margin: 4px 0 4px 24px; padding: 8px 10px;
      background: rgba(0,0,0,0.2); border-radius: 4px;
      border: 1px solid ${cPrimaryBgAL};
    }
    .marco-schema-val-row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
    .marco-schema-val-label { font-size: 10px; color: #94a3b8; min-width: 70px; }
    .marco-schema-val-input {
      flex: 1; padding: 4px 6px; font-size: 11px;
      background: ${cInputBg}; border: 1px solid ${cInputBorder};
      color: ${cInputFg}; border-radius: 3px; outline: none;
    }
    .marco-schema-test-result {
      font-size: 11px; padding: 4px 8px; border-radius: 3px; margin-top: 4px;
    }
    .marco-schema-test-pass { background: rgba(34,197,94,0.15); color: #4ade80; }
    .marco-schema-test-fail { background: rgba(248,113,113,0.15); color: #f87171; }
    .marco-schema-fk-panel {
      margin: 4px 0 4px 24px; padding: 8px 10px;
      background: rgba(0,0,0,0.2); border-radius: 4px;
      border: 1px solid ${cPrimaryBgAL};
    }
    .marco-schema-fk-row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
  `;
}

function _schemaTableListStyles(): string {
  return `
    .marco-schema-table-list {
      margin-top: 12px;
    }
    .marco-schema-table-entry {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.04);
      font-size: 12px; color: #cbd5e1;
    }
    .marco-schema-table-entry:hover { background: rgba(255,255,255,0.03); }
    .marco-schema-table-cols {
      font-size: 10px; color: #64748b; margin-top: 2px;
    }
    .marco-schema-msg {
      font-size: 11px; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px;
    }
    .marco-schema-msg-ok { background: rgba(34,197,94,0.12); color: #4ade80; }
    .marco-schema-msg-err { background: rgba(248,113,113,0.12); color: #f87171; }
  `;
}
