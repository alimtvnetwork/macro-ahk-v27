/**
 * MacroLoop Controller — Bulk Rename Dialog
 * Phase 5A: Extracted from ws-selection-ui.ts
 * Phase 7:  Persistent rename presets via project-scoped IndexedDB
 *
 * Orchestrator: builds the floating draggable dialog, preset selector,
 * preview list, delay slider, and apply/stop/cancel/save buttons.
 *
 * Sub-modules: bulk-rename-fields, rename-preset-store.
 *
 * @see spec/21-app/02-features/macro-controller/ts-migration-v2/05-module-splitting.md
 * @see spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md
 */

import type {
  WorkspaceCredit,
  BulkRenameResults,
  DraggableElement,
} from '../types';
import {
  loopCreditState,
  getLoopWsCheckedIds,
  cPanelBg,
  cPrimary,
  cPrimaryLight,
  cPrimaryLighter,
  cPrimaryBgA,
  cPrimaryBorderA,
} from '../shared-state';
import { log } from '../logging';
import { logError } from '../error-utils';
import { showToast } from '../toast';
import {
  applyRenameTemplate,
  bulkRenameWorkspaces,
  cancelRename,
  getRenameAvgOpMs,
  getRenameDelayMs,
  getRenamePresetStore,
  createDefaultPreset,
  setRenameDelayMs,
  type RenamePreset,
} from '../workspace-rename';
import { populateLoopWorkspaceDropdown } from '../ws-list-renderer';
import {
  formatEta,
  buildInputRow,
  buildTemplateRow,
  buildStartNumInput,
  buildTokenRow,
  buildPresetRow,
} from './bulk-rename-fields';

/**
 * Render the floating bulk rename dialog for selected workspaces.
 * Loads saved presets from IndexedDB and auto-populates fields.
 */
export function renderBulkRenameDialog(): void {
  removeBulkRenameDialog();
  const checkedIds = Object.keys(getLoopWsCheckedIds());
  if (checkedIds.length === 0) {
    log('[Rename] No workspaces selected', 'warn');
    return;
  }

  const perWs = loopCreditState.perWorkspace || [];
  const selected: WorkspaceCredit[] = [];
  for (const ws of perWs) {
    if (getLoopWsCheckedIds()[ws.id]) { selected.push(ws); }
  }

  const panel = _createRenamePanel();
  const titleBar = _createRenameTitleBar(panel, selected.length);
  panel.appendChild(titleBar);

  const body = document.createElement('div');
  body.style.cssText = 'padding:10px;';

  // Build inputs first, then async-load presets
  const inputsResult = _buildRenameInputs(body, selected);
  const btnRow = _buildRenameButtons(body, selected, inputsResult);

  panel.appendChild(body);
  panel.appendChild(btnRow);
  document.body.appendChild(panel);

  // Async: load presets and insert preset row at top of body
  _initPresetUi(body, inputsResult).catch(function (err) {
    logError('Rename', 'Preset UI init failed: ' + String(err));
  });
}

// ── Current active preset name (panel-scoped) ──
let _activePresetName = 'Default';

// ── Read current UI values into a RenamePreset ──
function _readUiToPreset(inputs: RenameInputsResult): RenamePreset {
  return {
    name: _activePresetName,
    template: inputs.tmplRow.input.value,
    prefix: inputs.prefixRow.input.value,
    prefixEnabled: inputs.prefixRow.cb ? inputs.prefixRow.cb.checked : false,
    suffix: inputs.suffixRow.input.value,
    suffixEnabled: inputs.suffixRow.cb ? inputs.suffixRow.cb.checked : false,
    startDollar: inputs.getStartNums().dollar,
    startHash: inputs.getStartNums().hash,
    startStar: inputs.getStartNums().star,
    delayMs: getRenameDelayMs(),
    createdAt: 0,
    updatedAt: Date.now(),
  };
}

// ── Populate UI fields from a preset ──
function _populateUiFromPreset(preset: RenamePreset, inputs: RenameInputsResult): void {
  inputs.tmplRow.input.value = preset.template || '';
  inputs.prefixRow.input.value = preset.prefix || '';
  if (inputs.prefixRow.cb) { inputs.prefixRow.cb.checked = !!preset.prefixEnabled; }
  inputs.suffixRow.input.value = preset.suffix || '';
  if (inputs.suffixRow.cb) { inputs.suffixRow.cb.checked = !!preset.suffixEnabled; }
  if (preset.delayMs > 0) {
    setRenameDelayMs(preset.delayMs);
    const slider = document.querySelector('#ahk-loop-rename-dialog input[type="range"]') as HTMLInputElement | null;
    if (slider) {
      slider.value = String(preset.delayMs);
      slider.dispatchEvent(new Event('input'));
    }
  }
  // v2.189.0: hydrate per-variable start numbers from IndexedDB BEFORE
  // updatePreview() so the variable-detection re-render uses the loaded
  // values instead of falling back to 1,1,1.
  inputs.setStartNums({
    dollar: typeof preset.startDollar === 'number' ? preset.startDollar : 1,
    hash:   typeof preset.startHash   === 'number' ? preset.startHash   : 1,
    star:   typeof preset.startStar   === 'number' ? preset.startStar   : 1,
  });
  // v2.191.0: Clear any stale start-number inputs left in the DOM from a
  // previous preset. Without this, _snapshotStartNumInputsInto() runs on the
  // first updatePreview() tick and overwrites the freshly hydrated values
  // with whatever the previous preset's inputs still display.
  const staleStartNums = document.getElementById('rename-start-nums');
  if (staleStartNums) { staleStartNums.innerHTML = ''; }
  inputs.updatePreview();
  inputs.updateStaticEta();
}

// ── Auto-save current config ──
async function _autoSave(inputs: RenameInputsResult): Promise<void> {
  try {
    const store = getRenamePresetStore();
    const preset = _readUiToPreset(inputs);
    await store.savePreset(_activePresetName, preset);
  } catch {
    // Silent — auto-save is best-effort
  }
}

// ── Clone preset (v2.195.0) ──
// Asks for a new name, deep-copies the source preset's values under that
// name, registers it in the dropdown, and switches the dialog to it.
function _cloneActivePreset(
  sourceName: string,
  store: ReturnType<typeof getRenamePresetStore>,
  inputs: RenameInputsResult,
  presetRow: { select: HTMLSelectElement },
): void {
  const suggested = sourceName + ' (copy)';
  const rawName = prompt('Clone "' + sourceName + '" as:', suggested);
  if (!rawName || !rawName.trim()) { return; }
  const newName = rawName.trim();
  if (newName === sourceName) {
    showToast('Pick a different name to clone', 'warn');
    return;
  }

  store.loadPreset(sourceName).then(function (src) {
    if (!src) {
      showToast('Source preset "' + sourceName + '" not found', 'warn');
      return;
    }
    const cloned: RenamePreset = { ...src, name: newName, createdAt: 0, updatedAt: Date.now() };
    return store.savePreset(newName, cloned).then(function () {
      _activePresetName = newName;
      store.setActivePresetName(newName);
      const opt = document.createElement('option');
      opt.value = newName;
      opt.textContent = newName;
      const sel = presetRow.select;
      const newPlaceholder = sel.querySelector('option[value="__new__"]');
      sel.insertBefore(opt, newPlaceholder);
      sel.value = newName;
      _populateUiFromPreset(cloned, inputs);
      showToast('Cloned "' + sourceName + '" → "' + newName + '"', 'success');
    });
  }).catch(function (err: unknown) {
    logError('Rename', 'Clone preset failed: ' + String(err));
    showToast('Clone failed', 'error');
  });
}

// ── Init preset UI (async) ──
// eslint-disable-next-line max-lines-per-function -- preset CRUD orchestration with async store + DOM wiring
async function _initPresetUi(body: HTMLElement, inputs: RenameInputsResult): Promise<void> {
  const store = getRenamePresetStore();
  const presetNames = await store.listPresets();
  _activePresetName = await store.getActivePresetName();

  // Load and populate active preset
  const activePreset = await store.loadPreset(_activePresetName);
  if (activePreset) {
    _populateUiFromPreset(activePreset, inputs);
  }

  // Build preset row and insert at top of body
  const presetRow = buildPresetRow(
    presetNames,
    _activePresetName,
    // onSwitch
    function (name: string) {
      // v2.149.0: persist edits to the previously-active preset BEFORE
      // loading the new one — otherwise unsaved field changes are silently lost.
      const previousName = _activePresetName;
      const previousPreset = _readUiToPreset(inputs);
      store.savePreset(previousName, previousPreset)
        .catch(function () { /* best-effort — never block switch */ })
        .finally(function () {
          _activePresetName = name;
          store.setActivePresetName(name);
          store.loadPreset(name).then(function (p) {
            if (p) { _populateUiFromPreset(p, inputs); }
          });
        });
    },
    // onNew
    function () {
      const name = prompt('Enter preset name:');
      if (!name || !name.trim()) { return; }
      const trimmed = name.trim();
      _activePresetName = trimmed;
      const newPreset = createDefaultPreset();
      newPreset.name = trimmed;
      store.savePreset(trimmed, newPreset).then(function () {
        store.setActivePresetName(trimmed);
        // Add to dropdown
        const opt = document.createElement('option');
        opt.value = trimmed;
        opt.textContent = trimmed;
        const sel = presetRow.select;
        sel.insertBefore(opt, sel.querySelector('option[value="__new__"]'));
        sel.value = trimmed;
        _populateUiFromPreset(newPreset, inputs);
        showToast('Created preset "' + trimmed + '"', 'success');
      });
    },
    // onDelete
    function (name: string) {
      if (name === 'Default') {
        showToast('Cannot delete Default preset', 'warn');

        return;
      }
      if (!confirm('Delete preset "' + name + '"?')) { return; }
      store.deletePreset(name).then(function () {
        // Remove from dropdown
        const opt = presetRow.select.querySelector('option[value="' + name.replace(/"/g, '\\"') + '"]');
        if (opt) { opt.remove(); }
        _activePresetName = 'Default';
        presetRow.select.value = 'Default';
        store.loadPreset('Default').then(function (p) {
          if (p) { _populateUiFromPreset(p, inputs); }
        });
        showToast('Deleted preset "' + name + '"', 'info');
      });
    },
    // onSave
    function () {
      const preset = _readUiToPreset(inputs);
      store.savePreset(_activePresetName, preset).then(function () {
        showToast('Saved preset "' + _activePresetName + '"', 'success');
      });
    },
    // onClone (v2.195.0): duplicate the selected preset under a new name.
    // Lets users fork an existing pattern (Default or otherwise) instead of
    // hand-copying every field into a freshly-created preset.
    function (sourceName: string) {
      _cloneActivePreset(sourceName, store, inputs, presetRow);
    },
  );

  body.insertBefore(presetRow.row, body.firstChild);
}

// ── Panel Shell ──
function _createRenamePanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = 'ahk-loop-rename-dialog';
  panel.style.cssText =
    'position:fixed;top:80px;right:40px;z-index:100002;background:' + cPanelBg +
    ';border:1px solid ' + cPrimary +
    ';border-radius:8px;padding:0;min-width:420px;max-width:520px;box-shadow:0 8px 32px rgba(0,0,0,.6);font-family:monospace;resize:both;overflow:hidden;';
  return panel;
}

// ── Title Bar + Drag ──
function _createRenameTitleBar(panel: HTMLElement, count: number): HTMLElement {
  const titleBar = document.createElement('div');
  titleBar.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:' + cPrimaryBgA +
    ';cursor:grab;user-select:none;border-bottom:1px solid rgba(124,58,237,0.3);';

  const titleText = document.createElement('span');
  titleText.style.cssText = 'font-size:11px;color:' + cPrimaryLighter + ';font-weight:700;';
  titleText.textContent = '✏️ Bulk Rename — ' + count + ' workspace' + (count > 1 ? 's' : '');

  const closeBtnTitle = document.createElement('span');
  closeBtnTitle.style.cssText = 'cursor:pointer;color:#94a3b8;font-size:14px;padding:0 4px;';
  closeBtnTitle.textContent = '✕';
  closeBtnTitle.onclick = function () { if (_currentInputs) { _autoSave(_currentInputs); } removeBulkRenameDialog(); };
  titleBar.appendChild(titleText);
  titleBar.appendChild(closeBtnTitle);

  let isDragging = false, dragOffX = 0, dragOffY = 0;
  const onDragMouseDown = function(e: MouseEvent) {
    if (e.target === closeBtnTitle) return;
    isDragging = true;
    dragOffX = e.clientX - panel.getBoundingClientRect().left;
    dragOffY = e.clientY - panel.getBoundingClientRect().top;
    titleBar.style.cursor = 'grabbing';
    e.preventDefault();
  };
  const onDragMouseMove = function(e: MouseEvent) {
    if (!isDragging) return;
    panel.style.left = (e.clientX - dragOffX) + 'px';
    panel.style.top = (e.clientY - dragOffY) + 'px';
    panel.style.right = 'auto';
  };
  const onDragMouseUp = function() { isDragging = false; titleBar.style.cursor = 'grab'; };
  titleBar.addEventListener('mousedown', onDragMouseDown);
  document.addEventListener('mousemove', onDragMouseMove);
  document.addEventListener('mouseup', onDragMouseUp);
  (panel as DraggableElement).__cleanupDrag = function () {
    document.removeEventListener('mousemove', onDragMouseMove);
    document.removeEventListener('mouseup', onDragMouseUp);
  };

  return titleBar;
}

// ── Rename Inputs (prefix, template, suffix, vars, delay, preview) ──
interface StartNums { dollar: number; hash: number; star: number }

interface RenameInputsResult {
  prefixRow: ReturnType<typeof buildInputRow>;
  tmplRow: ReturnType<typeof buildTemplateRow>;
  suffixRow: ReturnType<typeof buildInputRow>;
  getStartNums: () => StartNums;
  setStartNums: (partial: Partial<StartNums>) => void;
  updatePreview: () => void;
  updateStaticEta: () => void;
  etaRow: HTMLElement;
}

function _buildRenameInputs(body: HTMLElement, selected: WorkspaceCredit[]): RenameInputsResult {
  const prefixRow = buildInputRow('Prefix', 'rename-prefix', 'e.g. Team-', true);
  body.appendChild(prefixRow.row);
  const tmplRow = buildTemplateRow();
  body.appendChild(tmplRow.row);
  const suffixRow = buildInputRow('Suffix', 'rename-suffix', 'e.g.  Dev', true);
  body.appendChild(suffixRow.row);

  // v2.195.0: Capture the container directly from the builder. Previously
  // we did document.getElementById('rename-start-nums') here, but this code
  // runs BEFORE the dialog body is mounted into the document (see
  // renderBulkRenameDialog), so getElementById returned null and the
  // fallback orphan div silently swallowed every $$$/###/** placeholder
  // detection. The variable inputs never appeared and start numbers were
  // permanently locked to 1.
  const startNumsContainer = _appendVarHintAndStartNums(body);

  // v2.189.0: mutable closure-scoped state replaces dead `const` locals.
  // Preserves user-typed start numbers across re-renders AND across keystrokes
  // in other fields. Lets _populateUiFromPreset hydrate from IndexedDB.
  const startNums: StartNums = { dollar: 1, hash: 1, star: 1 };
  const getStartNums = function (): StartNums {
    return { dollar: startNums.dollar, hash: startNums.hash, star: startNums.star };
  };
  const setStartNums = function (partial: Partial<StartNums>): void {
    if (typeof partial.dollar === 'number' && Number.isFinite(partial.dollar)) {
      startNums.dollar = Math.max(0, Math.floor(partial.dollar));
    }
    if (typeof partial.hash === 'number' && Number.isFinite(partial.hash)) {
      startNums.hash = Math.max(0, Math.floor(partial.hash));
    }
    if (typeof partial.star === 'number' && Number.isFinite(partial.star)) {
      startNums.star = Math.max(0, Math.floor(partial.star));
    }
  };

  const previewList = _appendPreviewSection(body);

  const updatePreview = function (): void {
    _detectVarsAndRenderStarts(startNumsContainer, tmplRow, prefixRow, suffixRow, startNums, function () { updatePreview(); });
    const template = tmplRow.input.value;
    const prefix = prefixRow.cb!.checked ? prefixRow.input.value : '';
    const suffix = suffixRow.cb!.checked ? suffixRow.input.value : '';
    const starts: Record<string, number> = { ...getStartNums() };
    let html = '';
    for (const [j, ws] of selected.entries()) {
      const origName = ws.fullName || ws.name || '';
      const newName = applyRenameTemplate(template, prefix, suffix, starts, j, origName);
      html += '<div style="display:flex;gap:6px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05);"><span style="color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + origName.replace(/"/g, '&quot;') + '">' + origName + '</span><span style="color:#64748b;">→</span><span style="color:#67e8f9;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;" title="' + newName.replace(/"/g, '&quot;') + '">' + newName + '</span></div>';
    }
    previewList.innerHTML = html || '<div style="color:#64748b;">No changes</div>';
  };

  tmplRow.input.oninput = updatePreview;
  prefixRow.input.oninput = updatePreview;
  suffixRow.input.oninput = updatePreview;
  prefixRow.cb!.onchange = updatePreview;
  suffixRow.cb!.onchange = updatePreview;
  updatePreview();

  const { etaRow, updateStaticEta } = _appendDelayAndEta(body, selected.length);

  return { prefixRow, tmplRow, suffixRow, getStartNums, setStartNums, updatePreview, updateStaticEta, etaRow };
}

function _appendVarHintAndStartNums(body: HTMLElement): HTMLElement {
  const varHint = document.createElement('div');
  varHint.style.cssText = 'font-size:8px;color:#64748b;margin-bottom:6px;padding:2px 4px;background:rgba(0,0,0,.2);border-radius:2px;';
  varHint.innerHTML = 'Variables: <span style="color:#facc15">$$$</span> <span style="color:' + cPrimaryLight + '">###</span> <span style="color:#34d399">***</span> — zero-padded by count ($$$ → 001). Works in prefix, template, suffix.';
  body.appendChild(varHint);

  const startNumsContainer = document.createElement('div');
  startNumsContainer.id = 'rename-start-nums';
  startNumsContainer.style.cssText = 'margin-bottom:6px;';
  body.appendChild(startNumsContainer);
  return startNumsContainer;
}

function _appendPreviewSection(body: HTMLElement): HTMLElement {
  body.appendChild(buildTokenRow());
  const previewLabel = document.createElement('div');
  previewLabel.style.cssText = 'font-size:9px;color:#94a3b8;margin-bottom:3px;';
  previewLabel.textContent = 'Preview:';
  body.appendChild(previewLabel);
  const previewList = document.createElement('div');
  previewList.id = 'rename-preview-list';
  previewList.style.cssText = 'max-height:150px;overflow-y:auto;border:1px solid ' + cPrimaryBorderA + ';border-radius:3px;background:rgba(0,0,0,.3);padding:4px;margin-bottom:8px;font-size:9px;';
  body.appendChild(previewList);
  return previewList;
}

// v2.189.0: snapshot live input values BEFORE re-rendering so the user's
// typed start numbers survive every keystroke in prefix/template/suffix.
// After re-render, attach `oninput` handlers that write back into `startNums`
// and trigger a fresh preview.
function _detectVarsAndRenderStarts(
  container: HTMLElement,
  tmplRow: RenameInputsResult['tmplRow'],
  prefixRow: RenameInputsResult['prefixRow'],
  suffixRow: RenameInputsResult['suffixRow'],
  startNums: StartNums,
  updatePreview: () => void,
): void {
  // 1. Snapshot any currently-rendered inputs into the closure state so we
  //    don't blow away the user's typed values during the innerHTML wipe.
  _snapshotStartNumInputsInto(startNums);

  const allText = tmplRow.input.value
    + (prefixRow.cb?.checked ? prefixRow.input.value : '')
    + (suffixRow.cb?.checked ? suffixRow.input.value : '');
  const hasDollar = /\$+/.test(allText);
  const hasHash = /#+/.test(allText);
  const hasStar = /\*{2,}/.test(allText);

  let html = '';
  if (hasDollar || hasHash || hasStar) {
    html += '<div style="font-size:8px;color:#94a3b8;margin-bottom:3px;">Start Numbers:</div><div style="display:flex;gap:8px;flex-wrap:wrap;">';
    if (hasDollar) html += buildStartNumInput('$', 'rename-start-dollar', startNums.dollar, '#facc15');
    if (hasHash) html += buildStartNumInput('#', 'rename-start-hash', startNums.hash, cPrimaryLight);
    if (hasStar) html += buildStartNumInput('**', 'rename-start-star', startNums.star, '#34d399');
    html += '</div>';
  }
  container.innerHTML = html;

  // 2. Re-attach live handlers (innerHTML wiped them).
  _wireStartNumInput('rename-start-dollar', 'dollar', startNums, updatePreview);
  _wireStartNumInput('rename-start-hash', 'hash', startNums, updatePreview);
  _wireStartNumInput('rename-start-star', 'star', startNums, updatePreview);
}

function _snapshotStartNumInputsInto(startNums: StartNums): void {
  const dollarEl = document.getElementById('rename-start-dollar') as HTMLInputElement | null;
  const hashEl = document.getElementById('rename-start-hash') as HTMLInputElement | null;
  const starEl = document.getElementById('rename-start-star') as HTMLInputElement | null;
  if (dollarEl) {
    const n = parseInt(dollarEl.value, 10);
    if (Number.isFinite(n) && n >= 0) { startNums.dollar = n; }
  }
  if (hashEl) {
    const n = parseInt(hashEl.value, 10);
    if (Number.isFinite(n) && n >= 0) { startNums.hash = n; }
  }
  if (starEl) {
    const n = parseInt(starEl.value, 10);
    if (Number.isFinite(n) && n >= 0) { startNums.star = n; }
  }
}

function _wireStartNumInput(
  id: string,
  key: 'dollar' | 'hash' | 'star',
  startNums: StartNums,
  updatePreview: () => void,
): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) { return; }
  // v2.192.0: clamp on every keystroke so preview + persistence never see
  // NaN, negatives, or decimals. Empty string is treated as 0 in-memory but
  // not echoed back during typing — the user keeps typing freely. On blur
  // the field is reflowed to the canonical integer.
  el.oninput = function () {
    const raw = parseInt(el.value, 10);
    const clamped = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    startNums[key] = clamped;
    updatePreview();
  };
  el.onblur = function () {
    const raw = parseInt(el.value, 10);
    const clamped = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    startNums[key] = clamped;
    el.value = String(clamped);
  };
}

function _appendDelayAndEta(body: HTMLElement, count: number): { delaySlider: HTMLInputElement; etaRow: HTMLElement; updateStaticEta: () => void } {
  const delaySlider = document.createElement('input') as HTMLInputElement;
  delaySlider.type = 'range'; delaySlider.min = '100'; delaySlider.max = '10000'; delaySlider.step = '100';
  delaySlider.value = String(getRenameDelayMs());
  delaySlider.style.cssText = 'flex:1;accent-color:' + cPrimaryLight + ';height:4px;';
  const delayVal = document.createElement('span');
  delayVal.style.cssText = 'font-size:9px;color:#22d3ee;min-width:42px;text-align:right;';
  delayVal.textContent = getRenameDelayMs() + 'ms';
  const delayRow = document.createElement('div');
  delayRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const delayLabel = document.createElement('span');
  delayLabel.style.cssText = 'font-size:9px;color:#94a3b8;min-width:52px;';
  delayLabel.textContent = 'Delay (ms)';
  delayRow.appendChild(delayLabel);
  delayRow.appendChild(delaySlider);
  delayRow.appendChild(delayVal);
  body.appendChild(delayRow);

  const etaRow = document.createElement('div');
  etaRow.id = 'rename-eta-row';
  etaRow.style.cssText = 'font-size:8px;color:#64748b;margin-bottom:6px;display:none;';
  body.appendChild(etaRow);

  const updateStaticEta = function(): void {
    if (count > 0) {
      const etaMs = count * getRenameDelayMs();
      etaRow.style.display = 'block';
      etaRow.innerHTML = '⏱ Est. total: <span style="color:#94a3b8;">' + formatEta(etaMs) + '</span> for ' + count + ' items @ ' + getRenameDelayMs() + 'ms delay';
    }
  };

  delaySlider.oninput = function () {
    setRenameDelayMs(parseInt(delaySlider.value, 10));
    delayVal.textContent = getRenameDelayMs() + 'ms';
    updateStaticEta();
  };
  updateStaticEta();

  return { delaySlider, etaRow, updateStaticEta };
}
// ── Module-scoped inputs ref for auto-save on close ──
let _currentInputs: RenameInputsResult | null = null;

function _buildRenameButtons(
  body: HTMLElement,
  selected: WorkspaceCredit[],
  inputs: RenameInputsResult,
): HTMLElement {
  _currentInputs = inputs;
  const { prefixRow, tmplRow, suffixRow, getStartNums, etaRow } = inputs;
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;padding:8px 10px;border-top:1px solid rgba(124,58,237,0.2);';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:4px 12px;background:rgba(100,116,139,0.3);color:#94a3b8;border:1px solid #475569;border-radius:4px;font-size:10px;cursor:pointer;';
  cancelBtn.onclick = function () { _autoSave(inputs); removeBulkRenameDialog(); };

  const stopBtn = document.createElement('button');
  stopBtn.textContent = '⏹ Stop';
  stopBtn.id = 'rename-stop-btn';
  stopBtn.style.cssText = 'display:none;padding:4px 12px;background:rgba(239,68,68,0.3);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;';
  stopBtn.onclick = function () { cancelRename(); log('[Rename] Stop requested by user', 'warn'); };

  const applyBtn = document.createElement('button');
  applyBtn.id = 'ahk-loop-rename-apply';
  applyBtn.textContent = '✅ Apply';
  applyBtn.style.cssText = 'padding:4px 12px;background:#059669;color:#fff;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;';
  applyBtn.onclick = function () {
    _autoSave(inputs);
    _executeRenameApply(selected, tmplRow, prefixRow, suffixRow, getStartNums, applyBtn, stopBtn, cancelBtn, etaRow);
  };

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(stopBtn);
  btnRow.appendChild(applyBtn);
  body.appendChild(btnRow);

  return btnRow;
}

function _executeRenameApply(
  selected: WorkspaceCredit[], tmplRow: RenameInputsResult['tmplRow'], prefixRow: RenameInputsResult['prefixRow'], suffixRow: RenameInputsResult['suffixRow'],
  getStartNums: () => { dollar: number; hash: number; star: number },
  applyBtn: HTMLElement, stopBtn: HTMLElement, cancelBtn: HTMLElement, etaRow: HTMLElement,
): void {
  const template = tmplRow.input.value;
  const prefix = prefixRow.cb!.checked ? prefixRow.input.value : '';
  const suffix = suffixRow.cb!.checked ? suffixRow.input.value : '';
  const starts = getStartNums();
  if (!template && !prefix && !suffix) { log('[Rename] Nothing to rename — provide template, prefix, or suffix', 'warn'); return; }
  const entries: Array<{ wsId: string; oldName: string; newName: string }> = [];
  for (const [j, ws] of selected.entries()) {
    const origName = ws.fullName || ws.name || '';
    const newName = applyRenameTemplate(template, prefix, suffix, starts, j, origName);
    if (!newName.trim()) { continue; }
    entries.push({ wsId: ws.id, oldName: origName, newName });
  }
  if (entries.length === 0) { log('[Rename] All names empty — cancelled', 'warn'); return; }
  (applyBtn as HTMLButtonElement).disabled = true;
  applyBtn.textContent = 'Renaming... 0/' + entries.length;
  applyBtn.style.background = '#64748b';
  stopBtn.style.display = 'inline-block';
  cancelBtn.style.display = 'none';

  const updateEta = function(completed: number, total: number): void {
    const remaining = total - completed;
    if (remaining <= 0) { etaRow.style.display = 'none'; return; }
    const perOpMs = getRenameAvgOpMs() > 0 ? getRenameAvgOpMs() : getRenameDelayMs();
    const etaMs = remaining * perOpMs;
    const avgLabel = getRenameAvgOpMs() > 0 ? ' (avg ' + getRenameAvgOpMs() + 'ms/op)' : ' (est. ' + getRenameDelayMs() + 'ms/op)';
    etaRow.style.display = 'block';
    etaRow.innerHTML = '⏱ ETA: <span style="color:#22d3ee;">' + formatEta(etaMs) + '</span> remaining — ' + remaining + ' items' + avgLabel;
  };

  bulkRenameWorkspaces(entries, function (results: BulkRenameResults, done: boolean) {
    if (done) {
      handleRenameDone(results, applyBtn, stopBtn, cancelBtn, etaRow);
    } else {
      handleRenameProgress(results, applyBtn, updateEta);
    }
  });
}

function handleRenameDone(
  results: BulkRenameResults,
  applyBtn: HTMLElement,
  stopBtn: HTMLElement,
  cancelBtn: HTMLElement,
  etaRow: HTMLElement,
): void {
  const statusText = results.cancelled
    ? '⏹ Stopped: ' + results.success + '/' + results.total
    : '✅ ' + results.success + '/' + results.total + (results.failed > 0 ? ' (' + results.failed + ' failed)' : ' done');
  applyBtn.textContent = statusText;
  applyBtn.style.background = results.cancelled || results.failed > 0 ? '#d97706' : '#059669';
  stopBtn.style.display = 'none';
  etaRow.style.display = 'none';
  setTimeout(function () {
    (applyBtn as HTMLButtonElement).disabled = false;
    applyBtn.textContent = '✅ Apply';
    applyBtn.style.background = '#059669';
    cancelBtn.style.display = 'inline-block';
    populateLoopWorkspaceDropdown();
  }, 2000);
}

function handleRenameProgress(
  results: BulkRenameResults,
  applyBtn: HTMLElement,
  updateEta: (completed: number, total: number) => void,
): void {
  const completed = results.success + results.failed;
  applyBtn.textContent = 'Renaming... ' + completed + '/' + results.total + (results.success > 0 ? ' ✅' + results.success : '') + (results.failed > 0 ? ' ❌' + results.failed : '');
  updateEta(completed, results.total);
}

/**
 * Remove bulk rename dialog and cancel any in-progress rename.
 */
export function removeBulkRenameDialog(): void {
  cancelRename();
  _currentInputs = null;
  const d = document.getElementById('ahk-loop-rename-dialog');
  if (d) {
    if (typeof (d as DraggableElement).__cleanupDrag === 'function') {
      (d as DraggableElement).__cleanupDrag!();
    }
    d.remove();
  }
}
