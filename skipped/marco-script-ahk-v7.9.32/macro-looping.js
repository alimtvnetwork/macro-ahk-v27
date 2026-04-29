// ============================================
// MacroLoop Controller
// Version from config.ini: __SCRIPT_VERSION__
// ============================================

(function() {
  'use strict';

  var FILE_NAME = 'macro-looping.js';
  var VERSION = '__SCRIPT_VERSION__';

  // === Domain Guard: Prevent injection into DevTools or non-page contexts ===
  var currentHostname = window.location.hostname || '(empty)';
  var currentHref = window.location.href || '(empty)';
  var isPageContext = (
    currentHostname.indexOf('lovable.dev') !== -1 ||
    currentHostname.indexOf('lovable.app') !== -1 ||
    currentHostname === 'localhost'
  );
  if (!isPageContext) {
    console.warn(
      '[MacroLoop] DOMAIN GUARD ABORT (line ~21)\n' +
      '  hostname: ' + currentHostname + '\n' +
      '  href: ' + currentHref + '\n' +
      '  expected: lovable.dev | lovable.app | localhost\n' +
      '  cause: Script executed in DevTools context instead of page context.\n' +
      '  UI will NOT be injected here.'
    );
    return;
  }

  // ============================================
  // IDs from config.ini (replaced by AHK)
  // ============================================
  var IDS = {
    SCRIPT_MARKER: '__LOOP_SCRIPT_MARKER_ID__',
    CONTAINER: '__LOOP_CONTAINER_ID__',
    STATUS: '__LOOP_STATUS_ID__',
    START_BTN: '__LOOP_START_BTN_ID__',
    STOP_BTN: '__LOOP_STOP_BTN_ID__',
    UP_BTN: '__LOOP_UP_BTN_ID__',
    DOWN_BTN: '__LOOP_DOWN_BTN_ID__',
    RECORD_INDICATOR: '__LOOP_RECORD_INDICATOR_ID__',
    JS_EXECUTOR: '__LOOP_JS_EXECUTOR_ID__',
    JS_EXECUTE_BTN: '__LOOP_JS_EXECUTE_BTN_ID__'
  };

  // ============================================
  // Timing from config.ini (replaced by AHK)
  // ============================================
  var TIMING = {
    LOOP_INTERVAL: __LOOP_INTERVAL_MS__,
    COUNTDOWN_INTERVAL: __COUNTDOWN_INTERVAL_MS__,
    FIRST_CYCLE_DELAY: __FIRST_CYCLE_DELAY_MS__,
    POST_COMBO_DELAY: __POST_COMBO_DELAY_MS__,
    PAGE_LOAD_DELAY: __PAGE_LOAD_DELAY_MS__,
    DIALOG_WAIT: __DIALOG_WAIT_MS__,
    WS_CHECK_INTERVAL: __WS_CHECK_INTERVAL_MS__
  };

  // ============================================
  // XPaths and URLs from config.ini (can be changed on the fly)
  // ============================================
  var CONFIG = {
    PROJECT_BUTTON_XPATH: '__LOOP_PROJECT_BUTTON_XPATH__',
    MAIN_PROGRESS_XPATH: '__LOOP_MAIN_PROGRESS_XPATH__',
    PROGRESS_XPATH: '__LOOP_PROGRESS_XPATH__',
    WORKSPACE_XPATH: '__LOOP_WORKSPACE_XPATH__',
    WORKSPACE_NAV_XPATH: '__LOOP_WORKSPACE_NAV_XPATH__',
    CONTROLS_XPATH: '__LOOP_CONTROLS_XPATH__',
    PROMPT_ACTIVE_XPATH: '__LOOP_PROMPT_ACTIVE_XPATH__',
    REQUIRED_DOMAIN: '__LOOP_REQUIRED_DOMAIN__',
    SETTINGS_PATH: '__LOOP_SETTINGS_TAB_PATH__',
    DEFAULT_VIEW: '__LOOP_DEFAULT_VIEW__'
  };

  // ============================================
  // INIT: Idempotent — skip if already embedded
  // Flow: AHK checks marker first, injects macro-looping.js only if absent,
  //       then calls __loopStart(direction) separately.
  // ============================================
  if (document.getElementById(IDS.SCRIPT_MARKER)) {
    console.log('%c[MacroLoop v' + VERSION + '] Already embedded (marker=' + IDS.SCRIPT_MARKER + ') — skipping injection, UI and state intact', 'color: #10b981; font-weight: bold;');
    return; // Exit IIFE — no teardown, no re-creation
  }

  // ============================================
  // Utility: Log with version prefix
  // ============================================
  var activityLogVisible = false;
  var activityLogLines = [];
  var maxActivityLines = 100;

  // ============================================
  // localStorage logging system
  // ============================================
  var LOG_STORAGE_KEY = 'ahk_macroloop_logs';
  var WS_HISTORY_KEY = 'ml_workspace_history';
  var WS_SHARED_KEY = 'ml_known_workspaces';
  var LOG_MAX_ENTRIES = 500;

  function getLogStorageKey() {
    var url = window.location.href;
    var projectMatch = url.match(/\/projects\/([a-f0-9-]+)/);
    var projectId = projectMatch ? projectMatch[1].substring(0, 8) : 'unknown';
    return LOG_STORAGE_KEY + '_' + projectId;
  }

  function persistLog(level, message) {
    try {
      var key = getLogStorageKey();
      var logs = JSON.parse(localStorage.getItem(key) || '[]');
      var now = new Date();
      var timestamp = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      logs.push({
        t: timestamp,
        l: level,
        m: message,
        url: window.location.pathname
      });
      if (logs.length > LOG_MAX_ENTRIES) {
        logs = logs.slice(logs.length - LOG_MAX_ENTRIES);
      }
      localStorage.setItem(key, JSON.stringify(logs));
    } catch (e) { /* storage full or unavailable */ }
  }

  function getAllLogs() {
    try {
      var key = getLogStorageKey();
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) { return []; }
  }

  function clearAllLogs() {
    try {
      var key = getLogStorageKey();
      localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
  }

  function formatLogsForExport() {
    var logs = getAllLogs();
    var lines = [];
    lines.push('=== MacroLoop Logs ===');
    lines.push('Project URL: ' + window.location.href);
    lines.push('Exported at: ' + new Date().toISOString());
    lines.push('Total entries: ' + logs.length);
    lines.push('---');
    for (var i = 0; i < logs.length; i++) {
      var e = logs[i];
      lines.push('[' + e.t + '] [' + e.l + '] ' + e.m);
    }
    return lines.join('\n');
  }

  function copyLogsToClipboard() {
    var text = formatLogsForExport();
    navigator.clipboard.writeText(text).then(function() {
      log('Copied ' + getAllLogs().length + ' log entries to clipboard', 'success');
    }).catch(function(err) {
      log('Clipboard copy failed: ' + err.message, 'warn');
    });
  }

  function downloadLogs() {
    var text = formatLogsForExport();
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'macroloop-logs-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('Downloaded logs file', 'success');
  }

  window.__loopLogs = { copy: copyLogsToClipboard, download: downloadLogs, get: getAllLogs, clear: clearAllLogs, format: formatLogsForExport };

  function addActivityLog(time, level, message, indent) {
    var timestamp = time || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    var indentLevel = indent || 0;
    var entry = { time: timestamp, level: level, msg: message, indent: indentLevel };

    activityLogLines.push(entry);
    if (activityLogLines.length > maxActivityLines) {
      activityLogLines.shift();
    }

    updateActivityLogUI();
  }

  function updateActivityLogUI() {
    var logContainer = document.getElementById('loop-activity-log-content');
    if (!logContainer) return;

    var html = '';
    for (var i = activityLogLines.length - 1; i >= 0; i--) {
      var entry = activityLogLines[i];
      var color = '#a78bfa';
      if (entry.level === 'ERROR' || entry.level === 'error') color = '#ef4444';
      else if (entry.level === 'INFO') color = '#9ca3af';
      else if (entry.level === 'success') color = '#6ee7b7';
      else if (entry.level === 'DEBUG') color = '#c4b5fd';
      else if (entry.level === 'WARN' || entry.level === 'warn') color = '#fbbf24';
      else if (entry.level === 'delegate') color = '#60a5fa';
      else if (entry.level === 'check') color = '#c4b5fd';

      var indentPx = (entry.indent || 0) * 12;
      html += '<div style="font-size:11px;font-family:monospace;padding:2px 0;color:' + color + ';margin-left:' + indentPx + 'px;">';
      if (entry.indent && entry.indent > 0) {
        html += '<span style="color:#6b7280;">' + entry.time + '</span> ';
      } else {
        html += '<span style="color:#6b7280;">[' + entry.time + ']</span> ';
        html += '<span style="color:#a78bfa;">[' + entry.level + ']</span> ';
      }
      html += entry.msg;
      html += '</div>';
    }

    logContainer.innerHTML = html || '<div style="color:#6b7280;font-size:11px;padding:8px;">No activity logs yet</div>';
  }

  function toggleActivityLog() {
    activityLogVisible = !activityLogVisible;
    var logPanel = document.getElementById('loop-activity-log-panel');
    var toggleBtn = document.getElementById('loop-activity-toggle-btn');

    if (logPanel) {
      logPanel.style.display = activityLogVisible ? 'block' : 'none';
    }
    if (toggleBtn) {
      toggleBtn.textContent = activityLogVisible ? '▼ Hide Activity Log' : '▶ Show Activity Log';
    }
  }

  // Expose globally for AHK to call
  window.__addActivityLog = addActivityLog;

  function log(msg, type) {
    var prefix = '[MacroLoop v' + VERSION + '] ';
    var style = 'color: #a78bfa;';
    if (type === 'success') style = 'color: #6ee7b7;';
    if (type === 'error') style = 'color: #ef4444; font-weight: bold;';
    if (type === 'warn') style = 'color: #fbbf24;';
    if (type === 'delegate') style = 'color: #60a5fa;';
    if (type === 'check') style = 'color: #c4b5fd;';
    if (type === 'skip') style = 'color: #9ca3af; font-style: italic;';
    console.log('%c' + prefix + msg, style);

    // Add to activity log (indent 0 = main log)
    addActivityLog(null, type || 'INFO', msg, 0);

    // Persist to localStorage
    persistLog(type || 'INFO', msg);
  }

  // ============================================
  // Sub-log with indentation levels (1-4)
  // Level 1: Direct sub-action
  // Level 2: Detail within sub-action
  // Level 3: Nested detail (e.g. XPath result)
  // Level 4: Deep nested (e.g. element attribute)
  // ============================================
  function logSub(msg, indent) {
    var level = indent || 1;
    var pad = '';
    for (var p = 0; p < level; p++) pad += '  ';
    var prefix = '[MacroLoop v' + VERSION + '] ';
    console.log('%c' + prefix + pad + msg, 'color: #9ca3af;');

    addActivityLog(null, 'SUB', msg, level);
    persistLog('SUB', pad + msg);
  }

  // ============================================
  // XPathUtils integration: delegate reactClick to shared module
  // XPathUtils.js MUST be injected by AHK before macro-looping.js
  // ============================================
  // ============================================
  // Shared Bearer Token (domain-scoped, shared with combo.js)
  // ============================================
  var BEARER_STORAGE_KEY = 'ahk_bearer_token';

  function getBearerTokenFromStorage() {
    try {
      return localStorage.getItem(BEARER_STORAGE_KEY) || '';
    } catch (e) { return ''; }
  }

  // Expose for future API integration
  window.__loopGetBearerToken = getBearerTokenFromStorage;

  // ============================================
  // Credit API Config — reads from combo.js shared localStorage or uses defaults
  // Uses same API endpoint as combo.js for consistent credit data
  // ============================================
  var CREDIT_API_BASE = 'https://api.lovable.dev';
  var CREDIT_CACHE_TTL_S = 30;

  var loopCreditState = {
    lastCheckedAt: null,
    perWorkspace: [],
    currentWs: null,       // workspace matching current context
    totalDailyFree: 0,
    totalRollover: 0,
    totalAvailable: 0,
    totalBillingAvail: 0,
    source: null
  };

  // ============================================
  // Credit API: Parse response (same logic as combo.js)
  // ============================================
  // === Shared credit calculation helpers ===
  function calcTotalCredits(granted, dailyLimit, billingLimit, topupLimit, rolloverLimit) {
    return Math.round((granted || 0) + (dailyLimit || 0) + (billingLimit || 0) + (topupLimit || 0) + (rolloverLimit || 0));
  }
  function calcAvailableCredits(totalCredits, rolloverUsed, dailyUsed, billingUsed) {
    return Math.max(0, Math.round(totalCredits - (rolloverUsed || 0) - (dailyUsed || 0) - (billingUsed || 0)));
  }
  function calcFreeCreditAvailable(dailyLimit, dailyUsed) {
    return Math.max(0, Math.round((dailyLimit || 0) - (dailyUsed || 0)));
  }

  function parseLoopApiResponse(data) {
    var workspaces = data.workspaces || data || [];
    if (!Array.isArray(workspaces)) {
      log('parseLoopApiResponse: unexpected response shape', 'warn');
      return false;
    }

    var perWs = [];
    for (var i = 0; i < workspaces.length; i++) {
      var rawWs = workspaces[i];
      var ws = rawWs.workspace || rawWs;
      var bUsed = ws.billing_period_credits_used || 0;
      var bLimit = ws.billing_period_credits_limit || 0;
      var dUsed = ws.daily_credits_used || 0;
      var dLimit = ws.daily_credits_limit || 0;
      var rUsed = ws.rollover_credits_used || 0;
      var rLimit = ws.rollover_credits_limit || 0;
      var freeGranted = ws.credits_granted || 0;
      var freeUsed = ws.credits_used || 0;
      var freeRemaining = Math.max(0, Math.round(freeGranted - freeUsed));

      var dailyFree = Math.max(0, Math.round(dLimit - dUsed));
      var rollover = Math.max(0, Math.round(rLimit - rUsed));
      var billingAvailable = Math.max(0, Math.round(bLimit - bUsed));
      var topupLimit = Math.round(ws.topup_credits_limit || 0);
      var totalCreditsUsed = Math.round(ws.total_credits_used || 0);
      // Total Credits = credits_granted + daily_credits_limit + billing_period_credits_limit + topup_credits_limit + rollover_credits_limit
      var totalCredits = calcTotalCredits(freeGranted, dLimit, bLimit, topupLimit, rLimit);
      // Available Credit = Total Credits - rollover_credits_used - daily_credits_used - billing_period_credits_used
      var available = calcAvailableCredits(totalCredits, rUsed, dUsed, bUsed);

      var subStatus = (rawWs.workspace ? rawWs.subscription_status : ws.subscription_status) || 'N/A';
      var role = (rawWs.workspace ? rawWs.role : ws.role) || 'N/A';

      perWs.push({
        id: ws.id || '',
        name: (ws.name || 'WS' + i).substring(0, 12),
        fullName: ws.name || 'WS' + i,
        dailyFree: dailyFree, dailyLimit: Math.round(dLimit),
        dailyUsed: Math.round(dUsed),
        rollover: rollover, rolloverLimit: Math.round(rLimit),
        rolloverUsed: Math.round(rUsed),
        available: available, billingAvailable: billingAvailable,
        used: Math.round(bUsed),
        limit: Math.round(bLimit),
        freeGranted: Math.round(freeGranted), freeRemaining: freeRemaining,
        hasFree: freeGranted > 0 && freeUsed < freeGranted,
        topupLimit: topupLimit,
        totalCreditsUsed: totalCreditsUsed,
        totalCredits: totalCredits,
        subscriptionStatus: subStatus, role: role,
        raw: ws
      });
    }

    loopCreditState.perWorkspace = perWs;
    loopCreditState.lastCheckedAt = Date.now();

    // Aggregate totals
    var tdf = 0, tr = 0, ta = 0, tba = 0;
    for (var j = 0; j < perWs.length; j++) {
      tdf += perWs[j].dailyFree;
      tr += perWs[j].rollover;
      ta += perWs[j].available;
      tba += perWs[j].billingAvailable;
    }
    loopCreditState.totalDailyFree = tdf;
    loopCreditState.totalRollover = tr;
    loopCreditState.totalAvailable = ta;
    loopCreditState.totalBillingAvail = tba;

    // v7.9.19: Don't blindly default to perWs[0] — leave null until workspace is properly detected
    // autoDetectLoopCurrentWorkspace will set currentWs after matching via API or DOM fallback
    if (state.workspaceName && perWs.length > 0) {
      for (var k = 0; k < perWs.length; k++) {
        if (perWs[k].fullName === state.workspaceName || perWs[k].name === state.workspaceName) {
          loopCreditState.currentWs = perWs[k];
          break;
        }
      }
    }

    // v7.9.20: Build wsById dictionary for O(1) lookup by workspace ID
    loopCreditState.wsById = {};
    for (var w = 0; w < perWs.length; w++) {
      if (perWs[w].id) {
        loopCreditState.wsById[perWs[w].id] = perWs[w];
      }
    }

    loopCreditState.source = 'api';
    log('Credit API: parsed ' + perWs.length + ' workspaces — dailyFree=' + tdf + ' rollover=' + tr + ' available=' + ta + ' | wsById keys=' + Object.keys(loopCreditState.wsById).length, 'success');
    return true;
  }

  // ============================================
  // Credit API: Fetch credits from API
  // ============================================
  function fetchLoopCredits() {
    var url = CREDIT_API_BASE + '/user/workspaces';
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };

    var token = getBearerTokenFromStorage();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    // v7.9.25: Full fetch logging per standard
    log('Credit API: GET ' + url, 'check');
    logSub('Auth: ' + (token ? 'Bearer ' + token.substring(0, 12) + '...REDACTED' : 'cookies only (no bearer)'), 1);
    logSub('Request headers: ' + JSON.stringify({ Accept: headers['Accept'], 'Content-Type': headers['Content-Type'], Authorization: token ? 'Bearer ' + token.substring(0, 12) + '...REDACTED' : '(none)' }), 1);

    fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
      .then(function(resp) {
        var respContentType = resp.headers.get('content-type') || '(none)';
        var respContentLength = resp.headers.get('content-length') || '(not set)';
        log('Credit API: Response status=' + resp.status + ' statusText="' + resp.statusText + '" content-type="' + respContentType + '" content-length=' + respContentLength, 'check');
        if (!resp.ok) {
          return resp.text().then(function(errBody) {
            log('Credit API: HTTP ' + resp.status + ' error body: ' + (errBody || '(empty)').substring(0, 500), 'error');
            throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
          });
        }
        return resp.text().then(function(bodyText) {
          bodyText = (bodyText || '').trim();
          logSub('Credit API: body length=' + bodyText.length + ' preview="' + (bodyText || '(empty)').substring(0, 200) + '"', 1);
          if (!bodyText) {
            throw new Error('Empty response body from ' + url);
          }
          var data;
          try { data = JSON.parse(bodyText); } catch(e) {
            throw new Error('JSON parse failed: ' + e.message + ' | raw: "' + bodyText.substring(0, 300) + '"');
          }
          return data;
        });
      })
      .then(function(data) {
        var ok = parseLoopApiResponse(data);
        if (ok) {
          // v7.9.3: Auto-detect current workspace via project API
          var token = getBearerTokenFromStorage();
          window.__loopResolvedToken = token;
          autoDetectLoopCurrentWorkspace(token).then(function() {
            // v7.9.7: Sync state.hasFreeCredit from API data
            syncCreditStateFromApi();
            updateUI();
            log('Credit API: display updated (workspace detected)', 'success');
          });
        }
      })
      .catch(function(err) {
        log('Credit API failed: ' + err.message + ' | URL=' + url + ' | auth=' + (token ? 'bearer(' + token.substring(0, 12) + '...REDACTED)' : 'cookies'), 'error');
      });
  }

  window.__loopFetchCredits = fetchLoopCredits;

  // ============================================
  // v7.9.30: Auto-detect current workspace via XPath only
  // mark-viewed API removed — it returns nothing useful.
  // Goes directly to Project Dialog XPath detection.
  // Returns a Promise so Focus Current can await it.
  // ============================================
  function autoDetectLoopCurrentWorkspace(bearerToken) {
    var fn = 'autoDetectLoopWs';
    var perWs = loopCreditState.perWorkspace || [];
    if (perWs.length === 0) {
      log(fn + ': No workspaces loaded', 'warn');
      return Promise.resolve();
    }
    if (perWs.length === 1) {
      state.workspaceName = perWs[0].fullName || perWs[0].name;
      state.workspaceFromApi = true;
      loopCreditState.currentWs = perWs[0];
      log(fn + ': Single workspace: ' + state.workspaceName, 'success');
      return Promise.resolve();
    }

    log(fn + ': Detecting workspace via Project Dialog XPath...', 'check');
    return detectWorkspaceViaProjectDialog(fn, perWs);
  }

  // v7.9.25: Detect workspace by clicking the Project Button → reading WorkspaceNameXPath
  // This is the reliable DOM fallback: the project dialog always shows the workspace name.
  // Flow: click ProjectButtonXPath → wait for dialog → read WorkspaceNameXPath → validate → close dialog
  function detectWorkspaceViaProjectDialog(callerFn, perWs) {
    var fn = callerFn || 'detectWsViaDialog';
    if (!perWs || perWs.length === 0) {
      log(fn + ': No workspaces loaded — cannot detect', 'warn');
      return Promise.resolve();
    }

    log(fn + ': Tier 2 — Opening project dialog to read workspace name...', 'check');
    logSub('ProjectButtonXPath: ' + CONFIG.PROJECT_BUTTON_XPATH, 1);
    logSub('WorkspaceNameXPath: ' + CONFIG.WORKSPACE_XPATH, 1);

    // Step 1: Find and click the project button
    var btn = getByXPath(CONFIG.PROJECT_BUTTON_XPATH);
    if (!btn) {
      var fallbackBtn = findElement(ML_ELEMENTS.PROJECT_BUTTON);
      if (fallbackBtn) {
        btn = fallbackBtn;
        logSub('Project button found via fallback findElement', 1);
      }
    }
    if (!btn) {
      log(fn + ': Project button NOT found — cannot open dialog. XPath=' + CONFIG.PROJECT_BUTTON_XPATH, 'error');
      // Ultimate fallback: default to first workspace
      state.workspaceName = perWs[0].fullName || perWs[0].name;
      loopCreditState.currentWs = perWs[0];
      log(fn + ': Defaulted to first workspace: ' + state.workspaceName, 'warn');
      return Promise.resolve();
    }

    // Check if dialog is already open
    var isExpanded = btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open';
    if (!isExpanded) {
      logSub('Dialog is closed — clicking project button to open', 1);
      reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
    } else {
      logSub('Dialog is already open', 1);
    }

    // Step 2: Wait for dialog to render, then read workspace name
    return new Promise(function(resolve) {
      var dialogWaitMs = 1500;
      var pollInterval = 300;
      var elapsed = 0;
      logSub('Waiting up to ' + dialogWaitMs + 'ms for WorkspaceNameXPath to appear...', 1);

      var pollTimer = setInterval(function() {
        elapsed += pollInterval;
        var wsEl = getByXPath(CONFIG.WORKSPACE_XPATH);
        if (wsEl) {
          clearInterval(pollTimer);
          var rawName = (wsEl.textContent || '').trim();
          logSub('WorkspaceNameXPath found after ' + elapsed + 'ms: "' + rawName + '"', 1);

          if (!rawName) {
            log(fn + ': Workspace XPath element found but text is empty', 'warn');
            closeDialogAndDefault(fn, btn, perWs, resolve);
            return;
          }

          // Validate against known workspaces
          var matched = null;
          for (var i = 0; i < perWs.length; i++) {
            if (perWs[i].fullName === rawName || perWs[i].name === rawName) {
              matched = perWs[i];
              break;
            }
            // Partial match (case-insensitive)
            if (perWs[i].fullName && perWs[i].fullName.toLowerCase().indexOf(rawName.toLowerCase()) !== -1) {
              matched = perWs[i];
              break;
            }
            if (rawName.toLowerCase().indexOf(perWs[i].name.toLowerCase()) !== -1 && perWs[i].name.length >= 4) {
              matched = perWs[i];
              break;
            }
          }

          if (matched) {
            state.workspaceName = matched.fullName || matched.name;
            state.workspaceFromApi = true;
            loopCreditState.currentWs = matched;
            log(fn + ': ✅ Workspace detected from project dialog: "' + rawName + '" → ' + state.workspaceName + ' (id=' + matched.id + ')', 'success');
          } else {
            log(fn + ': XPath returned "' + rawName + '" — not a known workspace name (checked ' + perWs.length + ' workspaces)', 'warn');
            state.workspaceName = perWs[0].fullName || perWs[0].name;
            loopCreditState.currentWs = perWs[0];
            log(fn + ': Defaulted to first workspace: ' + state.workspaceName, 'warn');
          }

          // Close dialog after reading
          closeProjectDialogSafe(btn);
          resolve();
          return;
        }

        if (elapsed >= dialogWaitMs) {
          clearInterval(pollTimer);
          log(fn + ': WorkspaceNameXPath not found after ' + dialogWaitMs + 'ms — XPath may be stale: ' + CONFIG.WORKSPACE_XPATH, 'warn');
          closeDialogAndDefault(fn, btn, perWs, resolve);
        }
      }, pollInterval);
    });
  }

  function closeDialogAndDefault(fn, btn, perWs, resolve) {
    state.workspaceName = perWs[0].fullName || perWs[0].name;
    loopCreditState.currentWs = perWs[0];
    log(fn + ': Defaulted to first workspace: ' + state.workspaceName, 'warn');
    closeProjectDialogSafe(btn);
    resolve();
  }

  function closeProjectDialogSafe(btn) {
    try {
      var isExpanded = btn && (btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open');
      if (isExpanded) {
        logSub('Closing project dialog after workspace read', 1);
        reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
      }
    } catch (e) {
      logSub('Error closing dialog: ' + e.message, 1);
    }
  }

  // Legacy alias
  function detectWorkspaceFromDom(callerFn, perWs) {
    detectWorkspaceViaProjectDialog(callerFn, perWs);
  }

  // ============================================
  // Bearer Token Management (shared with combo.js via localStorage)
  // ============================================
  function saveBearerTokenToStorage(token) {
    try {
      localStorage.setItem(BEARER_STORAGE_KEY, token);
      log('Bearer token saved (len=' + token.length + ')', 'success');
    } catch (e) {
      log('Failed to save bearer token: ' + e.message, 'error');
    }
  }

  // ============================================
  // Move-to-Workspace API (same as combo.js)
  // PUT /projects/{projectId}/move-to-workspace
  // ============================================
  function extractProjectIdFromUrl() {
    var url = window.location.href;
    var match = url.match(/\/projects\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  var loopMoveStatusEl = null; // set during UI creation

  function moveToWorkspace(targetWorkspaceId, targetWorkspaceName) {
    var projectId = extractProjectIdFromUrl();
    if (!projectId) {
      log('Cannot extract projectId from URL: ' + window.location.href, 'error');
      updateLoopMoveStatus('error', 'No project ID in URL');
      return;
    }

    function doMove(token, isRetry) {
      var url = CREDIT_API_BASE + '/projects/' + projectId + '/move-to-workspace';
      var requestBody = { workspace_id: targetWorkspaceId };
      var headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }

      var label = isRetry ? ' (cookie retry)' : '';
      log('=== MOVE TO WORKSPACE ===' + label, 'delegate');
      log('PUT ' + url, 'delegate');
      logSub('Target: ' + targetWorkspaceName + ' (id=' + targetWorkspaceId + ')', 1);
      logSub('Auth: ' + (token ? 'Bearer ' + token.substring(0, 12) + '...' : 'cookies only'), 1);

      updateLoopMoveStatus('loading', 'Moving to ' + targetWorkspaceName + '...');

      fetch(url, {
        method: 'PUT',
        headers: headers,
        credentials: 'include',
        mode: 'cors',
        body: JSON.stringify(requestBody)
      }).then(function(resp) {
        // If 401/403 with bearer token, retry with cookies only + mark token expired
        if ((resp.status === 401 || resp.status === 403) && token && !isRetry) {
          log('Move got ' + resp.status + ' with bearer token — retrying with cookies only', 'warn');
          markBearerTokenExpired('loop');
          doMove(null, true);
          return;
        }
        log('Move response: ' + resp.status + ' ' + resp.statusText + label, resp.ok ? 'success' : 'error');
        if (!resp.ok) {
          return resp.text().then(function(body) {
            log('Move failed: HTTP ' + resp.status + ' | body: ' + body.substring(0, 500), 'error');
            updateLoopMoveStatus('error', 'HTTP ' + resp.status + ': ' + body.substring(0, 80));
          });
        }
        return resp.text().then(function(body) {
          log('✅ MOVE SUCCESS -> ' + targetWorkspaceName + label, 'success');
          updateLoopMoveStatus('success', 'Moved to ' + targetWorkspaceName);
          // Update current workspace name to the target
          state.workspaceName = targetWorkspaceName;
          state.workspaceFromApi = true;
          log('Updated state.workspaceName to: "' + targetWorkspaceName + '"', 'success');
          // Immediately re-render workspace list to reflect new current
          populateLoopWorkspaceDropdown();
          // v7.9.32: After move, state is already set authoritatively from API success.
          // Do NOT run XPath detection — the dialog may still show the old workspace.
          // Just refresh credits to get updated data, then sync UI.
          setTimeout(function() {
            fetchLoopCredits();
          }, 2000);
        });
      }).catch(function(err) {
        log('Move error: ' + err.message, 'error');
        updateLoopMoveStatus('error', err.message);
      });
    }

    var resolvedToken = getBearerTokenFromStorage();
    if (!resolvedToken) {
      log('No bearer token — attempting move with cookies only', 'warn');
    }
    doMove(resolvedToken, false);
  }

  function updateLoopMoveStatus(state, message) {
    var el = document.getElementById('loop-move-status');
    if (!el) return;
    var colors = { loading: '#facc15', success: '#4ade80', error: '#ef4444' };
    el.style.color = colors[state] || '#9ca3af';
    el.textContent = message;
    if (state === 'success') {
      setTimeout(function() { el.textContent = ''; }, 5000);
    }
  }

  window.__loopMoveToWorkspace = moveToWorkspace;

  // Move to adjacent workspace in the loaded list (API-based, used by F-Up/F-Down)
  function moveToAdjacentWorkspace(direction) {
    var workspaces = loopCreditState.perWorkspace || [];
    if (workspaces.length === 0) {
      log('No workspaces loaded — click 💳 first', 'error');
      updateLoopMoveStatus('error', 'Load workspaces first (💳)');
      return;
    }
    var currentName = state.workspaceName || '';
    var currentIdx = -1;
    // Exact match first
    for (var i = 0; i < workspaces.length; i++) {
      if (workspaces[i].fullName === currentName || workspaces[i].name === currentName) {
        currentIdx = i;
        break;
      }
    }
    // Partial match fallback (case-insensitive contains)
    if (currentIdx === -1 && currentName) {
      var lowerName = currentName.toLowerCase();
      for (var pi = 0; pi < workspaces.length; pi++) {
        if ((workspaces[pi].fullName || '').toLowerCase().indexOf(lowerName) !== -1 ||
            lowerName.indexOf((workspaces[pi].fullName || '').toLowerCase()) !== -1) {
          currentIdx = pi;
          log('Workspace partial match: "' + currentName + '" ~ "' + workspaces[pi].fullName + '" (idx=' + pi + ')', 'warn');
          break;
        }
      }
    }
    if (currentIdx === -1) {
      log('Current workspace "' + currentName + '" not found in ' + workspaces.length + ' workspaces — using first workspace', 'warn');
      logSub('Available: ' + workspaces.map(function(w) { return w.fullName; }).join(', '), 1);
      currentIdx = 0;
    }
    var targetIdx;
    if (direction === 'up') {
      targetIdx = currentIdx === 0 ? workspaces.length - 1 : currentIdx - 1;
    } else {
      targetIdx = currentIdx === workspaces.length - 1 ? 0 : currentIdx + 1;
    }
    var target = workspaces[targetIdx];
    var targetId = (target.raw && target.raw.id) || target.id || '';
    log('API Move ' + direction.toUpperCase() + ': "' + currentName + '" (#' + currentIdx + ') -> "' + target.fullName + '" (#' + targetIdx + ')', 'delegate');
    moveToWorkspace(targetId, target.fullName);
  }
  window.__loopMoveAdjacent = moveToAdjacentWorkspace;

  // ============================================
  // Workspace Dropdown State & Rendering (MacroLoop)
  // ============================================
  var loopWsNavIndex = -1;
  var loopWsFreeOnly = false;

  function triggerLoopMoveFromSelection() {
    var selectedEl = document.getElementById('loop-ws-selected');
    var wsId = selectedEl ? selectedEl.getAttribute('data-selected-id') : '';
    var wsName = selectedEl ? selectedEl.getAttribute('data-selected-name') : '';
    if (!wsId) {
      log('No workspace selected for move', 'warn');
      updateLoopMoveStatus('error', 'Select a workspace first');
      return;
    }
    log('Moving project to workspace=' + wsId + ' (' + wsName + ')', 'delegate');
    moveToWorkspace(wsId, wsName);
  }

  function setLoopWsNavIndex(idx) {
    loopWsNavIndex = idx;
    var listEl = document.getElementById('loop-ws-list');
    if (!listEl) return;
    var items = listEl.querySelectorAll('.loop-ws-item');
    for (var i = 0; i < items.length; i++) {
      var isCurrent = items[i].getAttribute('data-ws-current') === 'true';
      if (i === idx) {
        items[i].style.background = 'rgba(99,102,241,0.25)';
        items[i].style.outline = '1px solid #818cf8';
        items[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        var wsId = items[i].getAttribute('data-ws-id');
        var wsName = items[i].getAttribute('data-ws-name');
        var selectedEl = document.getElementById('loop-ws-selected');
        if (selectedEl) {
          selectedEl.setAttribute('data-selected-id', wsId);
          selectedEl.setAttribute('data-selected-name', wsName);
          selectedEl.textContent = '✅ ' + wsName;
          selectedEl.style.color = '#4ade80';
        }
      } else {
        items[i].style.outline = 'none';
        items[i].style.background = isCurrent ? 'rgba(99,102,241,0.15)' : 'transparent';
      }
    }
  }

  function buildLoopTooltipText(ws) {
    var lines = [];
    lines.push('━━━ ' + (ws.fullName || ws.name) + ' ━━━');
    lines.push('');
    lines.push('📊 CALCULATED:');
    lines.push('  🆓 Daily Free: ' + (ws.dailyFree || 0) + ' (' + ws.dailyLimit + ' - ' + ws.dailyUsed + ')');
    lines.push('  🔄 Rollover: ' + (ws.rollover || 0) + ' (' + ws.rolloverLimit + ' - ' + ws.rolloverUsed + ')');
    lines.push('  💰 Available: ' + (ws.available || 0) + ' (total:' + (ws.totalCredits || 0) + ' - rUsed:' + (ws.rolloverUsed || 0) + ' - dUsed:' + (ws.dailyUsed || 0) + ' - bUsed:' + (ws.used || 0) + ')');
    lines.push('  📦 Billing Only: ' + (ws.billingAvailable || 0) + ' (' + ws.limit + ' - ' + ws.used + ')');
    var _tc = ws.totalCredits || calcTotalCredits(ws.freeGranted, ws.dailyLimit, ws.limit, ws.topupLimit, ws.rolloverLimit);
    lines.push('  ⚡ Total Credits: ' + _tc + ' (granted:' + (ws.freeGranted||0) + ' + daily:' + (ws.dailyLimit||0) + ' + billing:' + (ws.limit||0) + ' + topup:' + (ws.topupLimit||0) + ' + rollover:' + (ws.rolloverLimit||0) + ')');
    lines.push('');
    lines.push('📋 RAW DATA:');
    lines.push('  ID: ' + ws.id);
    lines.push('  Billing: ' + ws.used + '/' + ws.limit + ' used');
    lines.push('  Rollover: ' + ws.rolloverUsed + '/' + ws.rolloverLimit + ' used');
    lines.push('  Daily: ' + ws.dailyUsed + '/' + ws.dailyLimit + ' used');
    if (ws.freeGranted > 0) {
      lines.push('  Trial: ' + ws.freeRemaining + '/' + ws.freeGranted + ' remaining');
    }
    lines.push('  Status: ' + (ws.subscriptionStatus || 'N/A'));
    lines.push('  Role: ' + (ws.role || 'N/A'));
    if (ws.raw) {
      var r = ws.raw;
      if (r.last_trial_credit_period) lines.push('  Trial Period: ' + r.last_trial_credit_period);
      if (r.subscription_status) lines.push('  Subscription: ' + r.subscription_status);
    }
    return lines.join('\n');
  }

  function renderLoopWorkspaceList(workspaces, currentName, filter) {
    var listEl = document.getElementById('loop-ws-list');
    if (!listEl) return;
    var html = '';
    var count = 0;
    var currentIdx = -1;
    for (var i = 0; i < workspaces.length; i++) {
      var ws = workspaces[i];
      var isCurrent = ws.fullName === currentName || ws.name === currentName;
      // Partial match fallback (case-insensitive contains)
      if (!isCurrent && currentName) {
        var lcn = currentName.toLowerCase();
        isCurrent = (ws.fullName || '').toLowerCase().indexOf(lcn) !== -1 ||
                    lcn.indexOf((ws.fullName || '').toLowerCase()) !== -1;
      }
      var matchesFilter = !filter || ws.fullName.toLowerCase().indexOf(filter.toLowerCase()) !== -1 || ws.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
      if (!matchesFilter) continue;
      if (loopWsFreeOnly && (ws.dailyFree || 0) <= 0) continue;
      // Advanced filters
      var rolloverFilterEl = document.getElementById('loop-ws-rollover-filter');
      var rolloverOnly = rolloverFilterEl && rolloverFilterEl.getAttribute('data-active') === 'true';
      if (rolloverOnly && (ws.rollover || 0) <= 0) continue;
      var billingFilterEl = document.getElementById('loop-ws-billing-filter');
      var billingOnlyF = billingFilterEl && billingFilterEl.getAttribute('data-active') === 'true';
      if (billingOnlyF && (ws.billingAvailable || 0) <= 0) continue;
      var minCreditsEl = document.getElementById('loop-ws-min-credits');
      var minCreditsVal = minCreditsEl ? parseInt(minCreditsEl.value, 10) || 0 : 0;
      if (minCreditsVal > 0 && (ws.available || 0) < minCreditsVal) continue;
      if (isCurrent) currentIdx = count;
      count++;
      var dailyFree = ws.dailyFree || 0;
      var rollover = ws.rollover || 0;
      var available = ws.available || 0;
      var billingAvail = ws.billingAvailable || 0;
      var limitInt = ws.limit || 0;
      var emoji = isCurrent ? '📍' : (available <= 0 ? '🔴' : available <= limitInt * 0.2 ? '🟡' : '🟢');
      var nameColor = isCurrent ? '#67e8f9' : '#e2e8f0';
      var nameBold = isCurrent ? 'font-weight:800;' : 'font-weight:500;';
      var bgStyle = isCurrent ? 'background:rgba(99,102,241,0.15);border-left:3px solid #818cf8;' : 'border-left:3px solid transparent;';
      var dfColor = dailyFree > 0 ? '#4ade80' : '#f87171';
      var roColor = rollover > 0 ? '#c4b5fd' : '#f87171';
      var avColor = available > 0 ? '#67e8f9' : '#f87171';

      var wsId = ws.id || (ws.raw && ws.raw.id) || '';
      var tooltip = buildLoopTooltipText(ws).replace(/"/g, '&quot;');
      html += '<div class="loop-ws-item" data-ws-id="' + wsId + '" data-ws-name="' + (ws.fullName || ws.name).replace(/"/g, '&quot;') + '" data-ws-current="' + isCurrent + '" data-ws-idx="' + (count - 1) + '"'
        + ' title="' + tooltip + '"'
        + ' style="display:flex;align-items:center;gap:6px;padding:5px 6px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);transition:background 0.15s;font-size:11px;' + bgStyle + '"'
        + ' onmouseover="if(this.getAttribute(\'data-ws-current\')!==\'true\')this.style.background=\'rgba(59,130,246,0.15)\'"'
        + ' onmouseout="if(this.getAttribute(\'data-ws-current\')!==\'true\')this.style.background=\'transparent\'">'
        + '<span style="font-size:12px;">' + emoji + '</span>'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="color:' + nameColor + ';font-size:11px;' + nameBold + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (ws.fullName || ws.name) + '</div>'
        + '<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">'
        + (function() {
            // Total Credits = credits_granted + daily_credits_limit + billing_period_credits_limit + topup_credits_limit + rollover_credits_limit
          var _totalCapacity = ws.totalCredits || calcTotalCredits(ws.freeGranted, ws.dailyLimit, ws.limit, ws.topupLimit, ws.rolloverLimit);
          var _fr = ws.freeRemaining || 0;
          var _bp = _totalCapacity > 0 ? Math.max(billingAvail > 0 ? 2 : 0, Math.round(billingAvail / _totalCapacity * 100)) : 0;
          var _rp = _totalCapacity > 0 ? Math.max(rollover > 0 ? 2 : 0, Math.round(rollover / _totalCapacity * 100)) : 0;
          var _dp = _totalCapacity > 0 ? Math.max(dailyFree > 0 ? 2 : 0, Math.round(dailyFree / _totalCapacity * 100)) : 0;
          var _fp = _totalCapacity > 0 ? Math.max(_fr > 0 ? 2 : 0, Math.round(_fr / _totalCapacity * 100)) : 0;
          var _availTotal = ws.available || 0;
          return '<div style="display:flex;align-items:center;gap:6px;">'
            + '<div title="Available: ' + _availTotal + ' / Total: ' + _totalCapacity + ' (Used: ' + (ws.totalCreditsUsed || 0) + ')" style="flex:1;height:12px;background:rgba(239,68,68,0.25);border-radius:5px;overflow:hidden;display:flex;min-width:100px;max-width:260px;border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 3px rgba(0,0,0,0.3);">'
            + (billingAvail > 0 ? '<div title="💰 Billing: ' + billingAvail + '" style="width:' + _bp + '%;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>' : '')
            + (rollover > 0 ? '<div title="🔄 Rollover: ' + rollover + '" style="width:' + _rp + '%;height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);"></div>' : '')
            + (dailyFree > 0 ? '<div title="📅 Daily: ' + dailyFree + '" style="width:' + _dp + '%;height:100%;background:linear-gradient(90deg,#d97706,#facc15);"></div>' : '')
            + (_fr > 0 ? '<div title="🎁 Granted: ' + _fr + '" style="width:' + _fp + '%;height:100%;background:linear-gradient(90deg,#f97316,#fb923c);"></div>' : '')
            + '</div>'
            + '<span style="font-size:10px;white-space:nowrap;font-family:monospace;line-height:1;">'
            + '<span style="color:#4ade80;" title="💰 Billing = credits remaining in billing period">💰' + billingAvail + '</span> '
            + '<span style="color:#c4b5fd;" title="🔄 Rollover = unused credits carried from previous period">🔄' + rollover + '</span> '
            + '<span style="color:#facc15;" title="📅 Daily Free = free credits refreshed daily">📅' + dailyFree + '</span> '
            + (_fr > 0 ? '<span style="color:#fb923c;" title="🎁 Granted = promotional credits remaining">🎁' + _fr + '</span> ' : '')
            + '<span style="color:#22d3ee;font-weight:700;" title="⚡ Available = Total - rolloverUsed - dailyUsed - billingUsed">⚡' + _availTotal + '</span>'
            + '<span style="color:#94a3b8;font-size:9px;" title="Total Credits = granted + daily + billing + topup + rollover">/' + _totalCapacity + '</span>'
            + '</span></div>';
        })()
        + '</div>'
        + '</div>'
        + (isCurrent ? '<span style="font-size:8px;color:#818cf8;background:rgba(99,102,241,0.3);padding:1px 4px;border-radius:3px;font-weight:700;">NOW</span>' : '')
        + '</div>';
    }
    if (count === 0) {
      html = '<div style="padding:8px;color:#818cf8;font-size:10px;text-align:center;">🔍 No matches</div>';
    }
    listEl.innerHTML = html;
    loopWsNavIndex = -1;

    // Bind click + double-click events
    var items = listEl.querySelectorAll('.loop-ws-item');
    for (var j = 0; j < items.length; j++) {
      items[j].onclick = (function(item) {
        return function() {
          var idx = parseInt(item.getAttribute('data-ws-idx'), 10);
          setLoopWsNavIndex(idx);
          log('Selected workspace: ' + item.getAttribute('data-ws-name'), 'success');
        };
      })(items[j]);
      // Double-click: immediately move to workspace
      items[j].ondblclick = (function(item) {
        return function(e) {
          e.preventDefault();
          e.stopPropagation();
          var wsId = item.getAttribute('data-ws-id');
          var wsName = item.getAttribute('data-ws-name');
          var isCurrent = item.getAttribute('data-ws-current') === 'true';
          if (isCurrent) {
            log('Double-click on current workspace "' + wsName + '" — no move needed', 'warn');
            return;
          }
          log('Double-click move -> ' + wsName + ' (id=' + wsId + ')', 'delegate');
          moveToWorkspace(wsId, wsName);
        };
      })(items[j]);
    }

    // Auto-scroll to current workspace
    if (currentIdx >= 0 && !filter) {
      setTimeout(function() {
        var currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
        if (currentItem) currentItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        // Auto-select current if nothing selected
        var selectedEl = document.getElementById('loop-ws-selected');
        if (selectedEl && !selectedEl.getAttribute('data-selected-id')) {
          setLoopWsNavIndex(currentIdx);
        }
      }, 50);
    }
  }

  function populateLoopWorkspaceDropdown() {
    var listEl = document.getElementById('loop-ws-list');
    if (!listEl) return;
    var workspaces = loopCreditState.perWorkspace || [];
    if (workspaces.length === 0) {
      listEl.innerHTML = '<div style="padding:6px;color:#818cf8;font-size:10px;">📭 Click 💳 to load workspaces</div>';
      return;
    }
    var currentName = state.workspaceName || '';
    var searchEl = document.getElementById('loop-ws-search');
    var filter = searchEl ? searchEl.value.trim() : '';
    renderLoopWorkspaceList(workspaces, currentName, filter);
    log('Workspace dropdown populated: ' + workspaces.length + ' workspaces', 'success');
  }

  // Override updateUI to also refresh workspace dropdown
  var _origUpdateUI;
  // Will be patched after createUI

  var hasXPathUtils = typeof window.XPathUtils !== 'undefined';
  if (hasXPathUtils) {
    // Route XPathUtils logs into macroloop's localStorage log system
    window.XPathUtils.setLogger(
      function(fn, msg) { log('[XPathUtils.' + fn + '] ' + msg, 'check'); },
      function(fn, msg) { logSub(msg); },
      function(fn, msg) { log('[XPathUtils.' + fn + '] WARN: ' + msg, 'warn'); }
    );
    log('XPathUtils v' + window.XPathUtils.version + ' detected — using shared utilities', 'success');
  } else {
    log('XPathUtils NOT found — using inline fallback', 'warn');
    // Deferred retry
    setTimeout(function() {
      if (typeof window.XPathUtils !== 'undefined' && !hasXPathUtils) {
        hasXPathUtils = true;
        window.XPathUtils.setLogger(
          function(fn, msg) { log('[XPathUtils.' + fn + '] ' + msg, 'check'); },
          function(fn, msg) { logSub(msg); },
          function(fn, msg) { log('[XPathUtils.' + fn + '] WARN: ' + msg, 'warn'); }
        );
        log('XPathUtils detected on deferred retry (500ms)', 'success');
      }
    }, 500);
  }

  // React-compatible click: delegates to XPathUtils if available
  function reactClick(el, callerXpath) {
    if (hasXPathUtils) {
      window.XPathUtils.reactClick(el, callerXpath);
      return;
    }
    // Fallback: inline implementation
    var fn = 'reactClick';
    var tag = '<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '>';
    log('[' + fn + '] Clicking ' + tag + ' | XPath: ' + (callerXpath || '(no xpath)') + ' [FALLBACK]', 'check');
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var opts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy };
    var pointerOpts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    logSub('All 5 events dispatched [FALLBACK]');
  }

  // v7.9.31: Mark bearer token as expired — scoped to controller's own token title element
  // Also injects a visible "Paste Save" button next to the title for quick token replacement
  function markBearerTokenExpired(controller) {
    var inputId = controller === 'loop' ? 'loop-bearer-input' : 'ahk-bearer-token-input';
    var titleId = controller === 'loop' ? 'loop-bearer-title' : 'combo-bearer-title';
    var pasteBtnId = controller === 'loop' ? 'loop-quick-paste-btn' : 'combo-quick-paste-btn';
    var inp = document.getElementById(inputId);
    if (inp) {
      inp.style.borderColor = '#ef4444';
      inp.style.boxShadow = '0 0 4px rgba(239,68,68,0.5)';
    }
    var titleEl = document.getElementById(titleId);
    if (titleEl) {
      titleEl.textContent = 'Bearer Token 🔴 EXPIRED — replace token!';
      titleEl.style.color = '#fca5a5';
    }
    // v7.9.31: Show a quick "Paste Save" button next to the bearer title
    if (!document.getElementById(pasteBtnId)) {
      var headerParent = titleEl ? titleEl.parentElement : null;
      if (headerParent) {
        var quickPasteBtn = document.createElement('button');
        quickPasteBtn.id = pasteBtnId;
        quickPasteBtn.textContent = 'Paste  Save';
        quickPasteBtn.title = 'Paste token from clipboard and save immediately';
        quickPasteBtn.style.cssText = 'margin-left:auto;padding:3px 10px;background:#7c3aed;color:#e9d5ff;border:1px solid #6d28d9;border-radius:3px;font-size:10px;cursor:pointer;font-weight:bold;';
        quickPasteBtn.onclick = function(e) {
          e.preventDefault(); e.stopPropagation();
          pasteAndVerifyToken(controller);
        };
        headerParent.appendChild(quickPasteBtn);
      }
    }
    log('[' + controller + '] Bearer token marked as EXPIRED (401/403 received)', 'error');
  }

  // v7.9.31: Paste from clipboard, save, verify by querying workspaces, then detect workspace via XPath
  function pasteAndVerifyToken(controller) {
    var titleId = controller === 'loop' ? 'loop-bearer-title' : 'combo-bearer-title';
    var inputId = controller === 'loop' ? 'loop-bearer-input' : 'ahk-bearer-token-input';
    var pasteBtnId = controller === 'loop' ? 'loop-quick-paste-btn' : 'combo-quick-paste-btn';
    var titleEl = document.getElementById(titleId);

    navigator.clipboard.readText().then(function(clipText) {
      var val = (clipText || '').trim();
      if (!val || val.length < 10) {
        log('pasteAndVerify: invalid clipboard (len=' + (val ? val.length : 0) + ')', 'error');
        if (titleEl) { titleEl.textContent = 'Bearer Token ⚠️ invalid clipboard!'; titleEl.style.color = '#ef4444'; }
        setTimeout(function() { if (titleEl) { titleEl.style.color = '#67e8f9'; titleEl.textContent = 'Bearer Token ⚠️ (not set)'; } }, 2500);
        return;
      }
      var inp = document.getElementById(inputId);
      if (inp) {
        inp.value = val;
        inp.style.borderColor = '#0e7490';
        inp.style.boxShadow = 'none';
      }
      saveBearerTokenToStorage(val);
      log('pasteAndVerify: token saved (' + val.length + ' chars) — verifying...', 'success');
      if (titleEl) { titleEl.textContent = 'Bearer Token 🔄 Verifying...'; titleEl.style.color = '#facc15'; }

      // Verify by querying workspaces API
      var url = CREDIT_API_BASE + '/user/workspaces';
      var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + val };
      fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
        .then(function(resp) {
          if (!resp.ok) {
            log('pasteAndVerify: token verification FAILED — HTTP ' + resp.status, 'error');
            if (titleEl) { titleEl.textContent = 'Bearer Token 🔴 INVALID (HTTP ' + resp.status + ')'; titleEl.style.color = '#ef4444'; }
            setTimeout(function() { if (titleEl) { titleEl.style.color = '#67e8f9'; } }, 3000);
            return;
          }
          return resp.text().then(function(bodyText) {
            var data;
            try { data = JSON.parse(bodyText); } catch(e) { return; }
            log('pasteAndVerify: ✅ token is VALID — ' + (Array.isArray(data) ? data.length : '?') + ' workspaces returned', 'success');
            if (titleEl) { titleEl.textContent = 'Bearer Token ✅ Valid & saved (' + val.length + ' chars)'; titleEl.style.color = '#4ade80'; }
            setTimeout(function() { if (titleEl) { titleEl.style.color = '#67e8f9'; } }, 3000);
            // Remove the quick paste button
            var quickBtn = document.getElementById(pasteBtnId);
            if (quickBtn) quickBtn.remove();
            // Parse and update workspace data
            parseLoopApiResponse(data);
            // Detect workspace via XPath
            autoDetectLoopCurrentWorkspace(val).then(function() {
              syncCreditStateFromApi();
              updateUI();
              log('pasteAndVerify: workspace detection complete after token refresh', 'success');
            });
          });
        })
        .catch(function(err) {
          log('pasteAndVerify: network error — ' + err.message, 'error');
          if (titleEl) { titleEl.textContent = 'Bearer Token ⚠️ network error'; titleEl.style.color = '#ef4444'; }
        });
    }).catch(function(err) {
      log('pasteAndVerify: clipboard read failed — ' + err.message, 'error');
      if (titleEl) { titleEl.textContent = 'Bearer Token ⚠️ clipboard denied!'; titleEl.style.color = '#ef4444'; }
    });
  }


  // ============================================
  // Loop State
  // ============================================
  var state = {
    running: false,
    direction: 'down',
    cycleCount: 0,
    countdown: 0,
    isIdle: false,
    isDelegating: false,
    forceDirection: null,  // v6.55: 'up'/'down' when Force button triggered, null otherwise
    delegateStartTime: 0,
    loopIntervalId: null,
    countdownIntervalId: null,
    workspaceName: '',
    hasFreeCredit: false,
    lastStatusCheck: 0,
    statusRefreshId: null,
    workspaceJustChanged: false,
    workspaceChangedTimer: null,
    workspaceObserverActive: false,
    workspaceFromApi: false  // v7.9.16: true once API has authoritatively set workspace name
  };

  // v7.9.16: Validate a name against known workspace list
  // Prevents DOM observer from setting project name as workspace name
  function isKnownWorkspaceName(name) {
    if (!name) return false;
    var perWs = loopCreditState.perWorkspace || [];
    if (perWs.length === 0) return false; // v7.9.18: Don't allow unvalidated names — wait for API data
    for (var i = 0; i < perWs.length; i++) {
      var ws = perWs[i];
      if (ws.fullName === name || ws.name === name) return true;
      // Partial match for truncated/formatted names
      if (ws.fullName && ws.fullName.toLowerCase().indexOf(name.toLowerCase()) !== -1) return true;
      if (ws.name && ws.name.toLowerCase().indexOf(name.toLowerCase()) !== -1) return true;
    }
    return false;
  }

  // ============================================
  // Workspace Auto-Check Interval (ms) - independent of loop
  // Opens project dialog every N seconds to check workspace name + credit
  // Configurable via config.ini WorkspaceCheckIntervalMs (default 5000)
  // ============================================

  // ============================================
  // Workspace Name - uses CONFIG.WORKSPACE_XPATH (from config.ini, editable in UI)
  // ============================================

   function fetchWorkspaceName() {
    var wsXpath = CONFIG.WORKSPACE_XPATH;
    if (!wsXpath || wsXpath.indexOf('__') === 0) {
      log('Workspace XPath not configured (placeholder not replaced)', 'warn');
      return;
    }
    try {
      log('Fetching workspace name from XPath: ' + wsXpath, 'check');
      var el = getByXPath(wsXpath);
      if (el) {
        var name = (el.textContent || '').trim();
        if (name) {
          // v7.9.16: Validate against known workspaces to avoid picking up project name
          if (!isKnownWorkspaceName(name)) {
            logSub('Workspace XPath returned "' + name + '" — not a known workspace, skipping', 1);
          } else if (state.workspaceFromApi) {
            logSub('Workspace XPath returned "' + name + '" — ignoring, API already set: ' + state.workspaceName, 1);
          } else if (name !== state.workspaceName) {
            var oldName = state.workspaceName;
            state.workspaceName = name;
            log('Workspace name: ' + name, 'success');
            // Track workspace change if we had a previous name
            if (oldName && oldName !== name) {
              addWorkspaceChangeEntry(oldName, name);
            }
          } else {
            logSub('Workspace unchanged: ' + name, 1);
          }
        } else {
          log('Workspace element found but text is empty', 'warn');
        }
      } else {
        log('Workspace element NOT FOUND at XPath: ' + wsXpath, 'warn');
      }
      updateUI();
    } catch (e) {
      log('fetchWorkspaceName error: ' + e.message, 'error');
    }
  }

  // ============================================
  // v6.55: Fetch workspace name from persistent nav element (NO dialog needed)
  // Uses WorkspaceNavXPath — reads from top-left nav, always visible
  // ============================================
  function fetchWorkspaceNameFromNav() {
    var navXpath = CONFIG.WORKSPACE_NAV_XPATH;
    var hasXpath = navXpath && navXpath.indexOf('__') !== 0 && navXpath !== '';
    try {
      var el = null;
      // Try XPath first
      if (hasXpath) {
        el = getByXPath(navXpath);
      }
      // Fallback: auto-discover
      if (!el) {
        el = autoDiscoverWorkspaceNavElement();
      }
      if (el) {
        var name = (el.textContent || '').trim();
        if (name) {
          // v7.9.16: Validate against known workspaces
          if (!isKnownWorkspaceName(name)) {
            logSub('Nav returned "' + name + '" — not a known workspace, skipping', 1);
            return false;
          }
          if (state.workspaceFromApi) {
            logSub('Nav returned "' + name + '" — ignoring, API already set: ' + state.workspaceName, 1);
            return true;
          }
          if (name !== state.workspaceName) {
            var oldName = state.workspaceName;
            state.workspaceName = name;
            log('Workspace name (from nav): ' + name, 'success');
            if (oldName && oldName !== name) {
              addWorkspaceChangeEntry(oldName, name);
            }
          } else {
            logSub('Workspace unchanged (nav): ' + name, 1);
          }
          updateUI();
          return true;
        }
      }
      logSub('Nav workspace element not found or empty', 1);
      return false;
    } catch (e) {
      log('fetchWorkspaceNameFromNav error: ' + e.message, 'error');
      return false;
    }
  }

  // ============================================
  // v6.56: Workspace MutationObserver — always-on, even when loop is stopped
  // Watches the nav element for text changes and auto-updates workspace name
  // ============================================
  var workspaceObserverInstance = null;
  var workspaceObserverRetryCount = 0;
  var WORKSPACE_OBSERVER_MAX_RETRIES = 10;

  // ============================================
  // v7.1: Auto-discover workspace name element via CSS selectors
  // Fallback when WorkspaceNavXPath is empty or fails
  // Tries common Lovable.dev nav patterns
  // ============================================
  function autoDiscoverWorkspaceNavElement() {
    // Strategy 1: Look for nav button with workspace-like text (not "Projects", not icons)
    var candidates = [];

    // Try: nav area buttons/links that contain team/workspace name
    var navButtons = document.querySelectorAll('nav button, nav a, nav span, [role="navigation"] button');
    for (var i = 0; i < navButtons.length; i++) {
      var el = navButtons[i];
      var text = (el.textContent || '').trim();
      // Skip empty, very short, or known non-workspace texts
      if (!text || text.length < 2 || text.length > 60) continue;
      if (/^(Projects?|Settings|Home|Menu|Sign|Log|Help|Docs|\+|×|☰|⋮)$/i.test(text)) continue;
      // Skip if it's just an icon or single character
      if (text.length <= 2 && /[^a-zA-Z0-9]/.test(text)) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top < 80) {
        candidates.push({ el: el, text: text, y: rect.top, x: rect.left });
      }
    }

    // Strategy 2: Look for the first visible text element in the top-left nav area
    if (candidates.length === 0) {
      var topNavEls = document.querySelectorAll('nav div span, nav div p, nav div a, header span, header a');
      for (var j = 0; j < topNavEls.length; j++) {
        var el2 = topNavEls[j];
        var text2 = (el2.textContent || '').trim();
        if (!text2 || text2.length < 3 || text2.length > 60) continue;
        var rect2 = el2.getBoundingClientRect();
        if (rect2.width > 0 && rect2.height > 0 && rect2.top < 80 && rect2.left < 400) {
          // Check it's a leaf node (no child elements with different text)
          if (el2.children.length === 0 || el2.children.length === 1) {
            candidates.push({ el: el2, text: text2, y: rect2.top, x: rect2.left });
          }
        }
      }
    }

    if (candidates.length > 0) {
      // Pick the first candidate in the top-left area
      candidates.sort(function(a, b) { return a.y - b.y || a.x - b.x; });
      var best = candidates[0];
      log('Auto-discovered workspace nav element: "' + best.text + '" <' + best.el.tagName.toLowerCase() + '> at (' + Math.round(best.x) + ',' + Math.round(best.y) + ')', 'success');
      return best.el;
    }

    return null;
  }

  function startWorkspaceObserver() {
    var navXpath = CONFIG.WORKSPACE_NAV_XPATH;
    var hasXpath = navXpath && navXpath.indexOf('__') !== 0 && navXpath !== '';
    var navEl = null;

    // Try XPath first
    if (hasXpath) {
      navEl = getByXPath(navXpath);
      if (navEl) {
        logSub('Workspace nav element found via XPath', 1);
      }
    }

    // Fallback: auto-discover via CSS selectors
    if (!navEl) {
      if (hasXpath) {
        log('WorkspaceNavXPath configured but element not found — trying auto-discovery', 'warn');
      } else {
        logSub('WorkspaceNavXPath not configured — trying auto-discovery', 1);
      }
      navEl = autoDiscoverWorkspaceNavElement();
    }

    if (!navEl) {
      workspaceObserverRetryCount++;
      if (workspaceObserverRetryCount < WORKSPACE_OBSERVER_MAX_RETRIES) {
        var retryDelay = Math.min(workspaceObserverRetryCount * 3000, 15000);
        log('Workspace observer: element not found — retry ' + workspaceObserverRetryCount + '/' + WORKSPACE_OBSERVER_MAX_RETRIES + ' in ' + (retryDelay/1000) + 's', 'warn');
        setTimeout(startWorkspaceObserver, retryDelay);
      } else {
        log('Workspace observer: gave up after ' + WORKSPACE_OBSERVER_MAX_RETRIES + ' retries. Set WorkspaceNavXPath in config.ini.', 'error');
      }
      return;
    }

    workspaceObserverRetryCount = 0;

    // Disconnect previous observer if any
    if (workspaceObserverInstance) {
      workspaceObserverInstance.disconnect();
      logSub('Previous workspace observer disconnected', 1);
    }

    // Initial read — v7.9.16: validate against known workspaces
    var name = (navEl.textContent || '').trim();
    if (name && name !== state.workspaceName) {
      if (!isKnownWorkspaceName(name)) {
        logSub('Observer init: "' + name + '" not a known workspace — skipping (API will detect)', 1);
      } else if (state.workspaceFromApi) {
        logSub('Observer init: "' + name + '" — ignoring, API already set: ' + state.workspaceName, 1);
      } else {
        var oldName = state.workspaceName;
        state.workspaceName = name;
        log('Workspace name (observer init): ' + name, 'success');
        if (oldName && oldName !== name) {
          addWorkspaceChangeEntry(oldName, name);
        }
        updateUI();
      }
    } else if (name) {
      logSub('Workspace name already set: ' + name, 1);
    }

    // Install MutationObserver — watch the element AND its parent for re-renders
    workspaceObserverInstance = new MutationObserver(function(mutations) {
      // Check if our target element was removed from DOM (SPA re-render)
      if (!document.contains(navEl)) {
        log('Workspace nav element removed from DOM — restarting observer', 'warn');
        workspaceObserverInstance.disconnect();
        state.workspaceObserverActive = false;
        setTimeout(startWorkspaceObserver, 2000);
        return;
      }

      var newName = (navEl.textContent || '').trim();
      // v7.9.16: Validate against known workspaces before accepting
      if (!isKnownWorkspaceName(newName)) {
        logSub('Observer mutation: "' + newName + '" not a known workspace — ignoring', 1);
        return;
      }
      if (state.workspaceFromApi) {
        logSub('Observer mutation: "' + newName + '" — ignoring, API already set: ' + state.workspaceName, 1);
        return;
      }
      if (newName && newName !== state.workspaceName) {
        var oldName = state.workspaceName;
        state.workspaceName = newName;
        log('⚡ Workspace changed (observer): "' + oldName + '" → "' + newName + '"', 'success');
        if (oldName) addWorkspaceChangeEntry(oldName, newName);

        // 2. Show temporary "WS Changed" indicator
        state.workspaceJustChanged = true;
        if (state.workspaceChangedTimer) clearTimeout(state.workspaceChangedTimer);
        state.workspaceChangedTimer = setTimeout(function() {
          state.workspaceJustChanged = false;
          updateUI();
        }, 10000); // Clear after 10 seconds

        // 3. Update UI immediately
        updateUI();

        // 4. Check free credit on workspace change
        triggerCreditCheckOnWorkspaceChange();
      }
    });

    workspaceObserverInstance.observe(navEl, { childList: true, characterData: true, subtree: true });
    state.workspaceObserverActive = true;
    log('✅ Workspace MutationObserver installed on nav element', 'success');
  }

  // ============================================
  // v6.56: On workspace change → check free credit
  // Opens project dialog, checks credit bar, closes dialog, updates UI
  // ============================================
  function triggerCreditCheckOnWorkspaceChange() {
    log('Workspace changed — checking free credit...', 'check');

    // Skip if user is typing in prompt
    if (isUserTypingInPrompt()) {
      log('Skipping credit check — user is typing in prompt', 'skip');
      return;
    }

    var opened = ensureProjectDialogOpen();
    if (!opened) {
      log('Could not open project dialog for credit check', 'warn');
      return;
    }

    pollForDialogReady(function() {
      var hasCredit = checkSystemBusy();
      state.hasFreeCredit = hasCredit;
      state.isIdle = !hasCredit;
      state.lastStatusCheck = Date.now();
      log('Credit check after workspace change: ' + (hasCredit ? 'FREE CREDIT' : 'NO CREDIT'), hasCredit ? 'success' : 'warn');
      closeProjectDialog();
      updateUI();
    });
  }

  // Expose for console usage
  window.__startWorkspaceObserver = startWorkspaceObserver;

  // ============================================
  // Workspace Change History (localStorage)
  // ============================================
  function addWorkspaceChangeEntry(fromName, toName) {
    try {
      var history = JSON.parse(localStorage.getItem(WS_HISTORY_KEY) || '[]');
      var now = new Date();
      history.push({
        from: fromName,
        to: toName,
        time: now.toISOString(),
        display: now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      });
      // Keep max 50 entries
      if (history.length > 50) history = history.slice(history.length - 50);
      localStorage.setItem(WS_HISTORY_KEY, JSON.stringify(history));
      log('Workspace changed: "' + fromName + '" → "' + toName + '" (history saved)', 'success');
    } catch (e) { /* storage error */ }
  }

  function getWorkspaceHistory() {
    try {
      return JSON.parse(localStorage.getItem(WS_HISTORY_KEY) || '[]');
    } catch (e) { return []; }
  }

  function clearWorkspaceHistory() {
    try { localStorage.removeItem(WS_HISTORY_KEY); } catch (e) { /* ignore */ }
  }

  // ============================================
  // Utility Functions
  // ============================================
  function getByXPath(xpath) {
    if (!xpath) {
      log('XPath is empty or undefined', 'error');
      return null;
    }
    try {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch (e) {
      log('XPath evaluation error: ' + e.message, 'error');
      log('Problematic XPath: ' + xpath, 'error');
      return null;
    }
  }

  function getAllByXPath(xpath) {
    if (!xpath) {
      log('XPath is empty or undefined', 'error');
      return [];
    }
    try {
      var result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      var nodes = [];
      for (var i = 0; i < result.snapshotLength; i++) {
        nodes.push(result.snapshotItem(i));
      }
      return nodes;
    } catch (e) {
      log('XPath evaluation error: ' + e.message, 'error');
      log('Problematic XPath: ' + xpath, 'error');
      return [];
    }
  }

  // ============================================
  // S-001: Generic findElement() with multi-method fallback
  // descriptor: { name, xpath, textMatch, tag, selector, role, ariaLabel }
  // ============================================
  function findElement(descriptor) {
    var name = descriptor.name || 'unknown';
    log('findElement: Searching for "' + name + '"', 'check');

    // Method 1: Configured XPath
    if (descriptor.xpath) {
      log('  Method 1 (XPath) for ' + name + ': ' + descriptor.xpath, 'check');
      var xpathResult = getByXPath(descriptor.xpath);
      if (xpathResult) {
        log('  ' + name + ' FOUND via XPath: ' + descriptor.xpath, 'success');
        return xpathResult;
      }
      log('  ' + name + ' XPath failed: ' + descriptor.xpath + ' — trying fallbacks', 'warn');
    }

    // Method 2: Text-based scan
    if (descriptor.textMatch) {
      var tag = descriptor.tag || 'button';
      var texts = Array.isArray(descriptor.textMatch) ? descriptor.textMatch : [descriptor.textMatch];
      log('  Method 2 (text scan): looking in <' + tag + '> for ' + JSON.stringify(texts), 'check');
      var allTags = document.querySelectorAll(tag);
      for (var t = 0; t < allTags.length; t++) {
        var elText = (allTags[t].textContent || '').trim();
        for (var m = 0; m < texts.length; m++) {
          if (elText === texts[m] || elText.indexOf(texts[m]) !== -1) {
            log('  ' + name + ' FOUND via text: "' + elText.substring(0, 40) + '"', 'success');
            return allTags[t];
          }
        }
      }
    }

    // Method 3: CSS selector
    if (descriptor.selector) {
      var selectors = Array.isArray(descriptor.selector) ? descriptor.selector : [descriptor.selector];
      log('  Method 3 (CSS selector): trying ' + selectors.length + ' selectors', 'check');
      for (var s = 0; s < selectors.length; s++) {
        try {
          var sResult = document.querySelector(selectors[s]);
          if (sResult) {
            log('  ' + name + ' FOUND via selector: ' + selectors[s], 'success');
            return sResult;
          }
        } catch (e) { /* skip invalid */ }
      }
    }

    // Method 4: ARIA/role attributes
    if (descriptor.ariaLabel || descriptor.role) {
      log('  Method 4 (ARIA/role)', 'check');
      if (descriptor.ariaLabel) {
        var ariaLabels = Array.isArray(descriptor.ariaLabel) ? descriptor.ariaLabel : [descriptor.ariaLabel];
        for (var a = 0; a < ariaLabels.length; a++) {
          try {
            var ariaResult = document.querySelector('[aria-label*="' + ariaLabels[a] + '" i], [title*="' + ariaLabels[a] + '" i]');
            if (ariaResult) {
              log('  ' + name + ' FOUND via ARIA: ' + ariaLabels[a], 'success');
              return ariaResult;
            }
          } catch (e) { /* skip */ }
        }
      }
      if (descriptor.role) {
        var roleResult = document.querySelector('[role="' + descriptor.role + '"]');
        if (roleResult) {
          log('  ' + name + ' FOUND via role: ' + descriptor.role, 'success');
          return roleResult;
        }
      }
    }

    log('  All methods failed for "' + name + '"', 'error');
    return null;
  }

  // ============================================
  // S-001: Element descriptors for MacroLoop XPath elements
  // ============================================
  var ML_ELEMENTS = {
    PROJECT_BUTTON: {
      name: 'Project Button',
      xpath: CONFIG.PROJECT_BUTTON_XPATH,
      selector: ['nav button', 'nav div button', '[data-testid="project-button"]'],
      ariaLabel: ['project', 'Project'],
      tag: 'button'
    },
    PROGRESS: {
      name: 'Progress Bar',
      xpath: CONFIG.PROGRESS_XPATH,
      selector: ['[role="progressbar"]', '.progress-bar', '[class*="progress"]'],
      role: 'progressbar'
    }
  };

  function isOnProjectPage() {
    var url = window.location.href;
    return url.indexOf(CONFIG.REQUIRED_DOMAIN) !== -1 &&
           url.indexOf('/projects/') !== -1 &&
           url.indexOf('/settings') === -1;
  }

  // ============================================
  // Check if user is actively typing in the prompt area
  // If so, we should NOT open the project dialog (disrupts typing)
  // ============================================
  function isUserTypingInPrompt() {
    var promptXpath = CONFIG.PROMPT_ACTIVE_XPATH;
    if (!promptXpath || promptXpath.indexOf('__') === 0) return false;
    try {
      var promptEl = getByXPath(promptXpath);
      if (!promptEl) return false;
      // Check if the prompt area or any of its children has focus
      var activeEl = document.activeElement;
      if (!activeEl) return false;
      var isInPrompt = promptEl.contains(activeEl) || promptEl === activeEl;
      if (isInPrompt) {
        logSub('User is typing in prompt area — skipping dialog open', 1);
      }
      return isInPrompt;
    } catch (e) { return false; }
  }

  // ============================================
  // Check if system is busy (progress bar visible)
  // S-001: Now uses findElement with multi-method fallback
  // ============================================
  function checkSystemBusy() {
    var progressEl = findElement(ML_ELEMENTS.PROGRESS);
    if (!progressEl) {
      logSub('Progress bar element NOT found in DOM', 1);
      return false;
    }
    // Validate: element must have actual visible content (not just exist in DOM)
    var rect = progressEl.getBoundingClientRect();
    var isVisible = rect.width > 0 && rect.height > 0;
    var computedStyle = window.getComputedStyle(progressEl);
    var isHidden = computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.opacity === '0';
    var hasContent = (progressEl.textContent || '').trim().length > 0 || progressEl.children.length > 0;
    
    logSub('Progress bar check: visible=' + isVisible + ', hidden=' + isHidden + ', hasContent=' + hasContent + ', rect=' + Math.round(rect.width) + 'x' + Math.round(rect.height), 1);
    
    if (isHidden) {
      logSub('Progress bar exists but is HIDDEN (display/visibility/opacity) — treating as NO credit', 1);
      return false;
    }
    if (!isVisible) {
      logSub('Progress bar exists but has 0 size — treating as NO credit', 1);
      return false;
    }
    
    logSub('Progress bar is VISIBLE and has content — FREE CREDIT detected', 1);
    return true;
  }

  // ============================================
  // Poll for Main Progress Bar (dialog ready signal)
  // Polls every 200ms for up to DialogWaitMs (fallback timeout)
  // Calls back immediately when main bar appears — much faster than fixed wait
  // ============================================
  function pollForDialogReady(callback) {
    var mainXpath = CONFIG.MAIN_PROGRESS_XPATH;
    if (!mainXpath || mainXpath.indexOf('__') === 0) {
      log('MainProgressXPath not configured — falling back to fixed DialogWaitMs wait', 'warn');
      setTimeout(callback, TIMING.DIALOG_WAIT || 2000);
      return;
    }

    var pollInterval = 200; // ms between polls
    var maxWait = TIMING.DIALOG_WAIT || 3000; // fallback timeout
    var elapsed = 0;

    log('Polling for main progress bar (every ' + pollInterval + 'ms, max ' + maxWait + 'ms)...', 'check');

    var pollTimer = setInterval(function() {
      elapsed += pollInterval;
      var mainEl = getByXPath(mainXpath);
      if (mainEl) {
        var rect = mainEl.getBoundingClientRect();
        var isVisible = rect.width > 0 && rect.height > 0;
        if (isVisible) {
          clearInterval(pollTimer);
          log('Main progress bar FOUND after ' + elapsed + 'ms — waiting 500ms for dialog to fully render...', 'success');
          setTimeout(function() {
            log('Dialog settle delay complete — proceeding', 'check');
            callback();
          }, 500);
          return;
        }
      }

      if (elapsed >= maxWait) {
        clearInterval(pollTimer);
        log('Main progress bar NOT found after ' + maxWait + 'ms — proceeding anyway (timeout)', 'warn');
        callback();
      }
    }, pollInterval);
  }

  // ============================================
  // Close project dialog (toggle close if open)
  // ============================================
  function closeProjectDialog() {
    var btn = getByXPath(CONFIG.PROJECT_BUTTON_XPATH);
    if (!btn) {
      var fallbackBtn = findElement(ML_ELEMENTS.PROJECT_BUTTON);
      if (fallbackBtn) btn = fallbackBtn;
    }
    if (btn) {
      var isExpanded = btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open';
      if (isExpanded) {
        logSub('Closing project dialog', 1);
        reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
      }
    }
  }

  // ============================================
  // Click Project Button
  // S-001: Uses getAllByXPath first, then findElement() as fallback
  // ============================================
  // ============================================
  // Ensure project dialog is OPEN (not toggled closed)
  // Returns true if dialog is confirmed open, false if button not found
  // ============================================
  function ensureProjectDialogOpen() {
    log('Ensuring project dialog is OPEN...', 'check');
    log('Using XPath: ' + CONFIG.PROJECT_BUTTON_XPATH, 'check');

    var buttons = getAllByXPath(CONFIG.PROJECT_BUTTON_XPATH);

    if (buttons.length === 0) {
      log('XPath returned 0 matches, trying multi-method fallback...', 'warn');
      var fallbackBtn = findElement(ML_ELEMENTS.PROJECT_BUTTON);
      if (fallbackBtn) {
        buttons = [fallbackBtn];
      } else {
        log('PROJECT BUTTON NOT FOUND via XPath or fallback!', 'error');
        log('Please update the XPath in the panel below or in config.ini', 'warn');
        return false;
      }
    }

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var rect = btn.getBoundingClientRect();
      var isVisible = rect.width > 0 && rect.height > 0 &&
                      window.getComputedStyle(btn).visibility !== 'hidden' &&
                      window.getComputedStyle(btn).display !== 'none';

      if (isVisible) {
        var btnInfo = 'Button: ' + btn.tagName;
        if (btn.textContent) btnInfo += ', text: "' + btn.textContent.substring(0, 30) + '"';
        log(btnInfo, 'check');

        // CHECK: Is dialog already open? (aria-expanded=true means open)
        var isExpanded = btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open';
        if (isExpanded) {
          log('Dialog is ALREADY OPEN (aria-expanded=true) — skipping click', 'success');
          return true;
        }

        // Dialog is closed — click to open
        log('Dialog is CLOSED — clicking to open', 'check');
        highlightElement(btn, '#6ee7b7');

        try {
          reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
          log('Clicked Project Button successfully — dialog should now be opening', 'success');
          return true;
        } catch (e) {
          log('Click failed on button ' + i + ': ' + e.message, 'error');
          continue;
        }
      } else {
        log('Button ' + i + ' is not visible, skipping...', 'skip');
      }
    }

    log('PROJECT BUTTON NOT FOUND! (' + buttons.length + ' matches but none are valid)', 'error');
    return false;
  }

  // Legacy alias
  function clickProjectButton() {
    return ensureProjectDialogOpen();
  }

  // ============================================
  // Highlight element with CSS
  // ============================================
  function highlightElement(el, color) {
    if (!el) return;
    el.style.outline = '3px solid ' + (color || '#ec4899');
    el.style.outlineOffset = '2px';
    el.style.boxShadow = '0 0 10px ' + (color || '#ec4899');
    setTimeout(function() {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.boxShadow = '';
    }, 3000);
  }

  // ============================================
  // Check Button Function - Manual test
  // v7.9.30: Also detects workspace via XPath after progress check
  // ============================================
  function runCheck() {
    log('=== MANUAL CHECK START ===', 'check');

    // Step 1: Detect workspace via Project Dialog XPath
    log('Step 1: Detecting workspace via Project Dialog XPath...', 'check');
    var perWs = loopCreditState.perWorkspace || [];
    if (perWs.length > 0) {
      detectWorkspaceViaProjectDialog('runCheck', perWs).then(function() {
        log('Step 1 complete: workspace="' + state.workspaceName + '"', 'success');
        syncCreditStateFromApi();
        updateUI();
        continueCheck();
      });
    } else {
      log('Step 1 skipped: no workspaces loaded — fetching credits first', 'warn');
      fetchLoopCredits();
      continueCheck();
    }

    function continueCheck() {
      // Step 2: Check progress bar
      setTimeout(function() {
        log('Step 2: Checking Progress Bar...', 'check');
        log('Using XPath: ' + CONFIG.PROGRESS_XPATH + ' (+ fallbacks)', 'check');
        var progressEl = findElement(ML_ELEMENTS.PROGRESS);

        if (progressEl) {
          log('Progress Bar FOUND at XPath - System is BUSY', 'warn');
          highlightElement(progressEl, '#fbbf24');
          state.isIdle = false;
        } else {
          log('Progress Bar NOT FOUND at XPath - System is IDLE', 'success');
          state.isIdle = true;
        }

        updateUI();
        log('=== MANUAL CHECK COMPLETE ===', 'check');
      }, 500);
    }
  }

  // ============================================
  // Update XPath from UI
  // ============================================
  function updateProjectButtonXPath(newXPath) {
    if (newXPath && newXPath.trim()) {
      CONFIG.PROJECT_BUTTON_XPATH = newXPath.trim();
      ML_ELEMENTS.PROJECT_BUTTON.xpath = newXPath.trim();
      log('Project Button XPath updated to: ' + CONFIG.PROJECT_BUTTON_XPATH, 'success');
      return true;
    }
    return false;
  }

  function updateProgressXPath(newXPath) {
    if (newXPath && newXPath.trim()) {
      CONFIG.PROGRESS_XPATH = newXPath.trim();
      ML_ELEMENTS.PROGRESS.xpath = newXPath.trim();
      log('Progress Bar XPath updated to: ' + CONFIG.PROGRESS_XPATH, 'success');
      return true;
    }
    return false;
  }

  function updateWorkspaceXPath(newXPath) {
    if (newXPath && newXPath.trim()) {
      CONFIG.WORKSPACE_XPATH = newXPath.trim();
      log('Workspace XPath updated to: ' + CONFIG.WORKSPACE_XPATH, 'success');
      return true;
    }
    return false;
  }

  // ============================================
  // DEPRECATED (v7.9.6): Signal AHK via Clipboard
  // No longer used — workspace moves are now handled directly via API (moveToAdjacentWorkspace).
  // Kept for reference only. See performDirectMove() for the replacement.
  // ============================================
  function dispatchDelegateSignal(direction) {
    var signal = direction === 'up' ? 'DELEGATE_UP' : 'DELEGATE_DOWN';
    // v6.53: Embed full URL in title signal so AHK can extract project ID
    // without fragile Ctrl+L/Ctrl+C address bar reads
    var currentUrl = window.location.href;
    var titleMarker = '__AHK_' + signal + '__URL:' + currentUrl + '__ENDURL__';
    
    // PRIMARY: Use document.title (always works, no focus requirement)
    var cleanTitle = document.title.replace(/__AHK_DELEGATE_(UP|DOWN)__URL:.*?__ENDURL__/g, '').replace(/__AHK_DELEGATE_(UP|DOWN)__/g, '');
    document.title = titleMarker + cleanTitle;
    log('DEPRECATED: Title signal set: ' + titleMarker, 'delegate');
    
    // SECONDARY: Also try clipboard (works for user-gesture triggers like Force buttons)
    try {
      navigator.clipboard.writeText(signal).catch(function() {
        // Clipboard failed (expected when DevTools focused) - title signal is primary
      });
    } catch (e) { /* ignore */ }
  }

  // ============================================
  // v7.9.6: Direct API Move — replaces AHK delegation entirely.
  // No tab switching, no clipboard signals, no title markers.
  // Just calls moveToAdjacentWorkspace() which does PUT /move-to-workspace.
  // ============================================
  function performDirectMove(direction) {
    log('=== DIRECT API MOVE ' + direction.toUpperCase() + ' ===', 'delegate');
    logSub('v7.9.6: Using moveToAdjacentWorkspace() — no AHK delegation', 1);
    state.isDelegating = true;
    state.forceDirection = direction;
    state.delegateStartTime = Date.now();
    updateUI();

    try {
      moveToAdjacentWorkspace(direction);
      // moveToAdjacentWorkspace is async (fetch) — give it time to complete
      setTimeout(function() {
        state.isDelegating = false;
        state.forceDirection = null;
        state.delegateStartTime = 0;
        state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
        log('Direct API move complete (' + direction.toUpperCase() + ')', 'success');
        // Refresh credit/workspace data after move
        fetchLoopCredits();
        updateUI();
      }, 3000);
    } catch (err) {
      log('Direct API move FAILED: ' + err.message, 'error');
      state.isDelegating = false;
      state.forceDirection = null;
      state.delegateStartTime = 0;
      updateUI();
    }
  }

  // ============================================
  // UI Update Functions
  // ============================================
  function updateUI() {
    updateStatus();
    updateButtons();
    updateRecordIndicator();
    populateLoopWorkspaceDropdown();
  }

  function updateStatus() {
    var el = document.getElementById(IDS.STATUS);
    if (!el) return;

    // Workspace name fragment (inline, yellow, bold)
    var wsFragment = '';
    if (state.workspaceName) {
      wsFragment = '<span style="color:#fbbf24;font-weight:700;">' + state.workspaceName + '</span>';
      // v6.56: Show temporary "WS Changed" indicator
      if (state.workspaceJustChanged) {
        wsFragment += ' <span style="color:#f97316;font-size:10px;font-weight:bold;">⚡ WS Changed</span>';
      }
      wsFragment += ' | ';
    }

    // Build credit bar section matching workspace item format (if API data available)
    var creditBarsHtml = '';
    if (loopCreditState.lastCheckedAt) {
      var cws = loopCreditState.currentWs;
      if (cws) {
        var df = cws.dailyFree || 0;
        var ro = cws.rollover || 0;
        var ba = cws.billingAvailable || 0;
        var fr = cws.freeRemaining || 0; // credits_granted remaining
        // Use same Total Credits formula as workspace items
        var _totalCapacity = cws.totalCredits || calcTotalCredits(cws.freeGranted, cws.dailyLimit, cws.limit, cws.topupLimit, cws.rolloverLimit);
        var _availTotal = cws.available || calcAvailableCredits(_totalCapacity, cws.rolloverUsed, cws.dailyUsed, cws.used);
        var _bp = _totalCapacity > 0 ? Math.max(ba > 0 ? 2 : 0, Math.round(ba / _totalCapacity * 100)) : 0;
        var _rp = _totalCapacity > 0 ? Math.max(ro > 0 ? 2 : 0, Math.round(ro / _totalCapacity * 100)) : 0;
        var _dp = _totalCapacity > 0 ? Math.max(df > 0 ? 2 : 0, Math.round(df / _totalCapacity * 100)) : 0;
        var _fp = _totalCapacity > 0 ? Math.max(fr > 0 ? 2 : 0, Math.round(fr / _totalCapacity * 100)) : 0;

        creditBarsHtml += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">';
        creditBarsHtml += '<div title="Available: ' + _availTotal + ' / Total: ' + _totalCapacity + ' (Used: ' + (cws.totalCreditsUsed || 0) + ')" style="flex:1;height:12px;background:rgba(239,68,68,0.25);border-radius:5px;overflow:hidden;display:flex;min-width:100px;max-width:260px;border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 3px rgba(0,0,0,0.3);">';
        if (ba > 0) creditBarsHtml += '<div title="💰 Billing: ' + ba + '" style="width:' + _bp + '%;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>';
        if (ro > 0) creditBarsHtml += '<div title="🔄 Rollover: ' + ro + '" style="width:' + _rp + '%;height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);"></div>';
        if (df > 0) creditBarsHtml += '<div title="📅 Daily: ' + df + '" style="width:' + _dp + '%;height:100%;background:linear-gradient(90deg,#d97706,#facc15);"></div>';
        if (fr > 0) creditBarsHtml += '<div title="🎁 Granted: ' + fr + '" style="width:' + _fp + '%;height:100%;background:linear-gradient(90deg,#f97316,#fb923c);"></div>';
        creditBarsHtml += '</div>';
        creditBarsHtml += '<span style="font-size:10px;white-space:nowrap;font-family:monospace;line-height:1;">';
        creditBarsHtml += '<span style="color:#4ade80;" title="💰 Billing = credits remaining in billing period">💰' + ba + '</span> ';
        creditBarsHtml += '<span style="color:#c4b5fd;" title="🔄 Rollover = unused credits carried from previous period">🔄' + ro + '</span> ';
        creditBarsHtml += '<span style="color:#facc15;" title="📅 Daily Free = free credits refreshed daily">📅' + df + '</span> ';
        if (fr > 0) creditBarsHtml += '<span style="color:#fb923c;" title="🎁 Granted = promotional credits remaining">🎁' + fr + '</span> ';
        creditBarsHtml += '<span style="color:#22d3ee;font-weight:700;" title="⚡ Available = Total - rolloverUsed - dailyUsed - billingUsed">⚡' + _availTotal + '</span>';
        creditBarsHtml += '<span style="color:#94a3b8;font-size:9px;" title="Total Credits = granted + daily + billing + topup + rollover">/' + _totalCapacity + '</span>';
        creditBarsHtml += '</span></div>';
      }
    }

    if (state.running) {
      var hasFreeCredit = !state.isIdle;
      var creditIcon = hasFreeCredit ? '[Y]' : '[N]';
      var creditColor = hasFreeCredit ? '#10b981' : '#ef4444';
      var creditLabel = hasFreeCredit ? 'Free Credit' : 'No Credit';
      var creditText = '<span style="color:' + creditColor + ';">' + creditIcon + ' ' + creditLabel + '</span>';
      var delegateText = '';
      if (state.isDelegating) {
        if (state.forceDirection) {
          delegateText = ' | <span style="color:#f97316;font-weight:bold;">FORCE ' + state.forceDirection.toUpperCase() + '</span>';
        } else {
          delegateText = ' | <span style="color:#3b82f6;">SWITCHING...</span>';
        }
      }
      var totalSec = Math.floor(TIMING.LOOP_INTERVAL / 1000);
      var pct = totalSec > 0 ? Math.max(0, Math.min(100, ((totalSec - state.countdown) / totalSec) * 100)) : 0;
      var barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#10b981';

      var statusLine = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">'
        + wsFragment
        + '<span style="color:#10b981;">*</span> '
        + state.direction.toUpperCase()
        + ' | #' + state.cycleCount
        + ' | ' + creditText
        + ' | <span style="color:#fbbf24;font-weight:bold;">' + state.countdown + 's</span>'
        + delegateText
        + '</div>';

      var progressBar = '<div style="width:100%;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;">'
        + '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:3px;transition:width 0.8s linear;"></div>'
        + '</div>';

      el.innerHTML = statusLine + progressBar + creditBarsHtml;
    } else {
      var creditInfoStop = '';
      if (state.lastStatusCheck > 0) {
        var creditIconStop = state.hasFreeCredit ? '[Y]' : '[N]';
        var creditColorStop = state.hasFreeCredit ? '#10b981' : '#ef4444';
        var creditLabelStop = state.hasFreeCredit ? 'Free Credit' : 'No Credit';
        creditInfoStop = ' | <span style="color:' + creditColorStop + ';">' + creditIconStop + ' ' + creditLabelStop + '</span>';
      }
      el.innerHTML = wsFragment + '<span style="color:#9ca3af;">[=]</span> Stopped | Cycles: ' + state.cycleCount + creditInfoStop + creditBarsHtml;
    }
  }

  function updateButtons() {
    var startBtn = document.getElementById(IDS.START_BTN);
    var stopBtn = document.getElementById(IDS.STOP_BTN);

    if (startBtn) {
      startBtn.disabled = state.running;
      startBtn.style.opacity = state.running ? '0.5' : '1';
      startBtn.style.cursor = state.running ? 'not-allowed' : 'pointer';
    }
    if (stopBtn) {
      stopBtn.disabled = !state.running;
      stopBtn.style.opacity = state.running ? '1' : '0.5';
      stopBtn.style.cursor = state.running ? 'pointer' : 'not-allowed';
    }
  }

  function updateRecordIndicator() {
    var el = document.getElementById(IDS.RECORD_INDICATOR);
    if (!el) return;
    
    if (state.running) {
      el.style.display = 'flex';
      if (state.isDelegating) {
        if (state.forceDirection) {
          // v6.55: Distinct Force indicator (orange)
          el.innerHTML = '<span style="width:10px;height:10px;background:#f97316;border-radius:50%;display:inline-block;"></span> FORCE ' + state.forceDirection.toUpperCase();
          el.style.background = '#c2410c';
        } else {
          el.innerHTML = '<span style="width:10px;height:10px;background:#3b82f6;border-radius:50%;display:inline-block;"></span> SWITCHING';
          el.style.background = '#1d4ed8';
        }
      } else {
        el.innerHTML = '<span style="width:10px;height:10px;background:#fff;border-radius:50%;display:inline-block;"></span> LOOP';
        el.style.background = '#dc2626';
      }
    } else {
      el.style.display = 'none';
    }
  }

  // ============================================
  // Loop Control
  // ============================================
  function startLoop(direction) {
    if (state.running) {
      log('Cannot start - loop is already running', 'warn');
      return false;
    }

    if (!isOnProjectPage()) {
      log('Cannot start - must be on a lovable.dev project page (not settings)', 'error');
      return false;
    }

    state.running = true;
    state.direction = direction || 'down';
    state.cycleCount = 0;
    state.isIdle = true;
    state.isDelegating = false;
    state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);

    log('=== LOOP STARTED ===', 'success');
    log('Direction: ' + state.direction.toUpperCase(), 'success');
    log('Interval: ' + (TIMING.LOOP_INTERVAL/1000) + 's');
    log('Project Button XPath: ' + CONFIG.PROJECT_BUTTON_XPATH);
    log('Progress XPath: ' + CONFIG.PROGRESS_XPATH);

    // Start countdown timer
    state.countdownIntervalId = setInterval(function() {
      if (state.countdown > 0) state.countdown--;
      updateStatus();
    }, TIMING.COUNTDOWN_INTERVAL);

    // Start main loop
    state.loopIntervalId = setInterval(runCycle, TIMING.LOOP_INTERVAL);

    // Run first cycle after short delay
    setTimeout(runCycle, TIMING.FIRST_CYCLE_DELAY);

    updateUI();
    return true;
  }

  function stopLoop() {
    if (!state.running) {
      return false;
    }

    state.running = false;
    state.isDelegating = false;
    state.forceDirection = null;  // v6.55

    if (state.loopIntervalId) {
      clearInterval(state.loopIntervalId);
      state.loopIntervalId = null;
    }
    if (state.countdownIntervalId) {
      clearInterval(state.countdownIntervalId);
      state.countdownIntervalId = null;
    }

    log('=== LOOP STOPPED ===', 'success');
    log('Total cycles completed: ' + state.cycleCount);
    updateUI();
    return true;
  }

  // ============================================
  // v7.9.7: Sync state.hasFreeCredit from API credit data
  // Called after every fetchLoopCredits() to keep loop state in sync
  // ============================================
  function syncCreditStateFromApi() {
    var cws = loopCreditState.currentWs;
    if (!cws) {
      logSub('syncCreditState: no currentWs — cannot determine credit', 1);
      return;
    }
    var hasCredit = (cws.available || 0) > 0;
    state.hasFreeCredit = hasCredit;
    state.isIdle = !hasCredit;
    state.lastStatusCheck = Date.now();
    log('API Credit Sync: ' + cws.fullName + ' available=' + cws.available + ' → ' + (hasCredit ? 'HAS CREDIT' : 'NO CREDIT'), hasCredit ? 'success' : 'warn');
  }

  // ============================================
  // Run Cycle - v7.9.7: API-based credit check (no dialog needed)
  // Fetches credit data via API, checks available credits, moves if depleted
  // ============================================
  function runCycle() {
    // Check 1: Is loop running?
    if (!state.running) {
      log('SKIP: Loop not running', 'skip');
      return;
    }
    
    // Check 2: Are we waiting for move to complete? (with 60s timeout)
    if (state.isDelegating) {
      var elapsed = state.delegateStartTime ? (Date.now() - state.delegateStartTime) / 1000 : 0;
      if (elapsed > 60) {
        log('Move timeout after ' + Math.floor(elapsed) + 's - auto-recovering', 'warn');
        state.isDelegating = false;
        state.forceDirection = null;
        state.delegateStartTime = 0;
        updateUI();
      } else {
        log('SKIP: Waiting for API move (' + Math.floor(elapsed) + 's)', 'skip');
        return;
      }
    }

    state.cycleCount++;
    state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
    log('--- Cycle #' + state.cycleCount + ' ---');

    // Step 0: Check if user is typing in prompt — skip cycle to avoid disruption
    if (isUserTypingInPrompt()) {
      log('SKIP: User is typing in prompt area', 'skip');
      return;
    }

    // Step 1: Fetch fresh credit data via API (v7.9.7 — replaces DOM dialog checking)
    log('Step 1: Fetching credit data via API...', 'check');
    
    var url = CREDIT_API_BASE + '/user/workspaces';
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    var token = getBearerTokenFromStorage();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    // v7.9.24: Comprehensive fetch logging
    log('Cycle API: GET ' + url, 'check');
    logSub('Auth: ' + (token ? 'Bearer ' + token.substring(0, 12) + '...REDACTED' : 'cookies only'), 1);

    fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
      .then(function(resp) {
        var respContentType = resp.headers.get('content-type') || '(none)';
        var respContentLength = resp.headers.get('content-length') || '(not set)';
        log('Cycle API: Response status=' + resp.status + ' content-type="' + respContentType + '" content-length=' + respContentLength, 'check');

        // v7.9.27: Mark bearer token expired on 401/403
        if ((resp.status === 401 || resp.status === 403) && token) {
          markBearerTokenExpired('loop');
        }

        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.text().then(function(bodyText) {
          log('Cycle API: Body length=' + bodyText.length + ' preview="' + bodyText.substring(0, 200) + '"', 'check');
          return JSON.parse(bodyText);
        });
      })
      .then(function(data) {
        if (!state.running || state.isDelegating) {
          log('SKIP: State changed during API fetch', 'skip');
          return;
        }

        var ok = parseLoopApiResponse(data);
        if (!ok) {
          log('Cycle aborted: API response parse failed', 'error');
          return;
        }

        // Auto-detect current workspace
        return autoDetectLoopCurrentWorkspace(token).then(function() {
          if (!state.running || state.isDelegating) {
            log('SKIP: State changed during workspace detection', 'skip');
            return;
          }

          // Step 2: Check available credits from API data
          syncCreditStateFromApi();
          updateUI();

          var cws = loopCreditState.currentWs;
          var available = cws ? (cws.available || 0) : 0;

          if (available > 0) {
            log('✅ Credits available (' + available + ') — NO move needed', 'success');
            return;
          }

          // Step 3: No credits — double-confirm with a second API fetch
          log('Step 3: No credits on first check — double-confirming via API...', 'warn');
          
          setTimeout(function() {
            if (!state.running || state.isDelegating) {
              log('SKIP: State changed during double-confirm wait', 'skip');
              return;
            }

            fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
              .then(function(resp2) {
                if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
                return resp2.json();
              })
              .then(function(data2) {
                if (!state.running || state.isDelegating) {
                  log('SKIP: State changed during double-confirm fetch', 'skip');
                  return;
                }

                parseLoopApiResponse(data2);
                return autoDetectLoopCurrentWorkspace(token).then(function() {
                  syncCreditStateFromApi();
                  updateUI();

                  var cws2 = loopCreditState.currentWs;
                  var available2 = cws2 ? (cws2.available || 0) : 0;

                  if (available2 > 0) {
                    log('DOUBLE-CONFIRM: Credits found on re-check (' + available2 + ')! No move needed.', 'success');
                    return;
                  }

                  // Step 4: Confirmed no credits — move via API
                  log('CONFIRMED: No credits after double-check (available=' + available2 + ') — moving via API', 'delegate');
                  logSub('Direction: ' + state.direction.toUpperCase() + ', Workspace: ' + (cws2 ? cws2.fullName : 'unknown'), 1);
                  performDirectMove(state.direction);
                });
              })
              .catch(function(err) {
                log('Double-confirm API fetch failed: ' + err.message, 'error');
              });
          }, 2000); // 2s gap between first and confirm check
        });
      })
      .catch(function(err) {
        log('Cycle API fetch failed: ' + err.message + ' — falling back to DOM check', 'error');
        // Fallback: open dialog and check DOM (legacy behavior)
        runCycleDomFallback();
      });
  }

  // ============================================
  // DEPRECATED (v7.9.7): DOM-based cycle fallback
  // Only used when API fetch fails. Opens project dialog to check progress bar.
  // ============================================
  function runCycleDomFallback() {
    log('DOM Fallback: Opening project dialog for progress bar check...', 'warn');
    
    if (isUserTypingInPrompt()) {
      log('SKIP: User is typing — cannot open dialog', 'skip');
      return;
    }

    var clicked = ensureProjectDialogOpen();
    if (!clicked) {
      log('DOM Fallback: project button not found', 'error');
      return;
    }

    pollForDialogReady(function() {
      if (!state.running || state.isDelegating) {
        closeProjectDialog();
        return;
      }
      
      fetchWorkspaceName();
      var hasProgressBar = checkSystemBusy();
      state.isIdle = !hasProgressBar;
      state.hasFreeCredit = hasProgressBar;
      state.lastStatusCheck = Date.now();
      closeProjectDialog();
      
      if (hasProgressBar) {
        log('DOM Fallback: Free credit found — NO move needed', 'success');
        updateUI();
        return;
      }

      log('DOM Fallback: No credit — moving via API', 'delegate');
      performDirectMove(state.direction);
    });
  }

  // ============================================
  // Force Switch - Immediately trigger move without waiting for idle
  // v7.9.6: Now uses direct API move instead of AHK delegation
  // ============================================
  function forceSwitch(direction) {
    if (state.isDelegating) {
      log('BLOCKED: Already moving, ignoring force ' + direction.toUpperCase(), 'warn');
      return;
    }
    log('=== FORCE ' + direction.toUpperCase() + ' ===', 'delegate');
    logSub('v7.9.6: Direct API move — no AHK delegation', 1);
    performDirectMove(direction);
  }

  window.__forceSwitch = forceSwitch;

  // v7.9.32: Button click animation — brief scale pulse to confirm action
  function animateBtn(btn) {
    if (!btn) return;
    btn.style.transform = 'scale(0.85)';
    btn.style.opacity = '0.6';
    setTimeout(function() {
      btn.style.transform = 'scale(1.1)';
      btn.style.opacity = '1';
      setTimeout(function() {
        btn.style.transform = 'scale(1)';
      }, 120);
    }, 100);
  }

  // ============================================
  // DEPRECATED (v7.9.6): Delegate Complete - Was called by AHK when done
  // No longer used — performDirectMove() handles its own completion.
  // Kept for backward compatibility if old AHK calls it.
  // ============================================
  function delegateComplete() {
    log('DEPRECATED: delegateComplete called (v7.9.6 uses performDirectMove)', 'warn');
    state.isDelegating = false;
    state.forceDirection = null;
    state.delegateStartTime = 0;
    document.title = document.title.replace(/__AHK_DELEGATE_(UP|DOWN)__URL:.*?__ENDURL__/g, '').replace(/__AHK_DELEGATE_(UP|DOWN)__/g, '');
    state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
    updateUI();
  }

  // ============================================
  // Workspace Auto-Check - runs every WS_CHECK_INTERVAL ms
  // v6.55: Tries nav-based workspace name fetch FIRST (no dialog needed)
  // Only opens project dialog for credit status check
  // ============================================
  function refreshStatus() {
    // Skip if loop is actively running (runCycle handles its own checks)
    if (state.running) {
      logSub('Workspace auto-check skipped — loop is running (runCycle handles checks)', 1);
      return;
    }
    
    // Skip if user is typing in prompt area
    if (isUserTypingInPrompt()) {
      log('Workspace auto-check: user is typing in prompt — skipping', 'skip');
      return;
    }

    // v6.55: Try lightweight nav-based workspace name fetch first (no dialog disruption)
    var gotNavName = fetchWorkspaceNameFromNav();
    if (gotNavName) {
      logSub('Workspace name updated from nav — skipping dialog open for name', 1);
    }

    // Still need to open dialog for credit status check
    logSub('Workspace auto-check: opening dialog for credit check...', 1);
    var opened = ensureProjectDialogOpen();
    if (!opened) {
      logSub('Workspace auto-check: could not open project dialog', 1);
      updateUI();
      return;
    }

    // Poll for main progress bar instead of fixed wait
    pollForDialogReady(function() {
      // If nav fetch didn't work, try dialog-based fetch as fallback
      if (!gotNavName) {
        var oldName = state.workspaceName;
        fetchWorkspaceName();
        var nameChanged = oldName && state.workspaceName && oldName !== state.workspaceName;
        if (nameChanged) {
          log('Workspace changed during auto-check: "' + oldName + '" -> "' + state.workspaceName + '"', 'success');
        }
      }

      // Check credit while dialog is open
      logSub('Checking credit status (dialog already open)', 1);
      var hasCredit = checkSystemBusy();
      state.hasFreeCredit = hasCredit;
      state.isIdle = !hasCredit;
      state.lastStatusCheck = Date.now();

      // Close the dialog after checking
      closeProjectDialog();
      
      updateUI();
    });
  }

  function startStatusRefresh() {
    if (state.statusRefreshId) return; // already running
    var intervalMs = TIMING.WS_CHECK_INTERVAL || 5000;
    log('Starting workspace auto-check (every ' + (intervalMs/1000) + 's)', 'success');
    state.statusRefreshId = setInterval(refreshStatus, intervalMs);
    // Run immediately on start
    setTimeout(refreshStatus, 1000);
  }

  function stopStatusRefresh() {
    if (state.statusRefreshId) {
      clearInterval(state.statusRefreshId);
      state.statusRefreshId = null;
      log('Workspace auto-check stopped', 'warn');
    }
  }

  // Expose globally
  window.__refreshStatus = refreshStatus;
  window.__startStatusRefresh = startStatusRefresh;
  window.__stopStatusRefresh = stopStatusRefresh;

  // ============================================
  // Set Interval dynamically (called from AHK)
  // ============================================
  function setLoopInterval(newIntervalMs) {
    var oldInterval = TIMING.LOOP_INTERVAL;
    TIMING.LOOP_INTERVAL = newIntervalMs;
    log('Interval changed: ' + oldInterval + 'ms -> ' + newIntervalMs + 'ms', 'success');
    
    state.countdown = Math.floor(newIntervalMs / 1000);
    
    if (state.running && state.loopIntervalId) {
      clearInterval(state.loopIntervalId);
      state.loopIntervalId = setInterval(runCycle, newIntervalMs);
      log('Loop timer restarted with new interval');
    }
    
    updateUI();
    return true;
  }

  // ============================================
  // JS Executor History (ported from combo.js)
  // ============================================
  var loopJsHistory = [];
  var loopJsHistoryIndex = -1;
  var LOOP_JS_HISTORY_MAX = 20;

  function addLoopJsHistoryEntry(code, success, resultText) {
    var now = new Date();
    var timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var entry = { time: timeStr, code: code, success: success, result: resultText };
    // Avoid consecutive duplicates
    var isDuplicate = loopJsHistory.length > 0 && loopJsHistory[0].code === code;
    if (!isDuplicate) {
      loopJsHistory.unshift(entry);
      if (loopJsHistory.length > LOOP_JS_HISTORY_MAX) loopJsHistory.pop();
      logSub('JS history updated: ' + loopJsHistory.length + ' entries');
    }
    loopJsHistoryIndex = -1;
    renderLoopJsHistory();
  }

  function renderLoopJsHistory() {
    var el = document.getElementById('loop-js-history');
    if (!el) return;
    if (loopJsHistory.length === 0) {
      el.innerHTML = '<span style="color:#64748b;font-size:10px;">No commands yet</span>';
      return;
    }
    var html = '';
    for (var i = 0; i < loopJsHistory.length; i++) {
      var e = loopJsHistory[i];
      var statusColor = e.success ? '#4ade80' : '#ef4444';
      var statusIcon = e.success ? '✓' : '✗';
      html += '<div class="loop-js-hist-item" data-hist-idx="' + i + '" style="display:flex;gap:4px;align-items:flex-start;padding:3px 4px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px;font-family:monospace;"'
        + ' onmouseover="this.style.background=\'rgba(99,102,241,0.15)\'"'
        + ' onmouseout="this.style.background=\'transparent\'">'
        + '<span style="color:' + statusColor + ';font-size:10px;">' + statusIcon + '</span>'
        + '<span style="color:#6b7280;font-size:9px;min-width:40px;">' + e.time + '</span>'
        + '<span style="color:#e0e7ff;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + e.code.substring(0, 60) + '</span>'
        + '</div>';
    }
    el.innerHTML = html;
    // Bind click events for recall
    var items = el.querySelectorAll('.loop-js-hist-item');
    for (var j = 0; j < items.length; j++) {
      items[j].onclick = (function(idx) {
        return function() {
          var ta = document.getElementById(IDS.JS_EXECUTOR);
          if (ta && loopJsHistory[idx]) {
            ta.value = loopJsHistory[idx].code;
            ta.focus();
            log('Recalled JS command #' + idx, 'success');
          }
        };
      })(j);
    }
  }

  function navigateLoopJsHistory(direction) {
    var ta = document.getElementById(IDS.JS_EXECUTOR);
    if (!ta || loopJsHistory.length === 0) return;
    if (direction === 'up') {
      if (loopJsHistoryIndex < loopJsHistory.length - 1) {
        loopJsHistoryIndex++;
        ta.value = loopJsHistory[loopJsHistoryIndex].code;
      }
    } else {
      if (loopJsHistoryIndex > 0) {
        loopJsHistoryIndex--;
        ta.value = loopJsHistory[loopJsHistoryIndex].code;
      } else {
        loopJsHistoryIndex = -1;
        ta.value = '';
      }
    }
  }

  // ============================================
  // JS Executor
  // ============================================
  function executeJs() {
    var textbox = document.getElementById(IDS.JS_EXECUTOR);
    if (!textbox) {
      log('JS textbox element not found', 'error');
      return;
    }
    var code = textbox.value.trim();
    if (!code) {
      log('No code to execute', 'warn');
      return;
    }

    log('Executing custom JS code...');
    try {
      var result = eval(code);
      var resultStr = result !== undefined ? String(result) : '(undefined)';
      if (result !== undefined) {
        console.log('[MacroLoop v' + VERSION + '] Result:', result);
      }
      log('JS execution completed successfully', 'success');
      addLoopJsHistoryEntry(code, true, resultStr.substring(0, 100));
    } catch (e) {
      log('JS execution error: ' + e.message, 'error');
      addLoopJsHistoryEntry(code, false, e.message);
    }
  }

  // ============================================
  // Create UI
  // ============================================
  var createUIRetryCount = 0;
  var CREATE_UI_MAX_RETRIES = 5;

  function createUI() {
    var container = getByXPath(CONFIG.CONTROLS_XPATH);
    if (!container) {
      createUIRetryCount++;
      log('UI container not found at XPath: ' + CONFIG.CONTROLS_XPATH + ' (attempt ' + createUIRetryCount + '/' + CREATE_UI_MAX_RETRIES + ')', 'warn');
      if (createUIRetryCount < CREATE_UI_MAX_RETRIES) {
        log('Retrying in 2 seconds...', 'warn');
        setTimeout(createUI, 2000);
        return;
      }
      // Fallback: attach as fixed floating panel to body
      log('XPath container not found after ' + CREATE_UI_MAX_RETRIES + ' retries — using BODY fallback (floating panel)', 'warn');
      container = document.body;
    }

    if (document.getElementById(IDS.CONTAINER)) {
      log('UI already exists in DOM');
      return;
    }

    var style = document.createElement('style');
    style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}.loop-pulse{animation:pulse 1s infinite}';
    document.head.appendChild(style);

    var panelState = 'expanded';
    var isDragging = false;
    var dragOffsetX = 0;
    var dragOffsetY = 0;
    var isFloating = false;
    var dragStartPos = { x: 0, y: 0 };

    var ui = document.createElement('div');
    ui.id = IDS.CONTAINER;
    ui.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:8px;background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:10px;border:2px solid #4f46e5;margin:10px 0;position:relative;cursor:default;';

    function enableFloating() {
      if (isFloating) return;
      log('Switching MacroLoop panel to floating mode');
      isFloating = true;
      ui.style.position = 'fixed';
      ui.style.zIndex = '99997';
      ui.style.width = '380px';
      ui.style.top = '80px';
      ui.style.left = '20px';
      ui.style.margin = '0';
      ui.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    }

    function startDragHandler(e) {
      isDragging = true;
      var rect = ui.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      dragStartPos.x = e.clientX;
      dragStartPos.y = e.clientY;
      enableFloating();
      e.preventDefault();
    }

    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      ui.style.left = (e.clientX - dragOffsetX) + 'px';
      ui.style.top = (e.clientY - dragOffsetY) + 'px';
      ui.style.right = 'auto';
    });

    document.addEventListener('mouseup', function() {
      isDragging = false;
    });

    var bodyElements = [];

    function toggleMinimize() {
      var isExpanded = panelState === 'expanded';
      if (isExpanded) {
        log('Minimizing MacroLoop panel');
        for (var i = 0; i < bodyElements.length; i++) {
          bodyElements[i].style.display = 'none';
        }
        panelToggleSpan.textContent = '[ + ]';
        panelState = 'minimized';
      } else {
        log('Expanding MacroLoop panel');
        for (var i = 0; i < bodyElements.length; i++) {
          bodyElements[i].style.display = '';
        }
        panelToggleSpan.textContent = '[ - ]';
        panelState = 'expanded';
      }
    }

    function restorePanel() {
      log('Restoring hidden MacroLoop panel');
      ui.style.display = '';
      for (var i = 0; i < bodyElements.length; i++) {
        bodyElements[i].style.display = '';
      }
      panelToggleSpan.textContent = '[ - ]';
      panelState = 'expanded';
    }

    var titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:grab;user-select:none;padding:2px 0;';
    titleRow.title = 'Drag to move, click to minimize/expand';

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:bold;color:#c7d2fe;font-size:14px;flex:1;';
    title.textContent = 'MacroLoop Controller';

    var versionSpan = document.createElement('span');
    versionSpan.style.cssText = 'font-size:10px;color:#818cf8;margin-right:8px;';
    versionSpan.textContent = 'v' + VERSION;

    var panelToggleSpan = document.createElement('span');
    panelToggleSpan.style.cssText = 'font-size:10px;color:#64748b;cursor:pointer;margin-right:4px;';
    panelToggleSpan.textContent = '[ - ]';

    var hideBtn = document.createElement('span');
    hideBtn.style.cssText = 'font-size:10px;color:#64748b;cursor:pointer;';
    hideBtn.textContent = '[ x ]';
    hideBtn.title = 'Hide panel (Ctrl+Alt+H to show)';
    hideBtn.onclick = function(e) {
      e.stopPropagation();
      log('MacroLoop panel hidden by user');
      ui.style.display = 'none';
      panelState = 'hidden';
    };

    titleRow.onmousedown = function(e) {
      var isHide = e.target === hideBtn;
      if (isHide) return;
      startDragHandler(e);
    };

    titleRow.onmouseup = function(e) {
      var isHide = e.target === hideBtn;
      if (isHide) return;
      var dx = Math.abs(e.clientX - dragStartPos.x);
      var dy = Math.abs(e.clientY - dragStartPos.y);
      var isClick = dx < 5 && dy < 5;
      if (isClick) {
        toggleMinimize();
      }
    };

    titleRow.appendChild(title);
    titleRow.appendChild(versionSpan);
    titleRow.appendChild(panelToggleSpan);
    titleRow.appendChild(hideBtn);

    var status = document.createElement('div');
    status.id = IDS.STATUS;
    status.style.cssText = 'font-family:monospace;font-size:11px;padding:4px 6px;background:rgba(0,0,0,.4);border-radius:4px;color:#9ca3af;';
    status.innerHTML = '<span style="color:#fbbf24;">⟳</span> Initializing... checking workspace &amp; credit status';

    var infoRow = document.createElement('div');
    infoRow.style.cssText = 'font-size:9px;color:#a5b4fc;padding:2px 6px;background:rgba(0,0,0,.2);border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    infoRow.textContent = '1. Open Dialog -> 2. Check Credit -> 3. Double-Confirm -> 4. Delegate | Ctrl+Alt+Up/Down | Ctrl+Alt+H to hide';

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;';

    var btnStyle = 'padding:5px 10px;border:none;border-radius:4px;font-weight:600;font-size:11px;cursor:pointer;transition:all 0.2s;';

    var startBtn = document.createElement('button');
    startBtn.id = IDS.START_BTN;
    startBtn.textContent = 'Start';
    startBtn.style.cssText = btnStyle + 'background:#10b981;color:#fff;';
    startBtn.onclick = function() { startLoop(state.direction); };

    var stopBtn = document.createElement('button');
    stopBtn.id = IDS.STOP_BTN;
    stopBtn.textContent = 'Stop';
    stopBtn.style.cssText = btnStyle + 'background:#ef4444;color:#fff;opacity:.5;';
    stopBtn.disabled = true;
    stopBtn.onclick = function() { stopLoop(); };

    var checkBtn = document.createElement('button');
    checkBtn.textContent = 'Check';
    checkBtn.style.cssText = btnStyle + 'background:#ec4899;color:#fff;';
    checkBtn.onclick = function() { runCheck(); };

    var sep = document.createElement('div');
    sep.style.cssText = 'width:1px;background:#4f46e5;margin:0 4px;';

    var upBtn = document.createElement('button');
    upBtn.id = IDS.UP_BTN;
    upBtn.textContent = 'Up';
    upBtn.style.cssText = btnStyle + 'background:#3b82f6;color:#fff;';
    upBtn.onclick = function() {
      state.direction = 'up';
      log('Direction set to: UP');
      startLoop('up');
    };

    var downBtn = document.createElement('button');
    downBtn.id = IDS.DOWN_BTN;
    downBtn.textContent = 'Down';
    downBtn.style.cssText = btnStyle + 'background:#6366f1;color:#fff;';
    downBtn.onclick = function() {
      state.direction = 'down';
      log('Direction set to: DOWN');
      startLoop('down');
    };

    btnRow.appendChild(startBtn);
    btnRow.appendChild(stopBtn);
    btnRow.appendChild(checkBtn);
    btnRow.appendChild(sep);
    btnRow.appendChild(upBtn);
    btnRow.appendChild(downBtn);

    // Force buttons merged into main row
    var sep2 = document.createElement('div');
    sep2.style.cssText = 'width:1px;background:#4f46e5;margin:0 2px;align-self:stretch;';
    btnRow.appendChild(sep2);

    var forceUpBtn = document.createElement('button');
    forceUpBtn.textContent = '⏫ Move Up';
    forceUpBtn.title = 'Force move project to previous workspace via API (Alt+Up)';
    forceUpBtn.style.cssText = btnStyle + 'background:#1d4ed8;color:#fff;font-size:10px;padding:5px 8px 4px 8px;transition:all 0.15s;';
    forceUpBtn.onclick = function() { animateBtn(forceUpBtn); moveToAdjacentWorkspace('up'); };

    var forceDownBtn = document.createElement('button');
    forceDownBtn.textContent = '⏬ Move Down';
    forceDownBtn.title = 'Force move project to next workspace via API (Alt+Down)';
    forceDownBtn.style.cssText = btnStyle + 'background:#7c2d12;color:#fff;font-size:10px;padding:5px 8px 4px 8px;transition:all 0.15s;';
    forceDownBtn.onclick = function() { animateBtn(forceDownBtn); moveToAdjacentWorkspace('down'); };

    btnRow.appendChild(forceUpBtn);
    btnRow.appendChild(forceDownBtn);

    // Credit refresh button
    var sep3 = document.createElement('div');
    sep3.style.cssText = 'width:1px;background:#4f46e5;margin:0 2px;align-self:stretch;';
    btnRow.appendChild(sep3);

    var creditBtn = document.createElement('button');
    creditBtn.textContent = '💳';
    creditBtn.title = 'Fetch credit status via API (three-bar breakdown)';
    creditBtn.style.cssText = btnStyle + 'background:#4c1d95;color:#c4b5fd;font-size:12px;padding:4px 8px;';
    creditBtn.onclick = function() { fetchLoopCredits(); };
    btnRow.appendChild(creditBtn);

    var xpathSection = document.createElement('div');
    xpathSection.style.cssText = 'padding:4px 6px;background:rgba(0,0,0,.3);border-radius:4px;';

    var xpathHeader = document.createElement('div');
    xpathHeader.style.cssText = 'display:flex;align-items:center;cursor:pointer;user-select:none;';
    var xpathToggle = document.createElement('span');
    xpathToggle.style.cssText = 'font-size:10px;color:#818cf8;margin-right:4px;';
    xpathToggle.textContent = '[+]';
    var xpathTitle = document.createElement('span');
    xpathTitle.style.cssText = 'font-size:10px;color:#a5b4fc;font-weight:bold;';
    xpathTitle.textContent = 'XPath Configuration (editable)';
    xpathHeader.appendChild(xpathToggle);
    xpathHeader.appendChild(xpathTitle);

    var xpathBody = document.createElement('div');
    xpathBody.style.cssText = 'display:none;margin-top:4px;';

    xpathHeader.onclick = function() {
      var hidden = xpathBody.style.display === 'none';
      xpathBody.style.display = hidden ? '' : 'none';
      xpathToggle.textContent = hidden ? '[-]' : '[+]';
    };

    var projLabel = document.createElement('div');
    projLabel.style.cssText = 'font-size:9px;color:#818cf8;margin-bottom:1px;';
    projLabel.textContent = 'Project Button XPath:';

    var projInput = document.createElement('input');
    projInput.type = 'text';
    projInput.id = 'xpath-project-btn';
    projInput.value = CONFIG.PROJECT_BUTTON_XPATH;
    projInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid #4f46e5;border-radius:3px;background:#1e1b4b;color:#e0e7ff;font-family:monospace;font-size:9px;margin-bottom:4px;box-sizing:border-box;';
    projInput.onchange = function() {
      updateProjectButtonXPath(this.value);
    };

    var progLabel = document.createElement('div');
    progLabel.style.cssText = 'font-size:9px;color:#818cf8;margin-bottom:1px;';
    progLabel.textContent = 'Progress Bar XPath:';

    var progInput = document.createElement('input');
    progInput.type = 'text';
    progInput.id = 'xpath-progress-bar';
    progInput.value = CONFIG.PROGRESS_XPATH;
    progInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid #4f46e5;border-radius:3px;background:#1e1b4b;color:#e0e7ff;font-family:monospace;font-size:9px;box-sizing:border-box;';
    progInput.onchange = function() {
      updateProgressXPath(this.value);
    };

    var wsLabel = document.createElement('div');
    wsLabel.style.cssText = 'font-size:9px;color:#818cf8;margin-bottom:1px;margin-top:4px;';
    wsLabel.textContent = 'Workspace Name XPath:';

    var wsInput = document.createElement('input');
    wsInput.type = 'text';
    wsInput.id = 'xpath-workspace-name';
    wsInput.value = CONFIG.WORKSPACE_XPATH;
    wsInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid #4f46e5;border-radius:3px;background:#1e1b4b;color:#e0e7ff;font-family:monospace;font-size:9px;box-sizing:border-box;';
    wsInput.onchange = function() {
      updateWorkspaceXPath(this.value);
    };

    xpathBody.appendChild(projLabel);
    xpathBody.appendChild(projInput);
    xpathBody.appendChild(progLabel);
    xpathBody.appendChild(progInput);
    xpathBody.appendChild(wsLabel);
    xpathBody.appendChild(wsInput);
    xpathSection.appendChild(xpathHeader);
    xpathSection.appendChild(xpathBody);

    var jsLabel = document.createElement('div');
    // JS Executor - collapsible, hidden by default
    var jsSection = document.createElement('div');
    jsSection.style.cssText = 'padding:4px 6px;background:rgba(0,0,0,.3);border-radius:4px;';

    var jsHeader = document.createElement('div');
    jsHeader.style.cssText = 'display:flex;align-items:center;cursor:pointer;user-select:none;';
    var jsToggle = document.createElement('span');
    jsToggle.style.cssText = 'font-size:10px;color:#818cf8;margin-right:4px;';
    jsToggle.textContent = '[+]';
    var jsTitle = document.createElement('span');
    jsTitle.style.cssText = 'font-size:10px;color:#a5b4fc;font-weight:bold;';
    jsTitle.textContent = 'JS Executor (Ctrl+Enter to run)';
    jsHeader.appendChild(jsToggle);
    jsHeader.appendChild(jsTitle);

    var jsBody = document.createElement('div');
    jsBody.style.cssText = 'display:none;margin-top:4px;';

    jsHeader.onclick = function() {
      var hidden = jsBody.style.display === 'none';
      jsBody.style.display = hidden ? '' : 'none';
      jsToggle.textContent = hidden ? '[-]' : '[+]';
    };

    var jsRow = document.createElement('div');
    jsRow.style.cssText = 'display:flex;gap:4px;';

    var jsTextbox = document.createElement('textarea');
    jsTextbox.id = IDS.JS_EXECUTOR;
    jsTextbox.placeholder = 'JavaScript code...';
    jsTextbox.style.cssText = 'flex:1;min-height:30px;padding:4px;border:1px solid #4f46e5;border-radius:3px;background:#1e1b4b;color:#e0e7ff;font-family:monospace;font-size:10px;resize:vertical;';
    jsTextbox.spellcheck = false;
    jsTextbox.onkeydown = function(e) {
      var isCtrlEnter = e.ctrlKey && e.key === 'Enter';
      if (isCtrlEnter) {
        e.preventDefault();
        executeJs();
        return;
      }
      // ArrowUp/Down for JS history recall (only on single-line content)
      var isSingleLine = (jsTextbox.value || '').indexOf('\n') === -1;
      if (e.key === 'ArrowUp' && isSingleLine) {
        e.preventDefault();
        navigateLoopJsHistory('up');
        return;
      }
      if (e.key === 'ArrowDown' && isSingleLine) {
        e.preventDefault();
        navigateLoopJsHistory('down');
        return;
      }
    };

    var jsBtn = document.createElement('button');
    jsBtn.id = IDS.JS_EXECUTE_BTN;
    jsBtn.textContent = 'Run';
    jsBtn.style.cssText = btnStyle + 'background:#8b5cf6;color:#fff;align-self:flex-end;';
    jsBtn.onclick = executeJs;

    jsRow.appendChild(jsTextbox);
    jsRow.appendChild(jsBtn);
    jsBody.appendChild(jsRow);

    // JS Command History panel
    var jsHistLabel = document.createElement('div');
    jsHistLabel.style.cssText = 'font-size:9px;color:#818cf8;margin-top:4px;';
    jsHistLabel.textContent = 'JS History (click to recall, Up/Down arrows in textbox)';
    jsBody.appendChild(jsHistLabel);

    var jsHistBox = document.createElement('div');
    jsHistBox.id = 'loop-js-history';
    jsHistBox.style.cssText = 'max-height:80px;overflow-y:auto;background:rgba(0,0,0,.3);border:1px solid #4f46e5;border-radius:3px;margin-top:2px;';
    jsHistBox.innerHTML = '<span style="color:#64748b;font-size:10px;padding:4px;">No commands yet</span>';
    jsBody.appendChild(jsHistBox);

    jsSection.appendChild(jsHeader);
    jsSection.appendChild(jsBody);

    // XPath Tester removed (v7.9.1) — use combo.js XPath Tester instead

    // Activity log - compact
    var activityToggleBtn = document.createElement('button');
    activityToggleBtn.id = 'loop-activity-toggle-btn';
    activityToggleBtn.textContent = 'Show Activity Log';
    activityToggleBtn.style.cssText = 'padding:3px 8px;border:none;border-radius:3px;background:#312e81;color:#a5b4fc;font-size:10px;cursor:pointer;width:100%;text-align:left;';
    activityToggleBtn.onmouseover = function() { this.style.background = '#4c1d95'; };
    activityToggleBtn.onmouseout = function() { this.style.background = '#312e81'; };
    activityToggleBtn.onclick = function(e) { e.preventDefault(); toggleActivityLog(); };

    var activityPanel = document.createElement('div');
    activityPanel.id = 'loop-activity-log-panel';
    activityPanel.style.cssText = 'display:none;padding:4px;background:rgba(0,0,0,.5);border:1px solid #4f46e5;border-radius:3px;max-height:120px;overflow-y:auto;';

    var activityContent = document.createElement('div');
    activityContent.id = 'loop-activity-log-content';
    activityContent.innerHTML = '<div style="color:#6b7280;font-size:10px;padding:4px;">No activity logs yet</div>';

    activityPanel.appendChild(activityContent);

    // Log export - compact
    var logExportRow = document.createElement('div');
    logExportRow.style.cssText = 'display:flex;gap:4px;align-items:center;';

    var logLabel = document.createElement('span');
    logLabel.style.cssText = 'font-size:9px;color:#818cf8;flex:1;';
    logLabel.textContent = 'JS Logs (' + getAllLogs().length + ' entries)';
    logLabel.id = 'loop-log-count';

    var copyLogBtn = document.createElement('button');
    copyLogBtn.textContent = 'Copy';
    copyLogBtn.style.cssText = 'padding:2px 6px;background:#312e81;color:#c7d2fe;border:1px solid #4f46e5;border-radius:2px;font-size:9px;cursor:pointer;';
    copyLogBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      copyLogsToClipboard();
      var countEl = document.getElementById('loop-log-count');
      if (countEl) countEl.textContent = 'Copied! (' + getAllLogs().length + ' entries)';
      setTimeout(function() {
        if (countEl) countEl.textContent = 'JS Logs (' + getAllLogs().length + ' entries)';
      }, 2000);
    };

    var downloadLogBtn = document.createElement('button');
    downloadLogBtn.textContent = 'DL';
    downloadLogBtn.title = 'Download logs';
    downloadLogBtn.style.cssText = 'padding:2px 6px;background:#312e81;color:#c7d2fe;border:1px solid #4f46e5;border-radius:2px;font-size:9px;cursor:pointer;';
    downloadLogBtn.onclick = function(e) { e.preventDefault(); e.stopPropagation(); downloadLogs(); };

    var clearLogBtn = document.createElement('button');
    clearLogBtn.textContent = 'Clr';
    clearLogBtn.title = 'Clear all logs';
    clearLogBtn.style.cssText = 'padding:2px 6px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:2px;font-size:9px;cursor:pointer;';
    clearLogBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      clearAllLogs();
      var countEl = document.getElementById('loop-log-count');
      if (countEl) countEl.textContent = 'JS Logs (0 entries)';
    };

    logExportRow.appendChild(logLabel);
    logExportRow.appendChild(copyLogBtn);
    logExportRow.appendChild(downloadLogBtn);
    logExportRow.appendChild(clearLogBtn);

    // Workspace History button + panel
    var wsHistoryBtn = document.createElement('button');
    wsHistoryBtn.textContent = 'Workspace History';
    wsHistoryBtn.style.cssText = 'padding:3px 8px;border:none;border-radius:3px;background:#78350f;color:#fbbf24;font-size:10px;cursor:pointer;width:100%;text-align:left;';
    wsHistoryBtn.onmouseover = function() { this.style.background = '#92400e'; };
    wsHistoryBtn.onmouseout = function() { this.style.background = '#78350f'; };

    var wsHistoryPanel = document.createElement('div');
    wsHistoryPanel.id = 'loop-ws-history-panel';
    wsHistoryPanel.style.cssText = 'display:none;padding:4px;background:rgba(0,0,0,.5);border:1px solid #b45309;border-radius:3px;max-height:120px;overflow-y:auto;';

    function renderWsHistory() {
      var history = getWorkspaceHistory();
      if (history.length === 0) {
        wsHistoryPanel.innerHTML = '<div style="color:#6b7280;font-size:10px;padding:4px;">No workspace changes recorded yet</div>';
        return;
      }
      var html = '';
      for (var i = history.length - 1; i >= 0; i--) {
        var e = history[i];
        html += '<div style="font-size:10px;font-family:monospace;padding:2px 0;color:#fbbf24;">';
        html += '<span style="color:#6b7280;">[' + e.display + ']</span> ';
        html += '<span style="color:#ef4444;">' + e.from + '</span>';
        html += ' <span style="color:#9ca3af;">→</span> ';
        html += '<span style="color:#10b981;">' + e.to + '</span>';
        html += '</div>';
      }
      html += '<div style="margin-top:4px;text-align:right;"><button onclick="(function(){try{localStorage.removeItem(\'' + WS_HISTORY_KEY + '\');document.getElementById(\'loop-ws-history-panel\').innerHTML=\'<div style=\\\'color:#6b7280;font-size:10px;padding:4px;\\\'>History cleared</div>\';}catch(e){}})();" style="padding:2px 6px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:2px;font-size:9px;cursor:pointer;">Clear History</button></div>';
      wsHistoryPanel.innerHTML = html;
    }

    var wsHistoryVisible = false;
    wsHistoryBtn.onclick = function(e) {
      e.preventDefault();
      wsHistoryVisible = !wsHistoryVisible;
      wsHistoryPanel.style.display = wsHistoryVisible ? 'block' : 'none';
      if (wsHistoryVisible) renderWsHistory();
    };

    // === Bearer Token Section ===
    var tokenSection = document.createElement('div');
    tokenSection.style.cssText = 'padding:4px 6px;background:rgba(30,58,75,.5);border:1px solid #0e7490;border-radius:4px;';

    var savedToken = getBearerTokenFromStorage();
    var tokenCollapsed = !!savedToken;

    var tokenHeader = document.createElement('div');
    tokenHeader.style.cssText = 'display:flex;align-items:center;cursor:pointer;user-select:none;gap:4px;';
    var tokenToggle = document.createElement('span');
    tokenToggle.style.cssText = 'font-size:10px;color:#67e8f9;';
    tokenToggle.textContent = tokenCollapsed ? '[+]' : '[-]';
    var tokenTitle = document.createElement('span');
    tokenTitle.id = 'loop-bearer-title';
    tokenTitle.style.cssText = 'font-size:10px;color:#67e8f9;font-weight:bold;';
    var tokenStatusEmoji = savedToken ? '🔑' : '⚠️';
    var tokenStatusText = savedToken ? ' (saved, ' + savedToken.length + ' chars)' : ' (not set)';
    tokenTitle.textContent = 'Bearer Token ' + tokenStatusEmoji + tokenStatusText;
    tokenHeader.appendChild(tokenToggle);
    tokenHeader.appendChild(tokenTitle);

    var tokenBody = document.createElement('div');
    tokenBody.style.cssText = tokenCollapsed ? 'display:none;margin-top:4px;' : 'display:block;margin-top:4px;';

    tokenHeader.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var isHidden = tokenBody.style.display === 'none';
      tokenBody.style.display = isHidden ? 'block' : 'none';
      tokenToggle.textContent = isHidden ? '[-]' : '[+]';
    };

    var tokenInputRow = document.createElement('div');
    tokenInputRow.style.cssText = 'display:flex;gap:4px;';

    var tokenInput = document.createElement('input');
    tokenInput.type = 'password';
    tokenInput.id = 'loop-bearer-input';
    tokenInput.placeholder = 'Paste bearer token...';
    tokenInput.value = savedToken || '';
    tokenInput.style.cssText = 'flex:1;padding:3px 5px;border:1px solid #0e7490;border-radius:3px;background:#1e1b4b;color:#e0e7ff;font-family:monospace;font-size:9px;box-sizing:border-box;';

    var tokenVisBtn = document.createElement('button');
    tokenVisBtn.textContent = '👁';
    tokenVisBtn.title = 'Toggle visibility';
    tokenVisBtn.style.cssText = 'padding:2px 6px;background:#164e63;color:#67e8f9;border:1px solid #0e7490;border-radius:3px;font-size:10px;cursor:pointer;';
    tokenVisBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var inp = document.getElementById('loop-bearer-input');
      if (inp) {
        inp.type = inp.type === 'password' ? 'text' : 'password';
        this.textContent = inp.type === 'password' ? '👁' : '🔒';
      }
    };

    var tokenSaveBtn = document.createElement('button');
    tokenSaveBtn.textContent = '💾';
    tokenSaveBtn.title = 'Save token';
    tokenSaveBtn.style.cssText = 'padding:2px 6px;background:#065f46;color:#6ee7b7;border:1px solid #047857;border-radius:3px;font-size:10px;cursor:pointer;';
    tokenSaveBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var inp = document.getElementById('loop-bearer-input');
      if (!inp) return;
      var val = inp.value.trim();
      if (!val || val.length < 10) {
        tokenTitle.textContent = 'Bearer Token ⚠️ too short!';
        tokenTitle.style.color = '#ef4444';
        setTimeout(function() {
          tokenTitle.style.color = '#67e8f9';
          var current = getBearerTokenFromStorage();
          tokenTitle.textContent = 'Bearer Token ' + (current ? '🔑 (saved, ' + current.length + ' chars)' : '⚠️ (not set)');
        }, 2500);
        return;
      }
      saveBearerTokenToStorage(val);
      tokenTitle.textContent = 'Bearer Token 🔑 (saved, ' + val.length + ' chars)';
      tokenTitle.style.color = '#4ade80';
      setTimeout(function() { tokenTitle.style.color = '#67e8f9'; }, 2000);
    };

    tokenInputRow.appendChild(tokenInput);
    tokenInputRow.appendChild(tokenVisBtn);
    tokenInputRow.appendChild(tokenSaveBtn);

    // v7.9.31: Paste+Save button — uses pasteAndVerifyToken for clipboard paste + API verification
    var tokenPasteBtn = document.createElement('button');
    tokenPasteBtn.textContent = '📋';
    tokenPasteBtn.title = 'Paste from clipboard, save & verify token';
    tokenPasteBtn.style.cssText = 'padding:2px 6px;background:#7c3aed;color:#e9d5ff;border:1px solid #6d28d9;border-radius:3px;font-size:10px;cursor:pointer;';
    tokenPasteBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      pasteAndVerifyToken('loop');
    };
    tokenInputRow.appendChild(tokenPasteBtn);

    tokenBody.appendChild(tokenInputRow);
    tokenSection.appendChild(tokenHeader);
    tokenSection.appendChild(tokenBody);

    // === Workspace Dropdown Section ===
    var wsDropSection = document.createElement('div');
    wsDropSection.style.cssText = 'padding:4px 6px;background:rgba(0,0,0,.3);border:1px solid #4f46e5;border-radius:4px;';

    var wsDropHeader = document.createElement('div');
    wsDropHeader.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;';
    wsDropHeader.innerHTML = '<span style="font-size:11px;">🏢</span><span style="font-size:10px;color:#a5b4fc;font-weight:bold;">Workspaces</span>';

    // Focus current button
    var wsFocusBtn = document.createElement('button');
    wsFocusBtn.textContent = '📍 Focus Current';
    wsFocusBtn.title = 'Scroll to and highlight the current workspace in the list';
    wsFocusBtn.style.cssText = 'margin-left:auto;padding:2px 7px;background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
    wsFocusBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var currentName = state.workspaceName || '';

      // If no name yet, try reading from Transfer dialog DOM (XPath: /html/body/div[7]/div[2]/div[1]/div/p)
      if (!currentName) {
        try {
          var selectors = [
            'div[role="dialog"] p.min-w-0.truncate',
            'div[role="dialog"] p.truncate'
          ];
          for (var s = 0; s < selectors.length; s++) {
            var domEl = document.querySelector(selectors[s]);
            if (domEl) {
              var domText = (domEl.textContent || '').trim();
              if (domText) {
                currentName = domText;
                state.workspaceName = domText;
                log('Focus Current: read workspace from Transfer dialog DOM: "' + domText + '"', 'success');
                break;
              }
            }
          }
        } catch (ex) { /* ignore */ }
      }

      log('Focus Current: looking for "' + currentName + '"', 'check');

      // If we already know the current workspace, just find & scroll — no API needed
      if (currentName && (loopCreditState.perWorkspace || []).length > 0) {
        populateLoopWorkspaceDropdown();
        var listEl = document.getElementById('loop-ws-list');
        if (listEl) {
          var currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
          if (currentItem) {
            currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
            var idx = parseInt(currentItem.getAttribute('data-ws-idx'), 10);
            if (!isNaN(idx)) setLoopWsNavIndex(idx);
            log('✅ Focused & selected: ' + currentName, 'success');
          } else {
            log('Focus Current: name "' + currentName + '" not found in rendered list', 'warn');
          }
        }
        return;
      }

      // Fallback: no name known — fetch credits (which auto-detects workspace)
      if ((loopCreditState.perWorkspace || []).length === 0) {
        log('Focus Current: no workspaces loaded, fetching...', 'check');
        fetchLoopCredits();
        return;
      }

      // Have workspaces but no name — detect via API
      var token = window.__loopResolvedToken || getBearerTokenFromStorage();
      autoDetectLoopCurrentWorkspace(token).then(function() {
        populateLoopWorkspaceDropdown();
        var listEl = document.getElementById('loop-ws-list');
        if (!listEl) return;
        var currentItem = listEl.querySelector('.loop-ws-item[data-ws-current="true"]');
        if (currentItem) {
          currentItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
          var idx = parseInt(currentItem.getAttribute('data-ws-idx'), 10);
          if (!isNaN(idx)) setLoopWsNavIndex(idx);
          log('✅ Focused & selected: ' + state.workspaceName, 'success');
        } else {
          log('Focus Current: no item marked as current after detection', 'warn');
        }
      });
    };
    wsDropHeader.appendChild(wsFocusBtn);

    // Free Only filter
    var wsFreeBtn = document.createElement('button');
    wsFreeBtn.textContent = '🆓';
    wsFreeBtn.title = 'Toggle free-only filter';
    wsFreeBtn.style.cssText = 'padding:1px 5px;background:rgba(250,204,21,0.15);color:#facc15;border:1px solid rgba(250,204,21,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
    wsFreeBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      loopWsFreeOnly = !loopWsFreeOnly;
      this.style.background = loopWsFreeOnly ? 'rgba(250,204,21,0.4)' : 'rgba(250,204,21,0.15)';
      this.style.fontWeight = loopWsFreeOnly ? '700' : 'normal';
      populateLoopWorkspaceDropdown();
    };
    wsDropHeader.appendChild(wsFreeBtn);

    // Rollover filter
    var wsRolloverBtn = document.createElement('button');
    wsRolloverBtn.id = 'loop-ws-rollover-filter';
    wsRolloverBtn.textContent = '🔄';
    wsRolloverBtn.title = 'Show only workspaces with rollover credits';
    wsRolloverBtn.style.cssText = 'padding:1px 5px;background:rgba(167,139,250,0.15);color:#c4b5fd;border:1px solid rgba(167,139,250,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
    wsRolloverBtn.setAttribute('data-active', 'false');
    wsRolloverBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var isActive = this.getAttribute('data-active') === 'true';
      this.setAttribute('data-active', isActive ? 'false' : 'true');
      this.style.background = !isActive ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.15)';
      this.style.fontWeight = !isActive ? '700' : 'normal';
      populateLoopWorkspaceDropdown();
    };
    wsDropHeader.appendChild(wsRolloverBtn);

    // Billing filter
    var wsBillingBtn = document.createElement('button');
    wsBillingBtn.id = 'loop-ws-billing-filter';
    wsBillingBtn.textContent = '💰';
    wsBillingBtn.title = 'Show only workspaces with billing credits';
    wsBillingBtn.style.cssText = 'padding:1px 5px;background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.4);border-radius:3px;font-size:9px;cursor:pointer;';
    wsBillingBtn.setAttribute('data-active', 'false');
    wsBillingBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var isActive = this.getAttribute('data-active') === 'true';
      this.setAttribute('data-active', isActive ? 'false' : 'true');
      this.style.background = !isActive ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.15)';
      this.style.fontWeight = !isActive ? '700' : 'normal';
      populateLoopWorkspaceDropdown();
    };
    wsDropHeader.appendChild(wsBillingBtn);

    // Min credits filter
    var wsMinRow = document.createElement('div');
    wsMinRow.style.cssText = 'display:flex;align-items:center;gap:3px;';
    var wsMinLabel = document.createElement('span');
    wsMinLabel.style.cssText = 'font-size:8px;color:#94a3b8;';
    wsMinLabel.textContent = 'Min⚡';
    var wsMinInput = document.createElement('input');
    wsMinInput.type = 'number';
    wsMinInput.id = 'loop-ws-min-credits';
    wsMinInput.placeholder = '0';
    wsMinInput.min = '0';
    wsMinInput.style.cssText = 'width:35px;padding:1px 3px;border:1px solid #4f46e5;border-radius:2px;background:#1e1b4b;color:#22d3ee;font-size:8px;outline:none;font-family:monospace;';
    wsMinInput.oninput = function() { populateLoopWorkspaceDropdown(); };
    wsMinRow.appendChild(wsMinLabel);
    wsMinRow.appendChild(wsMinInput);
    wsDropHeader.appendChild(wsMinRow);

    // Icon legend
    var wsLegend = document.createElement('div');
    wsLegend.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:2px 0;border-top:1px solid rgba(255,255,255,.1);margin-top:2px;';
    wsLegend.innerHTML = '<span style="font-size:7px;color:#4ade80;" title="Billing credits from subscription">💰Billing</span>'
      + '<span style="font-size:7px;color:#c4b5fd;" title="Rollover from previous period">🔄Rollover</span>'
      + '<span style="font-size:7px;color:#facc15;" title="Daily free credits">📅Daily</span>'
      + '<span style="font-size:7px;color:#22d3ee;" title="Total available credits">⚡Total</span>'
      + '<span style="font-size:7px;color:#4ade80;" title="Trial credits">🎁Trial</span>'
      + '<span style="font-size:7px;color:#94a3b8;" title="📍=Current 🟢=OK 🟡=Low 🔴=Empty">📍🟢🟡🔴</span>';
    wsDropHeader.appendChild(wsLegend);

    // Search input
    var wsSearchInput = document.createElement('input');
    wsSearchInput.type = 'text';
    wsSearchInput.id = 'loop-ws-search';
    wsSearchInput.placeholder = '🔍 Search...';
    wsSearchInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid #4f46e5;border-radius:3px;background:#1e1b4b;color:#e0e7ff;font-size:9px;outline:none;box-sizing:border-box;margin-bottom:4px;';
    wsSearchInput.onfocus = function() { this.style.borderColor = '#818cf8'; };
    wsSearchInput.onblur = function() { this.style.borderColor = '#4f46e5'; };
    wsSearchInput.oninput = function() { populateLoopWorkspaceDropdown(); };
    wsSearchInput.onkeydown = function(e) {
      var listEl = document.getElementById('loop-ws-list');
      if (!listEl) return;
      var items = listEl.querySelectorAll('.loop-ws-item');
      if (items.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setLoopWsNavIndex(loopWsNavIndex < items.length - 1 ? loopWsNavIndex + 1 : 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setLoopWsNavIndex(loopWsNavIndex > 0 ? loopWsNavIndex - 1 : items.length - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        triggerLoopMoveFromSelection();
      }
    };

    // Workspace list
    var wsList = document.createElement('div');
    wsList.id = 'loop-ws-list';
    wsList.style.cssText = 'max-height:160px;overflow-y:auto;border:1px solid rgba(79,70,229,0.3);border-radius:3px;background:rgba(0,0,0,.3);';
    wsList.innerHTML = '<div style="padding:6px;color:#818cf8;font-size:10px;">📭 Click 💳 to load workspaces</div>';

    // Selected indicator
    var wsSelected = document.createElement('div');
    wsSelected.id = 'loop-ws-selected';
    wsSelected.style.cssText = 'font-size:9px;color:#9ca3af;margin-top:3px;min-height:12px;';
    wsSelected.textContent = 'No workspace selected';

    // Move button row
    var wsMoveRow = document.createElement('div');
    wsMoveRow.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:3px;';

    var moveBtn = document.createElement('button');
    moveBtn.textContent = '🚀 Move';
    moveBtn.title = 'Move project to selected workspace';
    moveBtn.style.cssText = 'flex:1;padding:4px 8px;background:#059669;color:#fff;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;transition:all 0.15s;';
    moveBtn.onmouseover = function() { this.style.background = '#047857'; };
    moveBtn.onmouseout = function() { this.style.background = '#059669'; };
    moveBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      triggerLoopMoveFromSelection();
    };

    var moveStatus = document.createElement('div');
    moveStatus.id = 'loop-move-status';
    moveStatus.style.cssText = 'font-size:9px;min-height:12px;color:#9ca3af;';

    wsMoveRow.appendChild(moveBtn);
    wsMoveRow.appendChild(moveStatus);

    wsDropSection.appendChild(wsDropHeader);
    wsDropSection.appendChild(wsSearchInput);
    wsDropSection.appendChild(wsList);
    wsDropSection.appendChild(wsSelected);
    wsDropSection.appendChild(wsMoveRow);

    // Assembly order: status, info, buttons, bearer token, workspaces, ws history, xpath config, activity, logs, JS executor
    bodyElements = [status, infoRow, btnRow, tokenSection, wsDropSection, wsHistoryBtn, wsHistoryPanel, xpathSection, activityToggleBtn, activityPanel, logExportRow, jsSection];

    ui.appendChild(titleRow);
    ui.appendChild(status);
    ui.appendChild(infoRow);
    ui.appendChild(btnRow);
    ui.appendChild(tokenSection);
    ui.appendChild(wsDropSection);
    ui.appendChild(wsHistoryBtn);
    ui.appendChild(wsHistoryPanel);
    ui.appendChild(xpathSection);
    ui.appendChild(activityToggleBtn);
    ui.appendChild(activityPanel);
    ui.appendChild(logExportRow);
    ui.appendChild(jsSection);

    container.appendChild(ui);

    // If using body fallback, auto-enable floating mode
    if (container === document.body) {
      enableFloating();
    }

    var record = document.createElement('div');
    record.id = IDS.RECORD_INDICATOR;
    record.className = 'loop-pulse';
    record.style.cssText = 'display:none;position:fixed;top:15px;right:15px;padding:8px 12px;background:#dc2626;border-radius:20px;color:#fff;font-size:12px;font-weight:bold;z-index:99999;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(220,38,38,.4);';
    record.innerHTML = '<span style="width:10px;height:10px;background:#fff;border-radius:50%;display:inline-block;"></span> LOOP';
    document.body.appendChild(record);

    // S-003: Page-awareness check - only handle Ctrl+Alt+Up/Down on project pages (not settings)
    function isOnProjectPageForShortcut() {
      var url = window.location.href;
      var isProject = url.indexOf('/projects/') !== -1;
      var isSettings = url.indexOf('/settings') !== -1;
      var isProjectNotSettings = isProject && !isSettings;
      return isProjectNotSettings;
    }

    document.addEventListener('keydown', function(e) {
      // Ctrl+/ to toggle JS Executor
      var isCtrlSlash = e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === '/' || e.code === 'Slash');
      if (isCtrlSlash) {
        e.preventDefault();
        var hidden = jsBody.style.display === 'none';
        jsBody.style.display = hidden ? '' : 'none';
        jsToggle.textContent = hidden ? '[-]' : '[+]';
        if (hidden) {
          var ta = document.getElementById(IDS.JS_EXECUTOR);
          if (ta) ta.focus();
        }
        return;
      }

      var isCtrlAlt = e.ctrlKey && e.altKey;
      if (!isCtrlAlt) return;

      var key = e.key.toLowerCase();

      var isToggleHide = key === 'h';
      if (isToggleHide) {
        e.preventDefault();
        var isHidden = ui.style.display === 'none';
        log('Ctrl+Alt+H pressed on MacroLoop, isHidden=' + isHidden);
        if (isHidden) {
          restorePanel();
        }
        return;
      }

      // S-003: Only process Up/Down on project pages to avoid conflict with ComboSwitch
      var isProjectContext = isOnProjectPageForShortcut();
      if (!isProjectContext) {
        log('Not on project page, skipping MacroLoop shortcut (letting ComboSwitch handle it)', 'skip');
        return;
      }

      var isUpArrow = e.key === 'ArrowUp';
      if (isUpArrow) {
        e.preventDefault();
        log('Ctrl+Alt+Up pressed on project page -> MacroLoop toggle');
        var isRunning = state.running;
        if (isRunning) {
          log('Loop is running, stopping via Ctrl+Alt+Up');
          stopLoop();
        } else {
          log('Starting loop UP via Ctrl+Alt+Up');
          startLoop('up');
        }
        return;
      }

      var isDownArrow = e.key === 'ArrowDown';
      if (isDownArrow) {
        e.preventDefault();
        log('Ctrl+Alt+Down pressed on project page -> MacroLoop toggle');
        var isRunning = state.running;
        if (isRunning) {
          log('Loop is running, stopping via Ctrl+Alt+Down');
          stopLoop();
        } else {
          log('Starting loop DOWN via Ctrl+Alt+Down');
          startLoop('down');
        }
        return;
      }

      // v7.9.32: Alt+Up/Down for instant force move via API
      var isAltOnly = e.altKey && !e.shiftKey && !e.ctrlKey;
      if (isAltOnly && e.key === 'ArrowUp') {
        e.preventDefault();
        log('Alt+Up → Force Move UP via API');
        forceSwitch('up');
        return;
      }
      if (isAltOnly && e.key === 'ArrowDown') {
        e.preventDefault();
        log('Alt+Down → Force Move DOWN via API');
        forceSwitch('down');
        return;
      }
    });

    log('UI created successfully with drag, hide/minimize, and keyboard shortcuts', 'success');
  }

  // ============================================
  // Initialize
  // ============================================

  var marker = document.createElement('div');
  marker.id = IDS.SCRIPT_MARKER;
  marker.style.display = 'none';
  marker.setAttribute('data-version', VERSION);
  document.body.appendChild(marker);

  window.__loopStart = startLoop;
  window.__loopStop = stopLoop;
  window.__loopCheck = runCheck;
  window.__loopState = function() { return state; };
  window.__loopSetInterval = setLoopInterval;
  window.__delegateComplete = delegateComplete;
  window.__setProjectButtonXPath = updateProjectButtonXPath;
  window.__setProgressXPath = updateProgressXPath;

  createUI();

  // v6.56: Start workspace MutationObserver (always-on, replaces v6.51 disabled auto-check)
  // No longer opens project dialog constantly — just watches the nav element for text changes
  log('Starting workspace MutationObserver (v6.56) — workspace name always visible', 'success');
  startWorkspaceObserver();

  // v7.7: Auto-fetch credit data on initialization (after short delay for page to settle)
  setTimeout(function() {
    log('Auto-fetching credit data via API (v7.7)...', 'check');
    fetchLoopCredits();
  }, 2000);

  // ============================================
  // S-002: MutationObserver to persist UI across SPA navigation
  // Watches for removal of marker/container and re-injects
  // ============================================
  (function setupPersistence() {
    var reinjectDebounce = null;
    var REINJECT_DELAY_MS = 500;

    function tryReinject() {
      var hasMarker = !!document.getElementById(IDS.SCRIPT_MARKER);
      var hasContainer = !!document.getElementById(IDS.CONTAINER);

      if (!hasMarker) {
        log('Marker removed by SPA navigation, re-placing', 'warn');
        var newMarker = document.createElement('div');
        newMarker.id = IDS.SCRIPT_MARKER;
        newMarker.style.display = 'none';
        newMarker.setAttribute('data-version', VERSION);
        document.body.appendChild(newMarker);
      }

      if (!hasContainer) {
        log('UI container removed by SPA navigation, re-creating', 'warn');
        createUI();
      }
    }

    var observer = new MutationObserver(function(mutations) {
      var hasRemovals = false;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].removedNodes.length > 0) {
          hasRemovals = true;
          break;
        }
      }
      if (!hasRemovals) return;

      var markerGone = !document.getElementById(IDS.SCRIPT_MARKER);
      var containerGone = !document.getElementById(IDS.CONTAINER);

      if (markerGone || containerGone) {
        if (reinjectDebounce) clearTimeout(reinjectDebounce);
        reinjectDebounce = setTimeout(function() {
          log('SPA navigation detected - checking UI state', 'check');
          tryReinject();
        }, REINJECT_DELAY_MS);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    log('MutationObserver installed for UI persistence', 'success');
  })();

  log('Initialization complete', 'success');

  // XPathUtils integration — no individual globals exposed (use XPathUtils.* in console)
  if (hasXPathUtils) {
    log('XPathUtils v' + window.XPathUtils.version + ' available — use XPathUtils.findByXPath(), XPathUtils.clickByXPath(), etc.', 'success');
  } else {
    log('XPathUtils NOT found — XPath console helpers unavailable. Inject xpath-utils.js first.', 'warn');
  }

  // v7.9.22: Diagnostic function — call window.__loopDiag() in JS Executor
  window.__loopDiag = function() {
    var diag = {
      version: VERSION,
      workspaceName: state.workspaceName,
      workspaceFromApi: state.workspaceFromApi,
      currentWsName: loopCreditState.currentWs ? (loopCreditState.currentWs.fullName || loopCreditState.currentWs.name) : '(null)',
      currentWsId: loopCreditState.currentWs ? loopCreditState.currentWs.id : '(null)',
      wsCount: (loopCreditState.perWorkspace || []).length,
      wsByIdKeys: Object.keys(loopCreditState.wsById || {}),
      projectId: extractProjectIdFromUrl(),
      lastCheckedAt: loopCreditState.lastCheckedAt ? new Date(loopCreditState.lastCheckedAt).toLocaleTimeString() : '(never)',
      source: loopCreditState.source
    };
    log('=== DIAGNOSTIC DUMP ===', 'warn');
    for (var k in diag) {
      var val = Array.isArray(diag[k]) ? '[' + diag[k].join(', ') + ']' : String(diag[k]);
      log('  ' + k + ': ' + val, 'check');
    }
    // Also list all workspace names with their IDs
    var perWs = loopCreditState.perWorkspace || [];
    for (var i = 0; i < perWs.length; i++) {
      log('  ws[' + i + ']: id=' + perWs[i].id + ' name="' + perWs[i].fullName + '"', 'check');
    }
    return diag;
  };

  log('Global functions: __loopStart("up"|"down"), __loopStop(), __loopCheck(), __loopDiag()');
  log('XPath functions: __setProjectButtonXPath(xpath), __setProgressXPath(xpath)');
  log('XPath: use XPathUtils.findByXPath(x), XPathUtils.clickByXPath(x), XPathUtils.fireAll(x)');
  log('Keyboard: Ctrl+Alt+Up/Down to toggle loop, Ctrl+Alt+H to show/hide');
})();
