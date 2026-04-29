// ============================================
// MacroLoop Controller
// Version from config.ini: __SCRIPT_VERSION__
// ============================================

(function() {
  'use strict';

  var FILE_NAME = 'macro-looping.js';
  var VERSION = '__SCRIPT_VERSION__';

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
  // Check for duplicate injection - tear down old instance to allow re-injection
  // ============================================
  if (document.getElementById(IDS.SCRIPT_MARKER)) {
    console.log('%c[MacroLoop v' + VERSION + '] Previous instance detected - tearing down for fresh injection', 'color: #fbbf24;');
    // Stop any running loop from previous instance
    if (typeof window.__loopStop === 'function') {
      try { window.__loopStop(); } catch (e) { /* ignore */ }
    }
    // Remove old marker and UI container
    var oldMarker = document.getElementById(IDS.SCRIPT_MARKER);
    if (oldMarker) oldMarker.remove();
    var oldContainer = document.getElementById(IDS.CONTAINER);
    if (oldContainer) oldContainer.remove();
    // Remove old record indicator
    var oldRecord = document.getElementById(IDS.RECORD_INDICATOR);
    if (oldRecord) oldRecord.remove();
    console.log('%c[MacroLoop v' + VERSION + '] Old instance removed, proceeding with fresh injection', 'color: #10b981;');
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
    statusRefreshId: null
  };

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
          if (name !== state.workspaceName) {
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
    if (!navXpath || navXpath.indexOf('__') === 0 || navXpath === '') {
      logSub('WorkspaceNavXPath not configured — cannot fetch from nav', 1);
      return false;
    }
    try {
      var el = getByXPath(navXpath);
      if (el) {
        var name = (el.textContent || '').trim();
        if (name) {
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
  // ============================================
  function runCheck() {
    log('=== MANUAL CHECK START ===', 'check');

    // Step 1: Click project button
    log('Step 1: Attempting to click Project Button...', 'check');
    var btnClicked = clickProjectButton();

    if (!btnClicked) {
      log('=== CHECK FAILED - Project button not found ===', 'error');
      return;
    }

    // Step 2: Wait for UI to update (500ms)
    log('Waiting 500ms for UI to update after click...', 'check');
    setTimeout(function() {
      log('Step 2: Checking for UI changes...', 'check');

      // Step 3: Check progress bar (should appear after button click)
      setTimeout(function() {
        log('Step 3: Checking Progress Bar...', 'check');
        log('Using XPath: ' + CONFIG.PROGRESS_XPATH + ' (+ fallbacks)', 'check');
        var progressEl = findElement(ML_ELEMENTS.PROGRESS);

        if (progressEl) {
          log('Progress Bar FOUND at XPath - System is BUSY', 'warn');
          highlightElement(progressEl, '#fbbf24');
          state.isIdle = false;
        } else {
          log('Progress Bar NOT FOUND at XPath - System is IDLE', 'success');
          log('Note: If nothing changed in UI, the XPath or button may be incorrect', 'warn');
          state.isIdle = true;
        }

        updateUI();
        log('=== MANUAL CHECK COMPLETE ===', 'check');
      }, 1000);
    }, 500);
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
  // Signal AHK via Clipboard
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
    log('Title signal set: ' + titleMarker, 'delegate');
    
    // SECONDARY: Also try clipboard (works for user-gesture triggers like Force buttons)
    try {
      navigator.clipboard.writeText(signal).catch(function() {
        // Clipboard failed (expected when DevTools focused) - title signal is primary
      });
    } catch (e) { /* ignore */ }
  }

  // ============================================
  // UI Update Functions
  // ============================================
  function updateUI() {
    updateStatus();
    updateButtons();
    updateRecordIndicator();
  }

  function updateStatus() {
    var el = document.getElementById(IDS.STATUS);
    if (!el) return;

    // Workspace name fragment (inline, yellow, bold)
    var wsFragment = '';
    if (state.workspaceName) {
      wsFragment = '<span style="color:#fbbf24;font-weight:700;">' + state.workspaceName + '</span> | ';
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

      var statusLine = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">'
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

      el.innerHTML = statusLine + progressBar;
    } else {
      var creditInfoStop = '';
      if (state.lastStatusCheck > 0) {
        var creditIconStop = state.hasFreeCredit ? '[Y]' : '[N]';
        var creditColorStop = state.hasFreeCredit ? '#10b981' : '#ef4444';
        var creditLabelStop = state.hasFreeCredit ? 'Free Credit' : 'No Credit';
        creditInfoStop = ' | <span style="color:' + creditColorStop + ';">' + creditIconStop + ' ' + creditLabelStop + '</span>';
      }
      el.innerHTML = wsFragment + '<span style="color:#9ca3af;">[=]</span> Stopped | Cycles: ' + state.cycleCount + creditInfoStop;
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
  // Run Cycle - Check credit first, then click button, check progress, delegate if IDLE
  // ============================================
  function runCycle() {
    // Check 1: Is loop running?
    if (!state.running) {
      log('SKIP: Loop not running', 'skip');
      return;
    }
    
    // Check 2: Are we waiting for AHK to complete? (with 60s timeout)
    if (state.isDelegating) {
      var elapsed = state.delegateStartTime ? (Date.now() - state.delegateStartTime) / 1000 : 0;
      if (elapsed > 60) {
        log('Delegate timeout after ' + Math.floor(elapsed) + 's - auto-recovering', 'warn');
        state.isDelegating = false;
        state.forceDirection = null;  // v6.55
        state.delegateStartTime = 0;
        document.title = document.title.replace(/__AHK_DELEGATE_(UP|DOWN)__URL:.*?__ENDURL__/g, '').replace(/__AHK_DELEGATE_(UP|DOWN)__/g, '');
        updateUI();
      } else {
        log('SKIP: Waiting for AHK delegate (' + Math.floor(elapsed) + 's)', 'skip');
        return;
      }
    }

    state.cycleCount++;
    state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
    log('--- Cycle #' + state.cycleCount + ' ---');

    // Step 0: Check if user is typing in prompt — skip cycle to avoid disruption
    if (isUserTypingInPrompt()) {
      log('SKIP: User is typing in prompt area — not opening project dialog', 'skip');
      return;
    }

    // Step 1: Ensure Project Dialog is OPEN (not toggle-close it)
    log('Step 1: Ensuring project dialog is open (not toggling)', 'check');
    var clicked = ensureProjectDialogOpen();
    
    if (!clicked) {
      log('Cycle aborted: project button not found', 'error');
      return;
    }

    // Step 2: Poll for main progress bar (dialog ready signal) instead of fixed wait
    log('Step 2: Polling for main progress bar (dialog ready signal)...', 'check');
    pollForDialogReady(function() {
      if (!state.running) {
        log('SKIP: Loop stopped during wait', 'skip');
        closeProjectDialog();
        return;
      }
      if (state.isDelegating) {
        log('SKIP: Delegate started from another source', 'skip');
        closeProjectDialog();
        return;
      }
      
      // Fetch workspace name from dialog
      fetchWorkspaceName();
      
      log('Step 3: Checking free credit progress bar (first check)', 'check');
      var hasProgressBar = checkSystemBusy();
      state.isIdle = !hasProgressBar;
      state.hasFreeCredit = hasProgressBar;
      state.lastStatusCheck = Date.now();
      
      if (hasProgressBar) {
        log('Free credit found - progress bar visible. NO delegation needed.', 'success');
        closeProjectDialog();
        updateUI();
        return;
      }

      // Step 4: DOUBLE-CONFIRM before delegation
      // Close and re-open dialog to eliminate race conditions
      log('Step 4: No credit on first check — DOUBLE-CONFIRMING before delegation...', 'warn');
      closeProjectDialog();
      
      setTimeout(function() {
        if (!state.running || state.isDelegating) {
          log('SKIP: Loop stopped or already delegating during double-confirm', 'skip');
          return;
        }

        var reOpened = ensureProjectDialogOpen();
        if (!reOpened) {
          log('Double-confirm: project button not found, proceeding with delegation', 'warn');
        }

        pollForDialogReady(function() {
          if (!state.running || state.isDelegating) {
            log('SKIP: State changed during double-confirm wait', 'skip');
            closeProjectDialog();
            return;
          }
          
          // Re-fetch workspace name
          fetchWorkspaceName();
          
          log('Step 4b: Re-checking free credit progress bar (CONFIRMATION check)', 'check');
          var hasProgressBarConfirm = checkSystemBusy();
          state.isIdle = !hasProgressBarConfirm;
          state.hasFreeCredit = hasProgressBarConfirm;
          state.lastStatusCheck = Date.now();
          
          // Always close dialog after checking
          closeProjectDialog();
          
          if (hasProgressBarConfirm) {
            log('DOUBLE-CONFIRM: Free credit found on re-check! Aborting delegation.', 'success');
            updateUI();
            return;
          }
          
          // Step 5: Confirmed no free credit - delegate to AHK
          log('CONFIRMED: No free credit after double-check — delegating to AHK', 'delegate');
          logSub('Direction: ' + state.direction.toUpperCase() + ', URL: ' + window.location.pathname, 1);
          state.isDelegating = true;
          state.delegateStartTime = Date.now();
          updateUI();
          
          // Write signal to clipboard for AHK to pick up
          dispatchDelegateSignal(state.direction);
        });
      }, 500); // Short gap between close and re-open
    });
  }

  // ============================================
  // Force Switch - Immediately trigger combo without waiting for idle
  // ============================================
  function forceSwitch(direction) {
    if (state.isDelegating) {
      log('BLOCKED: Already delegating, ignoring force ' + direction.toUpperCase(), 'warn');
      return;
    }
    log('=== FORCE ' + direction.toUpperCase() + ' ===', 'delegate');
    logSub('Bypassing idle check, sending delegate signal to AHK', 1);
    state.isDelegating = true;
    state.forceDirection = direction;  // v6.55: track force action
    state.delegateStartTime = Date.now();
    updateUI();
    dispatchDelegateSignal(direction);
  }

  window.__forceSwitch = forceSwitch;

  // ============================================
  // Delegate Complete - Called by AHK when done
  // ============================================
  function delegateComplete() {
    log('Delegate complete, combo action done', 'success');
    state.isDelegating = false;
    state.forceDirection = null;  // v6.55: clear force state
    state.delegateStartTime = 0;
    // Clean any title markers (v6.53: also clean URL-embedded format)
    document.title = document.title.replace(/__AHK_DELEGATE_(UP|DOWN)__URL:.*?__ENDURL__/g, '').replace(/__AHK_DELEGATE_(UP|DOWN)__/g, '');
    state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);
    updateUI();
    log('Next cycle in ' + state.countdown + 's');
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
      if (result !== undefined) {
        console.log('[MacroLoop v' + VERSION + '] Result:', result);
      }
      log('JS execution completed successfully', 'success');
    } catch (e) {
      log('JS execution error: ' + e.message, 'error');
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
    forceUpBtn.textContent = 'F-Up';
    forceUpBtn.title = 'Immediately trigger combo UP (bypass idle check)';
    forceUpBtn.style.cssText = btnStyle + 'background:#1d4ed8;color:#fff;font-size:10px;padding:4px 7px;';
    forceUpBtn.onclick = function() { forceSwitch('up'); };

    var forceDownBtn = document.createElement('button');
    forceDownBtn.textContent = 'F-Dn';
    forceDownBtn.title = 'Immediately trigger combo DOWN (bypass idle check)';
    forceDownBtn.style.cssText = btnStyle + 'background:#7c2d12;color:#fff;font-size:10px;padding:4px 7px;';
    forceDownBtn.onclick = function() { forceSwitch('down'); };

    btnRow.appendChild(forceUpBtn);
    btnRow.appendChild(forceDownBtn);

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
    jsSection.appendChild(jsHeader);
    jsSection.appendChild(jsBody);

    // XPath Tester - compact
    var xpathTestSection = document.createElement('div');
    xpathTestSection.style.cssText = 'padding:4px 6px;background:rgba(30,27,75,.6);border:1px solid #6d28d9;border-radius:4px;';

    var xpathTestTitle = document.createElement('div');
    xpathTestTitle.style.cssText = 'font-size:10px;color:#c4b5fd;font-weight:bold;margin-bottom:3px;';
    xpathTestTitle.textContent = 'XPath Tester';

    var xpathTestInput = document.createElement('input');
    xpathTestInput.type = 'text';
    xpathTestInput.id = 'xpath-test-input';
    xpathTestInput.placeholder = '//button[contains(text(),"Submit")]';
    xpathTestInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid #6d28d9;border-radius:3px;background:#1e1b4b;color:#e0e7ff;font-family:monospace;font-size:9px;margin-bottom:3px;box-sizing:border-box;';

    var xpathTestResult = document.createElement('div');
    xpathTestResult.id = 'xpath-test-result';
    xpathTestResult.style.cssText = 'font-size:9px;color:#a5b4fc;margin-bottom:3px;min-height:12px;word-break:break-all;';

    var xpathTestBtnRow = document.createElement('div');
    xpathTestBtnRow.style.cssText = 'display:flex;gap:4px;';

    var findBtn = document.createElement('button');
    findBtn.textContent = 'Find';
    findBtn.style.cssText = btnStyle + 'background:#4c1d95;color:#c4b5fd;flex:1;padding:3px 6px;font-size:10px;';
    findBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var xpath = document.getElementById('xpath-test-input').value.trim();
      var resEl = document.getElementById('xpath-test-result');
      if (!xpath) { resEl.textContent = 'Enter an XPath first'; resEl.style.color = '#fbbf24'; return; }
      try {
        var r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        var el = r.singleNodeValue;
        if (el) {
          resEl.style.color = '#4ade80';
          resEl.textContent = 'FOUND: <' + el.tagName.toLowerCase() + '> text="' + (el.textContent || '').substring(0, 60) + '"';
          el.style.outline = '3px solid lime';
          setTimeout(function() { el.style.outline = ''; }, 2500);
          log('XPathTest FIND: ' + xpath + ' -> FOUND <' + el.tagName.toLowerCase() + '>', 'success');
        } else {
          resEl.style.color = '#ef4444';
          resEl.textContent = 'NOT FOUND';
          log('XPathTest FIND: ' + xpath + ' -> NOT FOUND', 'error');
        }
      } catch (err) {
        resEl.style.color = '#ef4444';
        resEl.textContent = 'ERROR: ' + err.message;
        log('XPathTest FIND ERROR: ' + err.message, 'error');
      }
    };

    var clickBtn = document.createElement('button');
    clickBtn.textContent = 'Click';
    clickBtn.style.cssText = btnStyle + 'background:#7c2d12;color:#fdba74;flex:1;padding:3px 6px;font-size:10px;';
    clickBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var xpath = document.getElementById('xpath-test-input').value.trim();
      var resEl = document.getElementById('xpath-test-result');
      if (!xpath) { resEl.textContent = 'Enter an XPath first'; resEl.style.color = '#fbbf24'; return; }
      try {
        var r = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        var el = r.singleNodeValue;
        if (el) {
          // React-compatible click via shared helper
          reactClick(el, xpath);
          resEl.style.color = '#22d3ee';
          resEl.textContent = 'CLICKED: <' + el.tagName.toLowerCase() + '>';
          el.style.outline = '3px solid cyan';
          setTimeout(function() { el.style.outline = ''; }, 1500);
          log('XPathTest CLICK: ' + xpath + ' -> CLICKED', 'success');
        } else {
          resEl.style.color = '#ef4444';
          resEl.textContent = 'NOT FOUND - cannot click';
          log('XPathTest CLICK: ' + xpath + ' -> NOT FOUND', 'error');
        }
      } catch (err) {
        resEl.style.color = '#ef4444';
        resEl.textContent = 'ERROR: ' + err.message;
        log('XPathTest CLICK ERROR: ' + err.message, 'error');
      }
    };

    var fireAllBtn = document.createElement('button');
    fireAllBtn.textContent = 'Fire All';
    fireAllBtn.style.cssText = btnStyle + 'background:#065f46;color:#6ee7b7;flex:1;padding:3px 6px;font-size:10px;';
    fireAllBtn.title = 'Focus + Click sequence + Blur (for form elements)';
    fireAllBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      var xpath = document.getElementById('xpath-test-input').value.trim();
      var resEl = document.getElementById('xpath-test-result');
      if (!xpath) { resEl.textContent = 'Enter an XPath first'; resEl.style.color = '#fbbf24'; return; }
      if (hasXPathUtils && typeof window.XPathUtils.fireAll === 'function') {
        var result = window.XPathUtils.fireAll(xpath);
        if (result && result.found) {
          resEl.style.color = '#6ee7b7';
          resEl.textContent = 'FIRE ALL: <' + result.element.tagName.toLowerCase() + '> ' + (result.isForm ? '(focus+click+blur)' : '(click only)');
          result.element.style.outline = '3px solid #6ee7b7';
          setTimeout(function() { result.element.style.outline = ''; }, 2000);
          log('XPathTest FIRE ALL: ' + xpath + ' -> OK' + (result.isForm ? ' [form element]' : ''), 'success');
        } else {
          resEl.style.color = '#ef4444';
          resEl.textContent = 'NOT FOUND - cannot fire';
          log('XPathTest FIRE ALL: ' + xpath + ' -> NOT FOUND', 'error');
        }
      } else {
        resEl.style.color = '#fbbf24';
        resEl.textContent = 'XPathUtils.fireAll not available';
        log('XPathTest FIRE ALL: XPathUtils not loaded', 'warn');
      }
    };

    xpathTestBtnRow.appendChild(findBtn);
    xpathTestBtnRow.appendChild(clickBtn);
    xpathTestBtnRow.appendChild(fireAllBtn);

    xpathTestSection.appendChild(xpathTestTitle);
    xpathTestSection.appendChild(xpathTestInput);
    xpathTestSection.appendChild(xpathTestResult);
    xpathTestSection.appendChild(xpathTestBtnRow);

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

    // Assembly order: status, info, buttons, ws history, xpath config, xpath tester, activity, logs, JS executor (bottom)
    bodyElements = [status, infoRow, btnRow, wsHistoryBtn, wsHistoryPanel, xpathSection, xpathTestSection, activityToggleBtn, activityPanel, logExportRow, jsSection];

    ui.appendChild(titleRow);
    ui.appendChild(status);
    ui.appendChild(infoRow);
    ui.appendChild(btnRow);
    ui.appendChild(wsHistoryBtn);
    ui.appendChild(wsHistoryPanel);
    ui.appendChild(xpathSection);
    ui.appendChild(xpathTestSection);
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

  // v6.51: Removed auto-start of workspace status refresh
  // The 5-second auto-check was clicking the project button constantly, disrupting the UI.
  // Workspace name + credit status are now only checked during active loop cycles (runCycle).
  // Users can still trigger a manual check via the Check button.
  log('Workspace auto-check DISABLED (v6.51) — status only checked during active loop cycles', 'success');

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

  log('Global functions: __loopStart("up"|"down"), __loopStop(), __loopCheck()');
  log('XPath functions: __setProjectButtonXPath(xpath), __setProgressXPath(xpath)');
  log('XPath: use XPathUtils.findByXPath(x), XPathUtils.clickByXPath(x), XPathUtils.fireAll(x)');
  log('Keyboard: Ctrl+Alt+Up/Down to toggle loop, Ctrl+Alt+H to show/hide');
})();
