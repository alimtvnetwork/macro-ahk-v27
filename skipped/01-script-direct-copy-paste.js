// === PART 1: xpath-utils.js ===
// ============================================
// XPathUtils - Shared XPath & React Click Utilities
// Version: 2.0
// Injected by AHK BEFORE combo.js / macro-looping.js
// Exposes ONLY window.XPathUtils (no individual globals to avoid namespace collisions)
// Logger integration: call XPathUtils.setLogger(logFn, logSubFn, logWarnFn) to route logs into the calling script's storage
// ============================================

(function() {
  'use strict';

  var VERSION = '2.0';
  var PREFIX = '[XPathUtils]';

  // ============================================
  // Console colors
  // ============================================
  var COLOR = {
    FOUND: 'color: lime; font-weight: bold;',
    NOT_FOUND: 'color: #ef4444; font-weight: bold;',
    DETAIL: 'color: #a5b4fc;',
    CLICK: 'color: cyan; font-weight: bold;',
    WARN: 'color: orange; font-weight: bold;',
    BANNER: 'color: yellow; font-weight: bold;',
    INFO: 'color: #8b5cf6; font-weight: bold;',
    GRAY: 'color: gray;'
  };

  // ============================================
  // Logger integration
  // By default, logs go to console only.
  // Calling scripts (combo.js, macro-looping.js) call setLogger()
  // to route logs into their own localStorage log system.
  // ============================================
  var externalLog = null;
  var externalLogSub = null;
  var externalLogWarn = null;

  function setLogger(logFn, logSubFn, logWarnFn) {
    externalLog = logFn || null;
    externalLogSub = logSubFn || null;
    externalLogWarn = logWarnFn || null;
  }

  // Internal log helpers that route to external logger if set
  function log(funcName, message, style) {
    console.log('%c' + PREFIX + ' [' + funcName + '] ' + message, style || COLOR.DETAIL);
    if (externalLog) {
      try { externalLog(funcName, message); } catch (e) { /* ignore */ }
    }
  }

  function logSub(funcName, message) {
    console.log('%c' + PREFIX + '  ' + funcName + ': ' + message, COLOR.GRAY);
    if (externalLogSub) {
      try { externalLogSub(funcName, message); } catch (e) { /* ignore */ }
    }
  }

  function logWarn(funcName, message) {
    console.log('%c' + PREFIX + ' [' + funcName + '] WARN: ' + message, COLOR.WARN);
    if (externalLogWarn) {
      try { externalLogWarn(funcName, message); } catch (e) { /* ignore */ }
    }
  }

  // ============================================
  // logDomElement(el, label)
  // Logs comprehensive DOM details about an element.
  // ============================================
  function logDomElement(el, label) {
    label = label || 'Element';
    var fn = 'logDomElement';
    var tag = '<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '>';

    console.groupCollapsed('%c' + PREFIX + ' DOM: ' + label + ' ' + tag, COLOR.DETAIL);
    console.log('  Tag:', tag);
    console.log('  ID:', el.id || '(none)');
    console.log('  Classes:', el.className || '(none)');
    console.log('  Text:', (el.textContent || '').substring(0, 100));
    console.log('  Type:', el.getAttribute('type') || '(none)');
    console.log('  Role:', el.getAttribute('role') || '(none)');
    console.log('  aria-label:', el.getAttribute('aria-label') || '(none)');
    console.log('  aria-expanded:', el.getAttribute('aria-expanded'));
    console.log('  aria-haspopup:', el.getAttribute('aria-haspopup'));
    console.log('  disabled:', el.disabled || el.getAttribute('aria-disabled'));
    console.log('  data-state:', el.getAttribute('data-state'));

    // Visibility
    var rect = el.getBoundingClientRect();
    var isVisible = el.offsetParent !== null || el.offsetWidth > 0;
    console.log('  Visible:', isVisible);
    console.log('  BoundingRect:', JSON.stringify({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }));

    // Parent chain (3 levels)
    var parent = el.parentElement;
    var chain = [];
    for (var p = 0; p < 3 && parent; p++) {
      chain.push('<' + parent.tagName.toLowerCase() + (parent.id ? '#' + parent.id : '') + '>');
      parent = parent.parentElement;
    }
    console.log('  Parent chain:', chain.join(' → '));
    console.groupEnd();

    // Route summary to external logger
    log(fn, label + ' ' + tag + ' role=' + (el.getAttribute('role') || 'none') + ' visible=' + isVisible, COLOR.DETAIL);
  }

  // ============================================
  // checkOverlay(el)
  // Checks if another element is covering the target at its center point.
  // Returns { isCovered, coveringElement }
  // ============================================
  function checkOverlay(el) {
    var fn = 'checkOverlay';
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var topEl = document.elementFromPoint(cx, cy);

    if (!topEl) {
      logWarn(fn, 'elementFromPoint returned null (off-screen?)');
      return { isCovered: true, coveringElement: null };
    }

    var isSameOrChild = el === topEl || el.contains(topEl) || topEl.contains(el);
    if (!isSameOrChild) {
      var coverTag = '<' + topEl.tagName.toLowerCase() + (topEl.id ? '#' + topEl.id : '') + '>';
      logWarn(fn, 'OVERLAY DETECTED: ' + coverTag + ' covers target at (' + Math.round(cx) + ',' + Math.round(cy) + ')');
      logDomElement(topEl, 'Covering element');
      return { isCovered: true, coveringElement: topEl };
    }

    logSub(fn, 'No overlay — target is clear');
    return { isCovered: false, coveringElement: null };
  }

  // ============================================
  // reactClick(el, xpath)
  // Enhanced: Dispatches pointer + mouse events, logs every step, checks overlay, tracks aria-expanded.
  // ============================================
  function reactClick(el, xpath) {
    var fn = 'reactClick';
    xpath = xpath || '(direct call)';
    var tag = '<' + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '>';

    log(fn, '=== React Click Start ===', COLOR.BANNER);
    log(fn, 'Target: ' + tag + ' | XPath: ' + xpath, COLOR.BANNER);
    logDomElement(el, 'Click target');

    // Pre-click state
    var preExpanded = el.getAttribute('aria-expanded');
    var preState = el.getAttribute('data-state');
    logSub(fn, 'Pre-click: aria-expanded=' + preExpanded + ', data-state=' + preState);

    // Overlay check
    var overlay = checkOverlay(el);
    if (overlay.isCovered) {
      logWarn(fn, 'Element may be covered by overlay — click might not reach target!');
    }

    // Coordinates
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    logSub(fn, 'Coords: (' + Math.round(cx) + ', ' + Math.round(cy) + '), size: ' + Math.round(rect.width) + 'x' + Math.round(rect.height));

    var opts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy };
    var pointerOpts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true };

    // Dispatch full event sequence
    var events = [
      { type: 'pointerdown', cls: PointerEvent, o: pointerOpts },
      { type: 'mousedown',   cls: MouseEvent,   o: opts },
      { type: 'pointerup',   cls: PointerEvent, o: pointerOpts },
      { type: 'mouseup',     cls: MouseEvent,   o: opts },
      { type: 'click',       cls: MouseEvent,   o: opts }
    ];

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var dispatched = el.dispatchEvent(new ev.cls(ev.type, ev.o));
      logSub(fn, '→ ' + ev.type + ' dispatched (defaultPrevented=' + !dispatched + ')');
    }

    // Post-click state check (after microtask)
    setTimeout(function() {
      var postExpanded = el.getAttribute('aria-expanded');
      var postState = el.getAttribute('data-state');
      var expandedChanged = preExpanded !== postExpanded;
      var stateChanged = preState !== postState;

      if (expandedChanged || stateChanged) {
        log(fn, 'Post-click: aria-expanded=' + postExpanded + ' (' + (expandedChanged ? 'CHANGED ✓' : 'unchanged') + '), data-state=' + postState + ' (' + (stateChanged ? 'CHANGED ✓' : 'unchanged') + ')', COLOR.FOUND);
      } else {
        logWarn(fn, 'No state change detected — click may not have worked. Check isTrusted or overlay.');
        logSub(fn, 'Post-click: aria-expanded=' + postExpanded + ', data-state=' + postState);
      }
    }, 50);
  }

  // ============================================
  // findByXPath(xpath)
  // Enhanced: logs full DOM details for found elements.
  // ============================================
  function findByXPath(xpath) {
    var fn = 'findByXPath';
    if (!xpath || !xpath.trim()) {
      logWarn(fn, 'XPath is empty, returning null');
      return null;
    }
    try {
      var result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (result) {
        log(fn, 'FOUND: ' + xpath, COLOR.FOUND);
        logDomElement(result, 'Found element');
        // Highlight briefly
        var origOutline = result.style.outline;
        result.style.outline = '3px solid lime';
        setTimeout(function() { result.style.outline = origOutline; }, 2000);
        return result;
      } else {
        logSub(fn, 'NOT FOUND: ' + xpath);
        return null;
      }
    } catch (e) {
      logWarn(fn, 'Invalid XPath: ' + xpath + ' — ' + e.message);
      return null;
    }
  }

  // ============================================
  // findElement(descriptor) - Multi-method element finder
  // descriptor: { name, xpath, textMatch, tag, selector, role, ariaLabel, headingSearch }
  // ============================================
  function findElement(descriptor) {
    var fn = 'findElement';
    var name = descriptor.name || 'unknown';
    log(fn, 'Searching for "' + name + '"', COLOR.DETAIL);

    // Method 1: Configured XPath
    if (descriptor.xpath) {
      logSub(fn, 'Method 1 (XPath) for ' + name + ': ' + descriptor.xpath);
      var xpathResult = findByXPath(descriptor.xpath);
      if (xpathResult) {
        logSub(fn, name + ' FOUND via XPath');
        return xpathResult;
      }
      logWarn(fn, name + ' XPath failed — trying fallbacks');
    }

    // Method 2: Text-based scan
    if (descriptor.textMatch) {
      var tag = descriptor.tag || 'button';
      var texts = Array.isArray(descriptor.textMatch) ? descriptor.textMatch : [descriptor.textMatch];
      logSub(fn, 'Method 2 (text scan): looking for ' + JSON.stringify(texts) + ' in <' + tag + '>');
      var allTags = document.querySelectorAll(tag);
      for (var t = 0; t < allTags.length; t++) {
        var elText = (allTags[t].textContent || '').trim();
        for (var m = 0; m < texts.length; m++) {
          var isMatch = elText === texts[m] || elText.indexOf(texts[m]) !== -1;
          if (isMatch) {
            logSub(fn, name + ' FOUND via text scan: "' + elText.substring(0, 40) + '"');
            return allTags[t];
          }
        }
      }
      logSub(fn, 'No text match found');
    }

    // Method 3: CSS selector
    if (descriptor.selector) {
      var selectors = Array.isArray(descriptor.selector) ? descriptor.selector : [descriptor.selector];
      logSub(fn, 'Method 3 (CSS selector): trying ' + selectors.length + ' selectors');
      for (var s = 0; s < selectors.length; s++) {
        try {
          var selectorResult = document.querySelector(selectors[s]);
          if (selectorResult) {
            logSub(fn, name + ' FOUND via selector: ' + selectors[s]);
            return selectorResult;
          }
        } catch (e) {
          logWarn(fn, 'Invalid selector: ' + selectors[s]);
        }
      }
      logSub(fn, 'No CSS selector match');
    }

    // Method 4: ARIA/role attributes
    if (descriptor.ariaLabel || descriptor.role) {
      logSub(fn, 'Method 4 (ARIA/role)');
      if (descriptor.ariaLabel) {
        var ariaLabels = Array.isArray(descriptor.ariaLabel) ? descriptor.ariaLabel : [descriptor.ariaLabel];
        for (var a = 0; a < ariaLabels.length; a++) {
          var ariaSelector = '[aria-label*="' + ariaLabels[a] + '" i], [title*="' + ariaLabels[a] + '" i]';
          try {
            var ariaResult = document.querySelector(ariaSelector);
            if (ariaResult) {
              logSub(fn, name + ' FOUND via ARIA label: ' + ariaLabels[a]);
              return ariaResult;
            }
          } catch (e) { /* ignore */ }
        }
      }
      if (descriptor.role) {
        var roleSelector = '[role="' + descriptor.role + '"]';
        var roleResult = document.querySelector(roleSelector);
        if (roleResult) {
          logSub(fn, name + ' FOUND via role: ' + descriptor.role);
          return roleResult;
        }
      }
      logSub(fn, 'No ARIA/role match');
    }

    // Method 5: Heading proximity search
    if (descriptor.headingSearch) {
      logSub(fn, 'Method 5 (heading proximity): looking for heading with "' + descriptor.headingSearch + '"');
      var headings = document.querySelectorAll('h2, h3, h4, div[class*="heading"], div[class*="title"]');
      for (var h = 0; h < headings.length; h++) {
        var headingText = (headings[h].textContent || '').trim().toLowerCase();
        var isHeadingMatch = headingText.indexOf(descriptor.headingSearch.toLowerCase()) !== -1;
        if (isHeadingMatch) {
          var parent = headings[h].closest('div');
          var walkNode = parent;
          var walkTag = descriptor.tag || 'button';
          var maxWalk = 5;
          var walkCount = 0;
          while (walkNode && walkCount < maxWalk) {
            var nearbyEl = walkNode.querySelector(walkTag);
            if (nearbyEl) {
              logSub(fn, name + ' FOUND near heading "' + headingText.substring(0, 30) + '" at walk level ' + walkCount);
              return nearbyEl;
            }
            walkNode = walkNode.parentElement;
            walkCount++;
          }
        }
      }
      logSub(fn, 'No heading proximity match');
    }

    // All methods failed
    logWarn(fn, 'All methods failed for "' + name + '"');
    return null;
  }

  // ============================================
  // clickByXPath(xpath) - Find + click
  // ============================================
  function clickByXPath(xpath) {
    var el = findByXPath(xpath);
    if (el) {
      reactClick(el, xpath);
      log('clickByXPath', 'CLICKED: ' + xpath, COLOR.CLICK);
      return true;
    }
    return false;
  }

  // ============================================
  // findAndClick(xpath) - Find + overlay check + click
  // ============================================
  function findAndClick(xpath) {
    var fn = 'findAndClick';
    log(fn, '=== Find & Click ===', COLOR.BANNER);
    logSub(fn, 'Target: ' + xpath);
    var el = findByXPath(xpath);
    var result = { found: !!el, clicked: false, element: el, overlay: null };
    if (el) {
      result.overlay = checkOverlay(el);
      try {
        reactClick(el, xpath);
        result.clicked = true;
        log(fn, 'SUCCESS', COLOR.FOUND);
      } catch (e) {
        logWarn(fn, 'CLICK FAILED: ' + e.message);
      }
    } else {
      logWarn(fn, 'Element not found');
    }
    return result;
  }

  // ============================================
  // probeIsTrusted(xpath) - Diagnose isTrusted issues
  // ============================================
  function probeIsTrusted(xpath) {
    var fn = 'probeIsTrusted';
    log(fn, '=== isTrusted Probe ===', COLOR.BANNER);
    logSub(fn, 'Will click: ' + xpath);

    var eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    var listeners = [];

    function makeListener(type) {
      var handler = function(e) {
        console.log('%c' + PREFIX + ' [Probe] ' + type + ': target=<' + e.target.tagName.toLowerCase() + (e.target.id ? '#' + e.target.id : '') + '>, isTrusted=' + e.isTrusted + ', bubbles=' + e.bubbles, e.isTrusted ? COLOR.FOUND : COLOR.WARN);
      };
      document.addEventListener(type, handler, true);
      listeners.push({ type: type, handler: handler });
    }

    for (var i = 0; i < eventTypes.length; i++) {
      makeListener(eventTypes[i]);
    }

    clickByXPath(xpath);

    setTimeout(function() {
      for (var j = 0; j < listeners.length; j++) {
        document.removeEventListener(listeners[j].type, listeners[j].handler, true);
      }
      logSub(fn, 'Listeners removed. Check results above.');
    }, 500);
  }

  // ============================================
  // inspectListeners(xpath) - Show event listeners + React handlers
  // ============================================
  function inspectListeners(xpath) {
    var fn = 'inspectListeners';
    var el = findByXPath(xpath);
    if (!el) return;
    log(fn, '=== Event Listener Inspection ===', COLOR.BANNER);

    if (typeof getEventListeners === 'function') {
      var listeners = getEventListeners(el);
      console.log(PREFIX + ' Listeners on element:', listeners);
    } else {
      logSub(fn, 'getEventListeners not available (only in Chrome DevTools console)');
      var props = ['onclick', 'onmousedown', 'onmouseup', 'onpointerdown', 'onpointerup'];
      for (var i = 0; i < props.length; i++) {
        if (el[props[i]]) {
          logSub(fn, props[i] + ': ' + (typeof el[props[i]]));
        }
      }
      // Check React fiber
      var fiberKey = Object.keys(el).find(function(k) { return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'); });
      if (fiberKey) {
        logSub(fn, 'React fiber found: ' + fiberKey);
        var propsKey = Object.keys(el).find(function(k) { return k.startsWith('__reactProps'); });
        if (propsKey) {
          var reactProps = el[propsKey];
          var handlerKeys = Object.keys(reactProps).filter(function(k) { return k.startsWith('on'); });
          logSub(fn, 'React event handlers: ' + (handlerKeys.length > 0 ? handlerKeys.join(', ') : '(none)'));
        }
      } else {
        logSub(fn, 'No React fiber found on element');
      }
    }
  }

  // ============================================
  // fireAll(xpath) - Ultimate interaction simulator
  // Focus + pointer/mouse sequence + blur for form elements
  // ============================================
  function fireAll(xpath) {
    var fn = 'fireAll';
    log(fn, '=== Fire All Events ===', COLOR.BANNER);
    logSub(fn, 'XPath: ' + xpath);

    var el = findByXPath(xpath);
    if (!el) {
      logWarn(fn, 'Element not found — aborting');
      return { found: false, element: null, isFormElement: false };
    }

    logDomElement(el, 'fireAll target');

    // Detect form elements
    var tag = el.tagName.toLowerCase();
    var isFormElement = (tag === 'input' || tag === 'textarea' || tag === 'select' ||
                         el.getAttribute('contenteditable') === 'true' ||
                         el.getAttribute('role') === 'textbox' ||
                         el.getAttribute('role') === 'combobox' ||
                         el.getAttribute('role') === 'listbox');

    logSub(fn, 'isFormElement=' + isFormElement + ' (tag=' + tag + ')');

    // Overlay check
    var overlay = checkOverlay(el);
    if (overlay.isCovered) {
      logWarn(fn, 'Overlay detected — events may not reach target');
    }

    // Pre-interaction state
    var preExpanded = el.getAttribute('aria-expanded');
    var preState = el.getAttribute('data-state');
    var preValue = el.value !== undefined ? el.value : null;
    var activeBeforeClick = document.activeElement;
    logSub(fn, 'Pre-state: aria-expanded=' + preExpanded + ', data-state=' + preState + ', value=' + (preValue !== null ? '"' + String(preValue).substring(0, 30) + '"' : 'N/A'));

    // Coordinates
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var coordOpts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy };
    var pointerOpts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true };

    // Phase 1: Focus (form elements only)
    if (isFormElement) {
      logSub(fn, 'Phase 1: Dispatching focus events');
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true, cancelable: false, relatedTarget: activeBeforeClick }));
      logSub(fn, '→ focusin dispatched');
      el.dispatchEvent(new FocusEvent('focus', { bubbles: false, cancelable: false, relatedTarget: activeBeforeClick }));
      logSub(fn, '→ focus dispatched');
      try { el.focus(); } catch (e) { /* some elements reject focus */ }
      logSub(fn, '→ el.focus() called (activeElement=' + document.activeElement.tagName.toLowerCase() + ')');
    }

    // Phase 2: Pointer + Mouse sequence
    logSub(fn, 'Phase 2: Dispatching pointer + mouse events at (' + Math.round(cx) + ',' + Math.round(cy) + ')');
    var events = [
      { type: 'pointerdown', cls: PointerEvent, o: pointerOpts },
      { type: 'mousedown',   cls: MouseEvent,   o: coordOpts },
      { type: 'pointerup',   cls: PointerEvent, o: pointerOpts },
      { type: 'mouseup',     cls: MouseEvent,   o: coordOpts },
      { type: 'click',       cls: MouseEvent,   o: coordOpts }
    ];

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var dispatched = el.dispatchEvent(new ev.cls(ev.type, ev.o));
      logSub(fn, '→ ' + ev.type + ' dispatched (defaultPrevented=' + !dispatched + ')');
    }

    // Phase 3: Blur (form elements, after delay)
    if (isFormElement) {
      setTimeout(function() {
        logSub(fn, 'Phase 3: Dispatching blur events');
        el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, relatedTarget: null }));
        logSub(fn, '→ focusout dispatched');
        el.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, relatedTarget: null }));
        logSub(fn, '→ blur dispatched');
      }, 100);
    }

    // Phase 4: Post-interaction state check
    setTimeout(function() {
      var postExpanded = el.getAttribute('aria-expanded');
      var postState = el.getAttribute('data-state');
      var postValue = el.value !== undefined ? el.value : null;
      var expandedChanged = preExpanded !== postExpanded;
      var stateChanged = preState !== postState;
      var valueChanged = preValue !== null && postValue !== null && preValue !== postValue;
      var anyChange = expandedChanged || stateChanged || valueChanged;

      if (anyChange) {
        log(fn, 'Post-state: expanded=' + (expandedChanged ? 'CHANGED ✓' : 'same') + ', state=' + (stateChanged ? 'CHANGED ✓' : 'same') + (preValue !== null ? ', value=' + (valueChanged ? 'CHANGED ✓' : 'same') : ''), COLOR.FOUND);
      } else {
        logWarn(fn, 'No state change detected — interaction may not have worked.');
      }
      log(fn, '=== Fire All Complete ===', COLOR.BANNER);
    }, 150);

    return { found: true, element: el, isFormElement: isFormElement };
  }

  // ============================================
  // Expose ONLY as window.XPathUtils — no individual globals
  // ============================================
  window.XPathUtils = {
    version: VERSION,
    setLogger: setLogger,
    reactClick: reactClick,
    findByXPath: findByXPath,
    findElement: findElement,
    clickByXPath: clickByXPath,
    findAndClick: findAndClick,
    fireAll: fireAll,
    checkOverlay: checkOverlay,
    logDomElement: logDomElement,
    probeIsTrusted: probeIsTrusted,
    inspectListeners: inspectListeners
  };

  console.log('%c' + PREFIX + ' v' + VERSION + ' loaded — access via window.XPathUtils only', COLOR.INFO);
  console.log('%c  XPathUtils.reactClick(el, xpath?)      — Full 5-event sequence with logging', COLOR.GRAY);
  console.log('%c  XPathUtils.findByXPath(xpath)           — Find & log DOM element details', COLOR.GRAY);
  console.log('%c  XPathUtils.findElement(descriptor)      — Multi-method element finder', COLOR.GRAY);
  console.log('%c  XPathUtils.clickByXPath(xpath)          — Find + click', COLOR.GRAY);
  console.log('%c  XPathUtils.findAndClick(xpath)          — Find + overlay check + click', COLOR.GRAY);
  console.log('%c  XPathUtils.fireAll(xpath)               — Focus + pointer/mouse + blur (form-aware)', COLOR.GRAY);
  console.log('%c  XPathUtils.probeIsTrusted(xpath)        — Click + log isTrusted', COLOR.GRAY);
  console.log('%c  XPathUtils.inspectListeners(xpath)      — Show event listeners + React', COLOR.GRAY);
  console.log('%c  XPathUtils.checkOverlay(el)             — Check if element is covered', COLOR.GRAY);
  console.log('%c  XPathUtils.logDomElement(el, label?)     — Log full DOM details', COLOR.GRAY);
  console.log('%c  XPathUtils.setLogger(logFn, logSubFn, logWarnFn) — Route logs to caller', COLOR.GRAY);

})();


// === PART 2: macro-looping.js (compiled) ===
// ============================================
// MacroLoop Controller
// Version from config.ini: 7.18
// ============================================

(function() {
  'use strict';

  var FILE_NAME = 'macro-looping.js';
  var VERSION = '7.30';

  // === Domain Guard: Prevent injection into DevTools or non-page contexts ===
  var currentHostname = window.location.hostname || '(empty)';
  var currentHref = window.location.href || '(empty)';
  var isPageContext = (
    currentHostname.indexOf('lovable.dev') !== -1 ||
    currentHostname.indexOf('lovable.app') !== -1 ||
    currentHostname === 'localhost'
  );
  if (!isPageContext && !window.__comboForceInject) {
    console.warn(
      '[MacroLoop] DOMAIN GUARD ABORT (line ~21)\n' +
      '  hostname: ' + currentHostname + '\n' +
      '  href: ' + currentHref + '\n' +
      '  expected: lovable.dev | lovable.app | localhost\n' +
      '  cause: Script executed in DevTools context instead of page context.\n' +
      '  bypass: Set window.__comboForceInject = true before pasting.\n' +
      '  UI will NOT be injected here.'
    );
    return;
  }

  // ============================================
  // IDs from config.ini (replaced by AHK)
  // ============================================
  var IDS = {
    SCRIPT_MARKER: 'ahk-loop-script',
    CONTAINER: 'ahk-loop-container',
    STATUS: 'ahk-loop-status',
    START_BTN: 'ahk-loop-start-btn',
    STOP_BTN: 'ahk-loop-stop-btn',
    UP_BTN: 'ahk-loop-up-btn',
    DOWN_BTN: 'ahk-loop-down-btn',
    RECORD_INDICATOR: 'ahk-loop-record',
    JS_EXECUTOR: 'ahk-loop-js-executor',
    JS_EXECUTE_BTN: 'ahk-loop-js-execute-btn'
  };

  // ============================================
  // Timing from config.ini (replaced by AHK)
  // ============================================
  var TIMING = {
    LOOP_INTERVAL: 100000,
    COUNTDOWN_INTERVAL: 1000,
    FIRST_CYCLE_DELAY: 500,
    POST_COMBO_DELAY: 4000,
    PAGE_LOAD_DELAY: 2500,
    DIALOG_WAIT: 3000,
    WS_CHECK_INTERVAL: 5000
  };

  // ============================================
  // XPaths and URLs from config.ini (can be changed on the fly)
  // ============================================
  var CONFIG = {
    PROJECT_BUTTON_XPATH: '/html/body/div[2]/div/div[2]/nav/div/div/div/div[1]/div[1]/button',
    MAIN_PROGRESS_XPATH: '/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[1]',
    PROGRESS_XPATH: '/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[2]',
    WORKSPACE_XPATH: '/html/body/div[6]/div/div[2]/div[1]/p',
    WORKSPACE_NAV_XPATH: '',
    CONTROLS_XPATH: '/html/body/div[3]/div/div[2]/main/div/div/div[3]',
    PROMPT_ACTIVE_XPATH: '/html/body/div[2]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]',
    PROJECT_NAME_XPATH: '/html/body/div[2]/div/div/div/div/div/div/div[1]/div/div/div[2]/div/div[1]/div/p',
    REQUIRED_DOMAIN: 'https://lovable.dev/',
    SETTINGS_PATH: '/settings?tab=project',
    DEFAULT_VIEW: '?view=codeEditor'
  };

  // ============================================
  // INIT: Idempotent — skip if already embedded
  // Flow: AHK checks marker first, injects macro-looping.js only if absent,
  //       then calls __loopStart(direction) separately.
  // ============================================
  if (document.getElementById(IDS.SCRIPT_MARKER)) {
    // v7.9.47: Also verify global functions exist — a previous crashed injection may have
    // left the marker but failed before defining __loopStart (e.g., ui-not-defined crash).
    if (typeof window.__loopStart === 'function') {
      console.log('%c[MacroLoop v' + VERSION + '] Already embedded (marker=' + IDS.SCRIPT_MARKER + ') — skipping injection, UI and state intact', 'color: #10b981; font-weight: bold;');
      return; // Exit IIFE — no teardown, no re-creation
    }
    // Marker exists but globals missing — previous injection crashed. Remove stale marker and re-init.
    console.warn('[MacroLoop v' + VERSION + '] Stale marker found (globals missing) — removing marker and re-initializing');
    var staleMarker = document.getElementById(IDS.SCRIPT_MARKER);
    if (staleMarker) staleMarker.remove();
    var staleContainer = document.getElementById(IDS.CONTAINER);
    if (staleContainer) staleContainer.remove();
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
  var WS_HISTORY_MAX_ENTRIES = 50;

  // v7.9.39: Extract project ID from URL for project-scoped storage keys
  function getProjectIdFromUrl() {
    var url = window.location.href;
    var match = url.match(/\/projects\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  function getWsHistoryKey() {
    var projectId = getProjectIdFromUrl();
    return projectId ? WS_HISTORY_KEY + '_' + projectId : WS_HISTORY_KEY;
  }

  // v7.9.39: Get project name from DOM via ProjectNameXPath
  function getProjectNameFromDom() {
    var xp = CONFIG.PROJECT_NAME_XPATH;
    if (!xp || xp.charAt(0) === '_') return null;
    try {
      var el = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (el) {
        var text = (el.textContent || '').trim();
        if (text) return text;
      }
    } catch (e) { /* XPath error */ }
    return null;
  }

  // v7.9.39: Display project name (DOM XPath > document title > URL ID)
  function getDisplayProjectName() {
    var domName = getProjectNameFromDom();
    if (domName) return domName;
    var titleMatch = (document.title || '').match(/^(.+?)\s*[-–—]\s*Lovable/);
    if (titleMatch) return titleMatch[1].trim();
    var pid = getProjectIdFromUrl();
    return pid ? pid.substring(0, 8) : 'Unknown Project';
  }

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

  // ============================================
  // CSV Export: Workspace names + credits (ascending sort by name)
  // ============================================
  function exportWorkspacesAsCsv() {
    var workspaces = loopCreditState.perWorkspace;
    if (!workspaces || workspaces.length === 0) {
      log('CSV Export: No workspace data — fetch credits first (💳)', 'warn');
      return;
    }

    // Sort ascending by fullName (case-insensitive)
    var sorted = workspaces.slice().sort(function(a, b) {
      return (a.fullName || '').toLowerCase().localeCompare((b.fullName || '').toLowerCase());
    });

    var lines = [];
    lines.push('Workspace Name,Daily Free,Daily Limit,Daily Used,Rollover,Rollover Limit,Rollover Used,Billing Available,Billing Limit,Billing Used,Granted,Granted Remaining,Topup Limit,Total Credits,Available Credits,Subscription,Role');
    for (var i = 0; i < sorted.length; i++) {
      var ws = sorted[i];
      var row = [
        '"' + (ws.fullName || '').replace(/"/g, '""') + '"',
        ws.dailyFree,
        ws.dailyLimit,
        ws.dailyUsed,
        ws.rollover,
        ws.rolloverLimit,
        ws.rolloverUsed,
        ws.billingAvailable,
        ws.limit,
        ws.used,
        ws.freeGranted,
        ws.freeRemaining,
        ws.topupLimit,
        ws.totalCredits,
        ws.available,
        '"' + (ws.subscriptionStatus || '').replace(/"/g, '""') + '"',
        '"' + (ws.role || '').replace(/"/g, '""') + '"'
      ];
      lines.push(row.join(','));
    }

    var csvText = lines.join('\n');
    var blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'workspaces-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('CSV Export: Downloaded ' + sorted.length + ' workspaces (sorted A→Z)', 'success');
  }

  window.__loopLogs = { copy: copyLogsToClipboard, download: downloadLogs, get: getAllLogs, clear: clearAllLogs, format: formatLogsForExport };
  window.__loopExportCsv = exportWorkspacesAsCsv;

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

  // v7.9.46: Read bearer token from lovable-session-id.id cookie with comprehensive diagnostics
  function getBearerTokenFromCookie() {
    var fn = 'getBearerTokenFromCookie';
    try {
      var rawCookie = document.cookie;
      var cookieCount = rawCookie ? rawCookie.split(';').length : 0;
      var cookieNames = rawCookie ? rawCookie.split(';').map(function(c) { return c.trim().split('=')[0]; }) : [];

      log(fn + ': === COOKIE DIAGNOSTIC START ===', 'info');
      log(fn + ': document.cookie accessible: ' + (typeof document.cookie === 'string' ? 'YES' : 'NO'), 'info');
      log(fn + ': Total cookies visible to JS: ' + cookieCount, 'info');
      log(fn + ': Cookie names visible: [' + cookieNames.join(', ') + ']', 'info');
      log(fn + ': Raw cookie string length: ' + rawCookie.length + ' chars', 'info');

      if (cookieCount === 0 || rawCookie.length === 0) {
        log(fn + ': ⚠ NO cookies visible to JavaScript at all!', 'warn');
        log(fn + ': PROBABLE CAUSE: All cookies are HttpOnly (server-set, JS cannot read them)', 'warn');
        log(fn + ': HttpOnly cookies are visible in DevTools > Application > Cookies but NOT to document.cookie', 'warn');
        log(fn + ': SOLUTION: Copy the token manually from DevTools > Application > Cookies > lovable-session-id.id', 'warn');
        log(fn + ': === COOKIE DIAGNOSTIC END (no cookies) ===', 'info');
        return '';
      }

      var hasTarget = false;
      var cookies = rawCookie.split(';');
      for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i].trim();
        if (c.indexOf('lovable-session-id.id=') === 0) {
          hasTarget = true;
          var val = c.substring('lovable-session-id.id='.length);
          log(fn + ': ✅ Found "lovable-session-id.id" cookie', 'info');
          log(fn + ':   Value length: ' + (val ? val.length : 0), 'info');
          log(fn + ':   Preview: ' + (val ? val.substring(0, 12) + '...REDACTED' : '(empty)'), 'info');
          if (val && val.length >= 10) {
            log(fn + ': ✅ Cookie value is valid (len=' + val.length + ')', 'success');
            log(fn + ': === COOKIE DIAGNOSTIC END (success) ===', 'info');
            return val;
          } else {
            log(fn + ': ⚠ Cookie found but value too short (len=' + (val ? val.length : 0) + ', min=10)', 'warn');
            log(fn + ': PROBABLE CAUSE: Cookie was cleared/corrupted or session expired', 'warn');
          }
        }
      }

      if (!hasTarget) {
        log(fn + ': ❌ "lovable-session-id.id" NOT found among ' + cookieCount + ' visible cookies', 'warn');
        log(fn + ': Visible cookie names: [' + cookieNames.join(', ') + ']', 'warn');
        log(fn + ': PROBABLE CAUSE: The session cookie is HttpOnly — JS cannot access it', 'warn');
        log(fn + ': HttpOnly cookies are set with "Set-Cookie: HttpOnly" flag by the server', 'warn');
        log(fn + ': They appear in DevTools > Application > Cookies but document.cookie cannot read them', 'warn');
        log(fn + ': SOLUTION: Manually copy from DevTools > Application > Cookies, or use Paste button', 'warn');
      }
      log(fn + ': === COOKIE DIAGNOSTIC END (not found) ===', 'info');
    } catch (e) {
      log(fn + ': ❌ EXCEPTION reading cookies: ' + e.message, 'error');
      log(fn + ': This may happen in sandboxed iframes or restricted contexts', 'error');
    }
    return '';
  }

  // v7.9.35: Resolve bearer token with cookie fallback chain:
  // localStorage > lovable-session-id.id cookie
  function resolveToken() {
    var token = getBearerTokenFromStorage();
    if (token) return token;
    token = getBearerTokenFromCookie();
    if (token) {
      // Auto-save cookie token to localStorage for future use
      try { localStorage.setItem(BEARER_STORAGE_KEY, token); } catch(e) {}
      log('resolveToken: Recovered bearer token from session cookie → saved to localStorage', 'success');
    }
    return token;
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
  function calcAvailableCredits(totalCredits, rolloverUsed, dailyUsed, billingUsed, freeUsed) {
    // v7.12.0: Include freeUsed (credits_used against credits_granted) — previously omitted,
    // causing available to be inflated by unspent granted credits
    return Math.max(0, Math.round(totalCredits - (rolloverUsed || 0) - (dailyUsed || 0) - (billingUsed || 0) - (freeUsed || 0)));
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
      // Available Credit = Total Credits - rollover_credits_used - daily_credits_used - billing_period_credits_used - credits_used
      var available = calcAvailableCredits(totalCredits, rUsed, dUsed, bUsed, freeUsed);

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

    // v7.9.35: Unified token resolution (localStorage > cookie)
    var token = resolveToken();
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
          // v7.17: Mark token expired on 401/403 so UI shows "replace token" prompt
          if (resp.status === 401 || resp.status === 403) {
            markBearerTokenExpired('loop');
          }
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
          var token = resolveToken();
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

  // v7.11.3: Promise-returning version of fetchLoopCredits for awaitable calls (e.g., Check button)
  function fetchLoopCreditsAsync() {
    var url = CREDIT_API_BASE + '/user/workspaces';
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    var token = resolveToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    log('Credit API (async): GET ' + url, 'check');
    return fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
      .then(function(resp) {
        if (!resp.ok) {
          // v7.17: Mark token expired on 401/403
          if (resp.status === 401 || resp.status === 403) {
            markBearerTokenExpired('loop');
          }
          throw new Error('HTTP ' + resp.status);
        }
        return resp.text();
      })
      .then(function(bodyText) {
        bodyText = (bodyText || '').trim();
        if (!bodyText) throw new Error('Empty response body');
        var data = JSON.parse(bodyText);
        parseLoopApiResponse(data);
        log('Credit API (async): parsed ' + (loopCreditState.perWorkspace || []).length + ' workspaces', 'success');
      });
  }

  // v7.16: Auto-detect current workspace.
  // Tier 1 (mark-viewed API) REMOVED in v7.16.
  // Now: XPath detection via Project Dialog (Tier 2) → Default to first workspace (Tier 3)
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

    // v7.9.34: GUARD — If workspace was already set authoritatively (e.g. post-move API success),
    // skip detection entirely. Just match the known name against the workspace list.
    if (state.workspaceFromApi && state.workspaceName) {
      var matched = null;
      for (var g = 0; g < perWs.length; g++) {
        if (perWs[g].fullName === state.workspaceName || perWs[g].name === state.workspaceName) {
          matched = perWs[g];
          break;
        }
      }
      if (matched) {
        loopCreditState.currentWs = matched;
        log(fn + ': ✅ GUARD — workspace already set authoritatively: "' + state.workspaceName + '" (skipping detection)', 'success');
        return Promise.resolve();
      }
      // Name doesn't match any workspace — fall through to detection
      log(fn + ': GUARD — workspaceFromApi=true but "' + state.workspaceName + '" not found in list, falling through to XPath detection', 'warn');
      state.workspaceFromApi = false;
    }

    // ---- XPath detection via Project Dialog (formerly Tier 2) ----
    log(fn + ': Detecting workspace via Project Dialog XPath...', 'check');
    return detectWorkspaceViaProjectDialog(fn, perWs);
  }

  // v7.9.25: Detect workspace by clicking the Project Button → reading WorkspaceNameXPath
  // This is the reliable DOM fallback: the project dialog always shows the workspace name.
  // Flow: click ProjectButtonXPath → wait for dialog → read WorkspaceNameXPath → validate → close dialog
  function detectWorkspaceViaProjectDialog(callerFn, perWs) {
    var fn = callerFn || 'detectWsViaDialog';
    perWs = perWs || []; // v7.27: Guard against undefined/null
    var hasWorkspaces = perWs.length > 0;
    if (!hasWorkspaces) {
      log(fn + ': No workspaces loaded — will still try to read workspace name from dialog XPath directly', 'warn');
    }

    log(fn + ': Tier 2 — Opening project dialog to read workspace name...', 'check');
    logSub('ProjectButtonXPath: ' + CONFIG.PROJECT_BUTTON_XPATH, 1);
    logSub('WorkspaceNameXPath: ' + CONFIG.WORKSPACE_XPATH, 1);

    // v7.12.0: Retry finding the project button up to 3 times with 1s delays
    // On first load, DOM may not be ready when detection fires immediately after API response
    return findProjectButtonWithRetry(fn, 3, 1000).then(function(btn) {
      if (!btn) {
        log(fn + ': Project button NOT found after retries — cannot open dialog. XPath=' + CONFIG.PROJECT_BUTTON_XPATH, 'error');
        // v7.27: Guard against empty perWs
        if (!state.workspaceName && perWs.length > 0) {
          state.workspaceName = perWs[0].fullName || perWs[0].name;
          loopCreditState.currentWs = perWs[0];
          log(fn + ': Defaulted to first workspace: ' + state.workspaceName, 'warn');
        } else {
          log(fn + ': Keeping existing workspace: ' + (state.workspaceName || '(none)'), 'warn');
        }
        return Promise.resolve();
      }
      return openDialogAndPoll(fn, btn, perWs);
    });
  }

  // v7.12.0: Retry finding the project button with delay between attempts
  function findProjectButtonWithRetry(fn, maxRetries, delayMs) {
    return new Promise(function(resolve) {
      var attempt = 0;
      function tryFind() {
        attempt++;
        var btn = getByXPath(CONFIG.PROJECT_BUTTON_XPATH);
        if (!btn) {
          btn = findElement(ML_ELEMENTS.PROJECT_BUTTON);
          if (btn) logSub('Project button found via fallback findElement (attempt ' + attempt + ')', 1);
        }
        if (btn) {
          logSub('Project button found on attempt ' + attempt, 1);
          resolve(btn);
          return;
        }
        if (attempt < maxRetries) {
          logSub('Project button not found (attempt ' + attempt + '/' + maxRetries + ') — retrying in ' + delayMs + 'ms...', 1);
          setTimeout(tryFind, delayMs);
        } else {
          logSub('Project button not found after ' + maxRetries + ' attempts', 1);
          resolve(null);
        }
      }
      tryFind();
    });
  }

  // v7.12.0: Extracted dialog open + poll logic
  function openDialogAndPoll(fn, btn, perWs) {

    // Check if dialog is already open — v7.11.4: force close-then-reopen for clean state
    var isExpanded = btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open';
    if (isExpanded) {
      logSub('Dialog is already open — closing first for clean re-read', 1);
      reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
      // Wait briefly for close animation, then reopen
      return new Promise(function(resolve) {
        setTimeout(function() {
          logSub('Re-opening dialog for fresh workspace read', 1);
          reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
          // Continue with polling logic after reopen
          pollForWorkspaceName(fn, btn, perWs, resolve);
        }, 400);
      });
    } else {
      logSub('Dialog is closed — clicking project button to open', 1);
      reactClick(btn, CONFIG.PROJECT_BUTTON_XPATH);
    }

    // Step 2: Wait for dialog to render, then read workspace name
    return new Promise(function(resolve) {
      pollForWorkspaceName(fn, btn, perWs, resolve);
    });
  }

  // v7.11.4: Extracted polling logic so it can be called from both normal and close-reopen paths
  function pollForWorkspaceName(fn, btn, perWs, resolve) {
    var dialogWaitMs = 1500;
    var pollInterval = 300;
    var elapsed = 0;
    logSub('Waiting up to ' + dialogWaitMs + 'ms for WorkspaceNameXPath to appear...', 1);

    var pollTimer = setInterval(function() {
      elapsed += pollInterval;

      // v7.10.2: Use getAllByXPath — the XPath may match multiple elements.
      var allNodes = getAllByXPath(CONFIG.WORKSPACE_XPATH);
      if (allNodes.length > 0) {
        clearInterval(pollTimer);
        logSub('WorkspaceNameXPath found ' + allNodes.length + ' node(s) after ' + elapsed + 'ms', 1);

        var matched = null;
        var matchedRawName = '';

        for (var ni = 0; ni < allNodes.length; ni++) {
          var rawName = (allNodes[ni].textContent || '').trim();
          logSub('  Node[' + ni + ']: "' + rawName + '"', 1);
          if (!rawName) continue;

          // Check exact match first, then partial
          for (var wi = 0; wi < perWs.length; wi++) {
            if (perWs[wi].fullName === rawName || perWs[wi].name === rawName) {
              matched = perWs[wi];
              matchedRawName = rawName;
              break;
            }
          }
          if (matched) break;

          // Partial match (case-insensitive)
          for (var wi2 = 0; wi2 < perWs.length; wi2++) {
            if (perWs[wi2].fullName && perWs[wi2].fullName.toLowerCase().indexOf(rawName.toLowerCase()) !== -1) {
              matched = perWs[wi2];
              matchedRawName = rawName;
              break;
            }
            if (rawName.toLowerCase().indexOf(perWs[wi2].name.toLowerCase()) !== -1 && perWs[wi2].name.length >= 4) {
              matched = perWs[wi2];
              matchedRawName = rawName;
              break;
            }
          }
          if (matched) break;
        }

        if (matched) {
          state.workspaceName = matched.fullName || matched.name;
          // v7.14.0: Do NOT set workspaceFromApi here — caller decides whether to set it
          // autoDetectLoopCurrentWorkspace sets it; runCheck does NOT
          loopCreditState.currentWs = matched;
          log(fn + ': ✅ Workspace detected from project dialog: "' + matchedRawName + '" → ' + state.workspaceName + ' (id=' + matched.id + ', node index=' + ni + '/' + allNodes.length + ')', 'success');
        } else {
          var firstRaw = (allNodes[0].textContent || '').trim();
          log(fn + ': XPath returned ' + allNodes.length + ' nodes, none matched known workspaces. First node: "' + firstRaw + '" (checked ' + perWs.length + ' workspaces)', 'warn');
          // v7.11.2: Guard — only default to perWs[0] if no existing workspace name
          if (!state.workspaceName) {
            state.workspaceName = perWs[0].fullName || perWs[0].name;
            loopCreditState.currentWs = perWs[0];
            log(fn + ': Defaulted to first workspace: ' + state.workspaceName, 'warn');
          } else {
            log(fn + ': Keeping existing workspace: ' + state.workspaceName, 'warn');
          }
        }

        // Close dialog after reading
        closeProjectDialogSafe(btn);
        resolve();
        return;
      }

      if (elapsed >= dialogWaitMs) {
        clearInterval(pollTimer);
        log(fn + ': WorkspaceNameXPath not found after ' + dialogWaitMs + 'ms — trying CSS selector fallback (S-012)', 'warn');

        // S-012: CSS selector fallback for workspace name
        var cssFallbackNodes = findWorkspaceNameViaCss(fn, perWs);
        if (cssFallbackNodes.matched) {
          state.workspaceName = cssFallbackNodes.matched.fullName || cssFallbackNodes.matched.name;
          loopCreditState.currentWs = cssFallbackNodes.matched;
          log(fn + ': ⚠️ Workspace detected via CSS fallback: "' + cssFallbackNodes.rawName + '" → ' + state.workspaceName + ' (XPath may be stale — consider updating WorkspaceNameXPath in config.ini)', 'warn');
          closeProjectDialogSafe(btn);
          resolve();
          return;
        }

        log(fn + ': CSS fallback also failed — defaulting', 'warn');
        closeDialogAndDefault(fn, btn, perWs, resolve);
      }
    }, pollInterval);
  }

  // S-012: CSS selector fallback for workspace name detection
  // Tries multiple CSS selectors inside the dialog to find text matching a known workspace.
  function findWorkspaceNameViaCss(fn, perWs) {
    var selectors = ML_ELEMENTS.WORKSPACE_NAME.selector;
    var result = { matched: null, rawName: '' };

    for (var si = 0; si < selectors.length; si++) {
      var sel = selectors[si];
      try {
        var els = document.querySelectorAll(sel);
        logSub('CSS fallback [' + (si + 1) + '/' + selectors.length + ']: "' + sel + '" → ' + els.length + ' element(s)', 2);

        for (var ei = 0; ei < els.length; ei++) {
          var text = (els[ei].textContent || '').trim();
          if (!text || text.length < 3) continue;

          // Match against known workspaces
          for (var wi = 0; wi < perWs.length; wi++) {
            if (perWs[wi].fullName === text || perWs[wi].name === text) {
              logSub('CSS fallback ✅ MATCH: selector="' + sel + '", text="' + text + '" → ' + perWs[wi].fullName, 2);
              result.matched = perWs[wi];
              result.rawName = text;
              return result;
            }
            // Partial match
            if (perWs[wi].fullName && perWs[wi].fullName.toLowerCase().indexOf(text.toLowerCase()) !== -1) {
              logSub('CSS fallback ✅ PARTIAL MATCH: selector="' + sel + '", text="' + text + '" → ' + perWs[wi].fullName, 2);
              result.matched = perWs[wi];
              result.rawName = text;
              return result;
            }
            if (text.toLowerCase().indexOf(perWs[wi].name.toLowerCase()) !== -1 && perWs[wi].name.length >= 4) {
              logSub('CSS fallback ✅ PARTIAL MATCH: selector="' + sel + '", text="' + text + '" → ' + perWs[wi].fullName, 2);
              result.matched = perWs[wi];
              result.rawName = text;
              return result;
            }
          }
        }
      } catch (e) {
        logSub('CSS fallback [' + (si + 1) + '/' + selectors.length + ']: "' + sel + '" → ERROR: ' + e.message, 2);
      }
    }

    logSub('CSS fallback: no selectors matched a known workspace (' + selectors.length + ' selectors tried, ' + perWs.length + ' workspaces)', 2);
    return result;
  }

  function closeDialogAndDefault(fn, btn, perWs, resolve) {
    // v7.11.2: Guard — only default to perWs[0] if no existing workspace name
    if (!state.workspaceName) {
      state.workspaceName = perWs[0].fullName || perWs[0].name;
      loopCreditState.currentWs = perWs[0];
      log(fn + ': Defaulted to first workspace: ' + state.workspaceName, 'warn');
    } else {
      log(fn + ': Keeping existing workspace: ' + state.workspaceName, 'warn');
    }
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
          // v7.9.39: Log workspace change to history before updating state
          var previousWorkspace = state.workspaceName || '(unknown)';
          addWorkspaceChangeEntry(previousWorkspace, targetWorkspaceName);
          // Update current workspace name to the target
          state.workspaceName = targetWorkspaceName;
          state.workspaceFromApi = true;
          log('Updated state.workspaceName to: "' + targetWorkspaceName + '"', 'success');
          // v7.14.1: Immediately update UI so workspace name displays right away
          populateLoopWorkspaceDropdown();
          updateUI();
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

    var resolvedToken = resolveToken();
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
  // v7.9.40: Fetches fresh workspace data before moving, and skips workspaces with dailyFree=0.
  // Walks in the given direction (wrapping around) until it finds one with dailyFree > 0.
  // If none have free credits, falls back to the immediate next workspace.
  function moveToAdjacentWorkspace(direction) {
    log('moveToAdjacentWorkspace(' + direction + '): Fetching fresh workspace data before move...', 'delegate');
    updateLoopMoveStatus('loading', 'Fetching workspaces...');

    var url = CREDIT_API_BASE + '/user/workspaces';
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    var token = resolveToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
      .then(function(resp) {
        if (!resp.ok) {
          return resp.text().then(function(errBody) {
            throw new Error('HTTP ' + resp.status + ' ' + resp.statusText + ': ' + (errBody || '').substring(0, 200));
          });
        }
        return resp.text().then(function(bodyText) {
          if (!bodyText) throw new Error('Empty response body');
          var data;
          try { data = JSON.parse(bodyText); } catch(e) { throw new Error('JSON parse: ' + e.message); }
          return data;
        });
      })
      .then(function(data) {
        var ok = parseLoopApiResponse(data);
        if (!ok) {
          log('moveToAdjacentWorkspace: Failed to parse workspace data', 'error');
          updateLoopMoveStatus('error', 'Failed to parse workspaces');
          return;
        }
        var workspaces = loopCreditState.perWorkspace || [];
        if (workspaces.length === 0) {
          log('No workspaces loaded from API', 'error');
          updateLoopMoveStatus('error', 'No workspaces found');
          return;
        }

        log('moveToAdjacentWorkspace: Fresh data loaded — ' + workspaces.length + ' workspaces', 'success');

        // Find current workspace index
        var currentName = state.workspaceName || '';
        var currentIdx = -1;
        for (var i = 0; i < workspaces.length; i++) {
          if (workspaces[i].fullName === currentName || workspaces[i].name === currentName) {
            currentIdx = i;
            break;
          }
        }
        if (currentIdx === -1 && currentName) {
          var lowerName = currentName.toLowerCase();
          for (var pi = 0; pi < workspaces.length; pi++) {
            if ((workspaces[pi].fullName || '').toLowerCase().indexOf(lowerName) !== -1 ||
                lowerName.indexOf((workspaces[pi].fullName || '').toLowerCase()) !== -1) {
              currentIdx = pi;
              log('Workspace partial match: "' + currentName + '" ~ "' + workspaces[pi].fullName + '"', 'warn');
              break;
            }
          }
        }
        if (currentIdx === -1) {
          log('Current workspace "' + currentName + '" not found — using idx 0', 'warn');
          currentIdx = 0;
        }

        // v7.9.40: Walk in direction, find first workspace with dailyFree > 0
        var len = workspaces.length;
        var step = direction === 'up' ? -1 : 1;
        var targetIdx = -1;
        var fallbackIdx = -1; // immediate next, used if none have free credits

        for (var s = 1; s <= len; s++) {
          var candidateIdx = ((currentIdx + step * s) % len + len) % len;
          if (candidateIdx === currentIdx) continue; // wrapped all the way around

          // Track the immediate next as fallback
          if (fallbackIdx === -1) fallbackIdx = candidateIdx;

          var candidate = workspaces[candidateIdx];
          var candidateDailyFree = candidate.dailyFree || 0;
          logSub('Checking ' + direction + ' #' + s + ': "' + candidate.fullName + '" dailyFree=' + candidateDailyFree, 1);

          if (candidateDailyFree > 0) {
            targetIdx = candidateIdx;
            log('Found workspace with free credit: "' + candidate.fullName + '" (dailyFree=' + candidateDailyFree + ', ' + s + ' step(s) ' + direction + ')', 'success');
            break;
          }
        }

        if (targetIdx === -1) {
          log('⚠️ No workspace has dailyFree > 0 — falling back to immediate ' + direction + ' neighbor', 'warn');
          targetIdx = fallbackIdx !== -1 ? fallbackIdx : ((currentIdx + step) % len + len) % len;
        }

        var target = workspaces[targetIdx];
        var targetId = (target.raw && target.raw.id) || target.id || '';
        var skipped = Math.abs(targetIdx - currentIdx);
        if (skipped < 0) skipped += len;
        log('API Move ' + direction.toUpperCase() + ': "' + currentName + '" (#' + currentIdx + ') -> "' + target.fullName + '" (#' + targetIdx + ') dailyFree=' + (target.dailyFree || 0) + (skipped > 1 ? ' (skipped ' + (skipped - 1) + ' depleted)' : ''), 'delegate');
        moveToWorkspace(targetId, target.fullName);

        // Update UI with fresh data
        syncCreditStateFromApi();
        updateUI();
      })
      .catch(function(err) {
        log('moveToAdjacentWorkspace: Fetch failed — ' + err.message + '. Falling back to cached data.', 'error');
        // Fallback: use cached data with old logic
        moveToAdjacentWorkspaceCached(direction);
      });
  }

  // Fallback: move using cached workspace data (no fresh fetch)
  function moveToAdjacentWorkspaceCached(direction) {
    var workspaces = loopCreditState.perWorkspace || [];
    if (workspaces.length === 0) {
      log('No cached workspaces — click 💳 first', 'error');
      updateLoopMoveStatus('error', 'Load workspaces first (💳)');
      return;
    }
    var currentName = state.workspaceName || '';
    var currentIdx = -1;
    for (var i = 0; i < workspaces.length; i++) {
      if (workspaces[i].fullName === currentName || workspaces[i].name === currentName) {
        currentIdx = i;
        break;
      }
    }
    if (currentIdx === -1) currentIdx = 0;
    var len = workspaces.length;
    var step = direction === 'up' ? -1 : 1;
    var targetIdx = ((currentIdx + step) % len + len) % len;
    var target = workspaces[targetIdx];
    var targetId = (target.raw && target.raw.id) || target.id || '';
    log('API Move (cached fallback) ' + direction.toUpperCase() + ': -> "' + target.fullName + '"', 'delegate');
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
            + (_fr > 0 ? '<div title="🎁 Bonus: ' + _fr + '" style="width:' + _fp + '%;height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);"></div>' : '')
            + (billingAvail > 0 ? '<div title="💰 Monthly: ' + billingAvail + '" style="width:' + _bp + '%;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>' : '')
            + (rollover > 0 ? '<div title="🔄 Rollover: ' + rollover + '" style="width:' + _rp + '%;height:100%;background:linear-gradient(90deg,#6b7280,#9ca3af);"></div>' : '')
            + (dailyFree > 0 ? '<div title="📅 Free: ' + dailyFree + '" style="width:' + _dp + '%;height:100%;background:linear-gradient(90deg,#d97706,#facc15);"></div>' : '')
            + '</div>'
            + '<span style="font-size:10px;white-space:nowrap;font-family:monospace;line-height:1;">'
            + (_fr > 0 ? '<span style="color:#a78bfa;" title="🎁 Bonus = promotional credits remaining">🎁' + _fr + '</span> ' : '')
            + '<span style="color:#4ade80;" title="💰 Monthly = credits remaining in billing period">💰' + billingAvail + '</span> '
            + '<span style="color:#9ca3af;" title="🔄 Rollover = unused credits carried from previous period">🔄' + rollover + '</span> '
            + '<span style="color:#facc15;" title="📅 Free = free credits refreshed daily">📅' + dailyFree + '</span> '
            + '<span style="color:#22d3ee;font-weight:700;" title="⚡ Available = Total - rolloverUsed - dailyUsed - billingUsed - freeUsed">⚡' + _availTotal + '</span>'
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

    // v7.9.52: Update workspace count label
    var countLabel = document.getElementById('loop-ws-count-label');
    if (countLabel) {
      var total = workspaces.length;
      if (filter || loopWsFreeOnly || count !== total) {
        countLabel.textContent = 'Workspaces (' + count + '/' + total + ')';
      } else {
        countLabel.textContent = 'Workspaces (' + total + ')';
      }
    }

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
    // v7.9.46: Show both "Paste Save" and "🍪 From Cookie" buttons next to the bearer title
    var cookieBtnId = controller === 'loop' ? 'loop-quick-cookie-btn' : 'combo-quick-cookie-btn';
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

        // v7.9.46: Also inject cookie recovery button
        if (!document.getElementById(cookieBtnId)) {
          var cookieBtn = document.createElement('button');
          cookieBtn.id = cookieBtnId;
          cookieBtn.textContent = '🍪 Cookie';
          cookieBtn.title = 'Read bearer token from lovable-session-id.id cookie, save, and refresh data';
          cookieBtn.style.cssText = 'margin-left:4px;padding:3px 10px;background:#b45309;color:#fef3c7;border:1px solid #92400e;border-radius:3px;font-size:10px;cursor:pointer;font-weight:bold;';
          cookieBtn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            retrieveTokenFromCookie(controller);
          };
          headerParent.appendChild(cookieBtn);
        }
      }
    }
    log('[' + controller + '] Bearer token marked as EXPIRED (401/403 received) — Paste & Cookie recovery buttons injected', 'error');
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

  // v7.9.36: Retrieve bearer token from lovable-session-id.id cookie, save, verify, and refresh all data
  function retrieveTokenFromCookie(controller) {
    var fn = 'retrieveFromCookie';
    var titleId = controller === 'loop' ? 'loop-bearer-title' : 'combo-bearer-title';
    var inputId = controller === 'loop' ? 'loop-bearer-input' : 'ahk-bearer-token-input';
    var pasteBtnId = controller === 'loop' ? 'loop-quick-paste-btn' : 'combo-quick-paste-btn';
    var titleEl = document.getElementById(titleId);

    log('========== COOKIE TOKEN RETRIEVAL ==========', 'info');
    log(fn + ': Step 1: Reading lovable-session-id.id cookie...', 'info');
    if (titleEl) { titleEl.textContent = 'Bearer Token 🍪 Reading cookie...'; titleEl.style.color = '#facc15'; }

    var cookieVal = getBearerTokenFromCookie();
    if (!cookieVal || cookieVal.length < 10) {
      log(fn + ': Step 1 FAILED: Cookie not found or too short (len=' + (cookieVal ? cookieVal.length : 0) + ')', 'error');
      logSub('Available cookies: ' + (document.cookie ? document.cookie.split(';').map(function(c){ return c.trim().split('=')[0]; }).join(', ') : '(none)'), 1);
      if (titleEl) { titleEl.textContent = 'Bearer Token 🔴 Cookie not found!'; titleEl.style.color = '#ef4444'; }
      setTimeout(function() { if (titleEl) { titleEl.style.color = '#67e8f9'; } }, 3000);
      return;
    }

    log(fn + ': Step 1 OK: Cookie found (len=' + cookieVal.length + ', preview=' + cookieVal.substring(0, 12) + '...REDACTED)', 'success');
    log(fn + ': Step 2: Saving to localStorage...', 'info');
    saveBearerTokenToStorage(cookieVal);

    var inp = document.getElementById(inputId);
    if (inp) { inp.value = cookieVal; inp.style.borderColor = '#0e7490'; inp.style.boxShadow = 'none'; }

    log(fn + ': Step 2 OK: Token saved to localStorage', 'success');
    log(fn + ': Step 3: Verifying token via /user/workspaces API...', 'info');
    if (titleEl) { titleEl.textContent = 'Bearer Token 🔄 Verifying cookie token...'; titleEl.style.color = '#facc15'; }

    var url = CREDIT_API_BASE + '/user/workspaces';
    var headers = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cookieVal };
    logSub('GET ' + url, 1);
    logSub('Headers: ' + JSON.stringify({ Authorization: 'Bearer ' + cookieVal.substring(0, 12) + '...REDACTED' }), 1);

    fetch(url, { method: 'GET', headers: headers, credentials: 'include' })
      .then(function(resp) {
        log(fn + ': Step 3 Response: HTTP ' + resp.status + ' ' + resp.statusText, 'check');
        if (!resp.ok) {
          log(fn + ': Step 3 FAILED: Token verification failed (HTTP ' + resp.status + ')', 'error');
          if (titleEl) { titleEl.textContent = 'Bearer Token 🔴 Cookie token INVALID (HTTP ' + resp.status + ')'; titleEl.style.color = '#ef4444'; }
          setTimeout(function() { if (titleEl) { titleEl.style.color = '#67e8f9'; } }, 3000);
          return;
        }
        return resp.text().then(function(bodyText) {
          var data;
          try { data = JSON.parse(bodyText); } catch(e) {
            log(fn + ': Step 3: JSON parse failed — ' + e.message, 'error');
            return;
          }
          var wsCount = Array.isArray(data) ? data.length : '?';
          log(fn + ': Step 3 OK: ✅ Token is VALID — ' + wsCount + ' workspaces returned', 'success');

          var quickBtn = document.getElementById(pasteBtnId);
          if (quickBtn) quickBtn.remove();

          log(fn + ': Step 4: Refreshing workspace data...', 'info');
          if (titleEl) { titleEl.textContent = 'Bearer Token 🔄 Refreshing data...'; titleEl.style.color = '#facc15'; }

          parseLoopApiResponse(data);
          autoDetectLoopCurrentWorkspace(cookieVal).then(function() {
            syncCreditStateFromApi();
            updateUI();
            log(fn + ': Step 4 OK: ✅ All data refreshed — workspace detected, credits updated', 'success');
            log('========== COOKIE RETRIEVAL COMPLETE ==========', 'info');
            if (titleEl) { titleEl.textContent = 'Bearer Token ✅ Recovered from cookie (' + cookieVal.length + ' chars)'; titleEl.style.color = '#4ade80'; }
            setTimeout(function() { if (titleEl) { titleEl.style.color = '#67e8f9'; } }, 4000);
          });
        });
      })
      .catch(function(err) {
        log(fn + ': Network error — ' + err.message, 'error');
        if (titleEl) { titleEl.textContent = 'Bearer Token ⚠️ network error'; titleEl.style.color = '#ef4444'; }
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
      var key = getWsHistoryKey();
      var history = JSON.parse(localStorage.getItem(key) || '[]');
      var now = new Date();
      var projectName = getDisplayProjectName();
      var projectId = getProjectIdFromUrl();
      history.push({
        from: fromName,
        to: toName,
        time: now.toISOString(),
        display: now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
        projectName: projectName,
        projectId: projectId
      });
      // Keep max entries
      if (history.length > WS_HISTORY_MAX_ENTRIES) history = history.slice(history.length - WS_HISTORY_MAX_ENTRIES);
      localStorage.setItem(key, JSON.stringify(history));
      log('Workspace changed: "' + fromName + '" → "' + toName + '" (project=' + projectName + ', key=' + key + ')', 'success');
      // Update project name display in UI
      updateProjectNameDisplay();
    } catch (e) { /* storage error */ }
  }

  function getWorkspaceHistory() {
    try {
      var key = getWsHistoryKey();
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) { return []; }
  }

  function clearWorkspaceHistory() {
    try {
      var key = getWsHistoryKey();
      localStorage.removeItem(key);
    } catch (e) { /* ignore */ }
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
          log('    [' + (s+1) + '/' + selectors.length + '] querySelector("' + selectors[s] + '")', 'check');
          var sResult = document.querySelector(selectors[s]);
          if (sResult) {
            log('    ✅ FOUND via selector [' + (s+1) + ']: ' + selectors[s] + ' → <' + sResult.tagName.toLowerCase() + '>', 'success');
            return sResult;
          }
          log('    ❌ Not found', 'warn');
        } catch (e) {
          log('    ❌ Invalid selector: ' + e.message, 'error');
        }
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
    },
    // S-012: CSS fallback selectors for workspace name inside project dialog
    // Used when WorkspaceNameXPath fails (DOM structure changed)
    WORKSPACE_NAME: {
      name: 'Workspace Name (in dialog)',
      xpath: CONFIG.WORKSPACE_XPATH,
      selector: [
        '[data-testid="workspace-name"]',
        '[data-testid*="workspace"]',
        '[class*="workspace"] span',
        '[class*="workspace"] p',
        'nav [class*="sidebar"] span',
        '[role="dialog"] h2',
        '[role="dialog"] h3',
        '[role="dialog"] [class*="title"]',
        '[data-state="open"] [class*="workspace"]',
        '[data-radix-popper-content-wrapper] span'
      ],
      tag: 'span'
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
  // v7.14.0: Manual Check — XPath-only workspace detection
  // Does NOT use Tier 1 API (mark-viewed). Directly clicks Project Button → reads XPath → updates workspace.
  // ============================================
  function runCheck() {
    log('=== MANUAL CHECK START ===', 'check');

    var statusEl = document.getElementById(IDS.STATUS);
    if (statusEl) {
      statusEl.innerHTML = '<span style="color:#38bdf8;">🔍</span> Checking...';
    }

    var previousWsName = state.workspaceName || '';
    var previousCurrentWs = loopCreditState.currentWs;
    state.workspaceName = '';  // Clear to force fresh detection

    function restoreOnFailure() {
      if (!state.workspaceName && previousWsName) {
        state.workspaceName = previousWsName;
        loopCreditState.currentWs = previousCurrentWs;
        log('Restored previous workspace (detection failed): ' + previousWsName, 'warn');
      }
    }

    var perWs = loopCreditState.perWorkspace || [];

    function doXPathDetect(wsList) {
      // Step 1: Open Project Dialog
      log('Step 1: Opening Project Dialog...', 'check');
      // detectWorkspaceViaProjectDialog handles: click button → open dialog → poll XPath
      return detectWorkspaceViaProjectDialog('runCheck', wsList).then(function() {
        // Step 2: Check Workspace via XPath (logged inside detectWorkspaceViaProjectDialog)
        // By this point, all XPath nodes were checked and workspace was matched (or not)
        restoreOnFailure();
        if (state.workspaceName) {
          log('Step 2 complete: ✅ Workspace found = "' + state.workspaceName + '"', 'success');
        } else {
          log('Step 2 complete: ❌ No workspace matched from XPath', 'error');
        }
        // v7.14.0: Do NOT set workspaceFromApi — this is a pure DOM operation
        state.workspaceFromApi = false;
      });
    }

    // v7.17: Always attempt XPath detection — workspace list is optional (nice-to-have for matching)
    // If credit API failed (401), we still open the dialog and read workspace name from XPath directly
    var detectPromise;
    if (perWs.length > 0) {
      detectPromise = doXPathDetect(perWs);
    } else {
      log('No workspaces loaded — attempting credit fetch, but will detect via XPath regardless...', 'warn');
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#38bdf8;">🔍</span> Fetching workspaces...';
      }
      detectPromise = fetchLoopCreditsAsync().then(function() {
        var freshPerWs = loopCreditState.perWorkspace || [];
        return doXPathDetect(freshPerWs);
      }).catch(function(err) {
        log('Credit fetch failed: ' + err.message + ' — detecting via XPath without workspace list', 'warn');
        return doXPathDetect([]);
      });
    }

    return detectPromise.then(function() {
      // Step 3: Check Progress Bar
      return new Promise(function(resolve) {
        setTimeout(function() {
          log('Step 3: Checking Progress Bar...', 'check');
          log('  XPath: ' + CONFIG.PROGRESS_XPATH + ' (+ fallbacks)', 'check');
          var progressEl = findElement(ML_ELEMENTS.PROGRESS);

          if (progressEl) {
            log('  Progress Bar FOUND — System is BUSY', 'warn');
            highlightElement(progressEl, '#fbbf24');
            state.isIdle = false;
          } else {
            log('  Progress Bar NOT FOUND — System is IDLE', 'success');
            state.isIdle = true;
          }

          // Step 4: Update UI
          log('Step 4: Updating UI...', 'check');
          syncCreditStateFromApi();
          updateUI();
          log('=== MANUAL CHECK COMPLETE ===', 'check');
          resolve();
        }, 500);
      });
    });
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
    updateProjectNameDisplay();
  }

  // v7.9.39: Update project name display in title bar
  function updateProjectNameDisplay() {
    var el = document.getElementById('loop-project-name');
    if (el) {
      el.textContent = getDisplayProjectName();
    }
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
        var _availTotal = cws.available || calcAvailableCredits(_totalCapacity, cws.rolloverUsed, cws.dailyUsed, cws.used, (cws.freeGranted || 0) - (cws.freeRemaining || 0));
        var _bp = _totalCapacity > 0 ? Math.max(ba > 0 ? 2 : 0, Math.round(ba / _totalCapacity * 100)) : 0;
        var _rp = _totalCapacity > 0 ? Math.max(ro > 0 ? 2 : 0, Math.round(ro / _totalCapacity * 100)) : 0;
        var _dp = _totalCapacity > 0 ? Math.max(df > 0 ? 2 : 0, Math.round(df / _totalCapacity * 100)) : 0;
        var _fp = _totalCapacity > 0 ? Math.max(fr > 0 ? 2 : 0, Math.round(fr / _totalCapacity * 100)) : 0;

        creditBarsHtml += '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">';
        creditBarsHtml += '<div title="Available: ' + _availTotal + ' / Total: ' + _totalCapacity + ' (Used: ' + (cws.totalCreditsUsed || 0) + ')" style="flex:1;height:12px;background:rgba(239,68,68,0.25);border-radius:5px;overflow:hidden;display:flex;min-width:100px;max-width:260px;border:1px solid rgba(255,255,255,.12);box-shadow:inset 0 1px 3px rgba(0,0,0,0.3);">';
        if (fr > 0) creditBarsHtml += '<div title="🎁 Bonus: ' + fr + '" style="width:' + _fp + '%;height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);"></div>';
        if (ba > 0) creditBarsHtml += '<div title="💰 Monthly: ' + ba + '" style="width:' + _bp + '%;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);"></div>';
        if (ro > 0) creditBarsHtml += '<div title="🔄 Rollover: ' + ro + '" style="width:' + _rp + '%;height:100%;background:linear-gradient(90deg,#6b7280,#9ca3af);"></div>';
        if (df > 0) creditBarsHtml += '<div title="📅 Free: ' + df + '" style="width:' + _dp + '%;height:100%;background:linear-gradient(90deg,#d97706,#facc15);"></div>';
        creditBarsHtml += '</div>';
        creditBarsHtml += '<span style="font-size:10px;white-space:nowrap;font-family:monospace;line-height:1;">';
        if (fr > 0) creditBarsHtml += '<span style="color:#a78bfa;" title="🎁 Bonus = promotional credits remaining">🎁' + fr + '</span> ';
        creditBarsHtml += '<span style="color:#4ade80;" title="💰 Monthly = credits remaining in billing period">💰' + ba + '</span> ';
        creditBarsHtml += '<span style="color:#9ca3af;" title="🔄 Rollover = unused credits carried from previous period">🔄' + ro + '</span> ';
        creditBarsHtml += '<span style="color:#facc15;" title="📅 Free = free credits refreshed daily">📅' + df + '</span> ';
        creditBarsHtml += '<span style="color:#22d3ee;font-weight:700;" title="⚡ Available = Total - rolloverUsed - dailyUsed - billingUsed - freeUsed">⚡' + _availTotal + '</span>';
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
    // v7.28: The start/stop button is now a TOGGLE (single button, id=START_BTN).
    // Do NOT disable it when running — that prevents clicking Stop.
    // Instead, sync its visual state via __loopUpdateStartStopBtn.
    if (typeof window.__loopUpdateStartStopBtn === 'function') {
      window.__loopUpdateStartStopBtn(!!state.running);
    }

    // Legacy: if separate stop button exists (old layout), update it
    var stopBtn = document.getElementById(IDS.STOP_BTN);
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

    state.direction = direction || 'down';
    state.cycleCount = 0;
    state.isIdle = true;
    state.isDelegating = false;

    // v7.27: Set running=true IMMEDIATELY so stop button works right away
    state.running = true;
    state.countdown = Math.floor(TIMING.LOOP_INTERVAL / 1000);

    log('=== LOOP STARTING ===', 'success');
    log('Direction: ' + state.direction.toUpperCase(), 'success');
    log('Interval: ' + (TIMING.LOOP_INTERVAL/1000) + 's');
    log('Project Button XPath: ' + CONFIG.PROJECT_BUTTON_XPATH);
    log('Progress XPath: ' + CONFIG.PROGRESS_XPATH);

    // v7.15: Step 0 — Confirm controller is injected at the CONTROLS_XPATH (not just marker)
    log('Step 0: Confirming controller injection at CONTROLS_XPATH...', 'check');
    log('  CONTROLS_XPATH: ' + CONFIG.CONTROLS_XPATH, 'check');

    var marker = document.getElementById(IDS.SCRIPT_MARKER);
    var uiContainer = document.getElementById(IDS.CONTAINER);
    var xpathTarget = getByXPath(CONFIG.CONTROLS_XPATH);

    if (!marker || typeof window.__loopStart !== 'function') {
      log('❌ Controller script NOT injected (marker=' + !!marker + ', __loopStart=' + (typeof window.__loopStart) + ') — aborting', 'error');
      state.running = false;
      updateUI();
      return false;
    }

    if (!uiContainer) {
      log('❌ Controller UI container NOT found in DOM (id=' + IDS.CONTAINER + ') — aborting', 'error');
      state.running = false;
      updateUI();
      return false;
    }

    // Verify UI is inside the XPath target, not body fallback
    if (xpathTarget && xpathTarget.contains(uiContainer)) {
      log('Step 0: ✅ Controller confirmed at CONTROLS_XPATH', 'success');
    } else if (xpathTarget) {
      log('Step 0: ⚠️ Controller exists but NOT inside CONTROLS_XPATH (body fallback?) — proceeding with warning', 'warn');
    } else {
      log('Step 0: ⚠️ CONTROLS_XPATH element not found — controller may be in fallback position', 'warn');
    }

    updateUI();

    // v7.15: Step 1 — Controller confirmed. NOW run check to detect workspace.
    log('Step 1: Controller confirmed — running initial workspace check...', 'check');

    var checkPromise;
    try {
      checkPromise = runCheck();
    } catch(e) {
      log('Initial check threw error: ' + e.message + ' — starting loop anyway', 'warn');
    }

    var startTimers = function() {
      if (!state.running) {
        log('Loop was stopped during initial check — not starting timers', 'warn');
        return;
      }

      log('=== LOOP STARTED (post-check) ===', 'success');

      state.countdownIntervalId = setInterval(function() {
        if (state.countdown > 0) state.countdown--;
        updateStatus();
      }, TIMING.COUNTDOWN_INTERVAL);

      state.loopIntervalId = setInterval(runCycle, TIMING.LOOP_INTERVAL);
      setTimeout(runCycle, TIMING.FIRST_CYCLE_DELAY);
      updateUI();
    };

    if (checkPromise && typeof checkPromise.then === 'function') {
      checkPromise.then(function() {
        log('Initial check completed — starting loop timers', 'success');
        startTimers();
      }).catch(function(err) {
        log('Initial check failed: ' + (err && err.message ? err.message : String(err)) + ' — starting loop anyway', 'warn');
        startTimers();
      });
    } else {
      setTimeout(startTimers, 3000);
    }

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
    // v7.9.37: Use dailyFree (📅) as the sole free-credit indicator and move trigger
    var dailyFree = cws.dailyFree || 0;
    var hasCredit = dailyFree > 0;
    state.hasFreeCredit = hasCredit;
    state.isIdle = !hasCredit;
    state.lastStatusCheck = Date.now();
    log('API Credit Sync: ' + cws.fullName + ' dailyFree=' + dailyFree + ' (available=' + cws.available + ') → ' + (hasCredit ? '[Y] FREE CREDIT' : '[N] NO FREE CREDIT → will move'), hasCredit ? 'success' : 'warn');
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
    var token = resolveToken();
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

        // v7.9.35: On 401/403, try cookie recovery before marking expired
        if ((resp.status === 401 || resp.status === 403) && token) {
          var cookieToken = getBearerTokenFromCookie();
          if (cookieToken && cookieToken !== getBearerTokenFromStorage()) {
            try { localStorage.setItem(BEARER_STORAGE_KEY, cookieToken); } catch(e) {}
            log('🔄 Auto-recovered bearer token from session cookie (401/403 → retry possible)', 'success');
          } else {
            markBearerTokenExpired('loop');
          }
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

        // v7.10.1: Reset workspaceFromApi before cycle detection.
        // The guard should only protect the 2-second post-move refresh from overwriting
        // authoritative state with stale DOM. By the time the next 50s cycle runs,
        // the DOM has updated — we MUST re-detect to catch external workspace changes.
        // Without this reset, the controller shows stale workspace names indefinitely.
        // See Issue #20.
        state.workspaceFromApi = false;

        // Auto-detect current workspace
        return autoDetectLoopCurrentWorkspace(token).then(function() {
          if (!state.running || state.isDelegating) {
            log('SKIP: State changed during workspace detection', 'skip');
            return;
          }

          // Step 2: Check daily free credits from API data (v7.9.37: dailyFree drives move decision)
          syncCreditStateFromApi();
          updateUI();

          var cws = loopCreditState.currentWs;
          var dailyFree = cws ? (cws.dailyFree || 0) : 0;

          if (dailyFree > 0) {
            log('✅ Daily free credits available (' + dailyFree + ') — NO move needed', 'success');
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
                state.workspaceFromApi = false; // v7.10.1: force re-detect on double-confirm too
                return autoDetectLoopCurrentWorkspace(token).then(function() {
                  syncCreditStateFromApi();
                  updateUI();

                  var cws2 = loopCreditState.currentWs;
                  var dailyFree2 = cws2 ? (cws2.dailyFree || 0) : 0;

                  if (dailyFree2 > 0) {
                    log('DOUBLE-CONFIRM: Daily free credits found on re-check (' + dailyFree2 + ')! No move needed.', 'success');
                    return;
                  }

                  // Step 4: Confirmed no daily free credits — move via API
                  log('CONFIRMED: No daily free credits after double-check (dailyFree=' + dailyFree2 + ', available=' + (cws2 ? cws2.available : 0) + ') — moving via API', 'delegate');
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
    var dragPointerId = null;

    // Main UI container element
    var ui = document.createElement('div');
    ui.id = IDS.CONTAINER;
    ui.style.cssText = 'background:#1e1b4b;border:1px solid #312e81;border-radius:12px;padding:12px;margin:8px 0;font-family:monospace;font-size:12px;color:#e0e7ff;min-width:420px;';

    function enableFloating() {
      if (isFloating) return;
      log('Switching MacroLoop panel to floating mode');
      isFloating = true;
      ui.style.position = 'fixed';
      ui.style.zIndex = '99997';
      ui.style.width = '480px';
      ui.style.top = '80px';
      ui.style.left = '20px';
      ui.style.margin = '0';
      ui.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    }

    // v7.9.42: Position controller to a screen corner
    function positionLoopController(position) {
      enableFloating();
      var margin = 20;
      if (position === 'bottom-left') {
        ui.style.left = margin + 'px';
        ui.style.right = 'auto';
        ui.style.top = 'auto';
        ui.style.bottom = margin + 'px';
      } else if (position === 'bottom-right') {
        ui.style.left = 'auto';
        ui.style.right = margin + 'px';
        ui.style.top = 'auto';
        ui.style.bottom = margin + 'px';
      }
      log('Moved MacroLoop to ' + position);
    }

    function startDragHandler(e) {
      isDragging = true;
      dragPointerId = e.pointerId;
      var rect = ui.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      dragStartPos.x = e.clientX;
      dragStartPos.y = e.clientY;
      enableFloating();
      // v7.9.42: Capture pointer to prevent desync when cursor leaves window
      if (e.target.setPointerCapture && dragPointerId != null) {
        e.target.setPointerCapture(dragPointerId);
      }
      e.preventDefault();
    }

    document.addEventListener('pointermove', function(e) {
      if (!isDragging) return;
      ui.style.left = (e.clientX - dragOffsetX) + 'px';
      ui.style.top = (e.clientY - dragOffsetY) + 'px';
      ui.style.right = 'auto';
      ui.style.bottom = 'auto';
      e.preventDefault();
    });

    document.addEventListener('pointerup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      if (e.target.releasePointerCapture && dragPointerId != null) {
        try { e.target.releasePointerCapture(dragPointerId); } catch(ex) {}
      }
      dragPointerId = null;
    });

    // v7.29: Resize handles — bottom-right corner grip + bottom edge
    var isResizing = false;
    var resizeType = '';
    var resizeStartX = 0;
    var resizeStartY = 0;
    var resizeStartW = 0;
    var resizeStartH = 0;
    var resizePointerId = null;

    function createResizeHandle(type) {
      var handle = document.createElement('div');
      if (type === 'corner') {
        handle.style.cssText = 'position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:99999;display:flex;align-items:center;justify-content:center;';
        var grip = document.createElement('div');
        grip.style.cssText = 'width:10px;height:10px;opacity:0.4;transition:opacity .2s;';
        grip.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10"><circle cx="7" cy="3" r="1" fill="#a5b4fc"/><circle cx="3" cy="7" r="1" fill="#a5b4fc"/><circle cx="7" cy="7" r="1" fill="#a5b4fc"/></svg>';
        handle.appendChild(grip);
        handle.onmouseenter = function() { grip.style.opacity = '0.9'; };
        handle.onmouseleave = function() { grip.style.opacity = '0.4'; };
      } else {
        handle.style.cssText = 'position:absolute;left:12px;right:12px;bottom:0;height:6px;cursor:ns-resize;z-index:99998;';
        var bar = document.createElement('div');
        bar.style.cssText = 'width:40px;height:3px;background:#4f46e5;border-radius:2px;margin:2px auto 0;opacity:0.3;transition:opacity .2s;';
        handle.appendChild(bar);
        handle.onmouseenter = function() { bar.style.opacity = '0.8'; };
        handle.onmouseleave = function() { bar.style.opacity = '0.3'; };
      }

      handle.addEventListener('pointerdown', function(e) {
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        resizeType = type;
        resizePointerId = e.pointerId;
        var rect = ui.getBoundingClientRect();
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = rect.width;
        resizeStartH = rect.height;
        enableFloating();
        if (handle.setPointerCapture && resizePointerId != null) {
          handle.setPointerCapture(resizePointerId);
        }
      });
      return handle;
    }

    document.addEventListener('pointermove', function(e) {
      if (!isResizing) return;
      e.preventDefault();
      var dx = e.clientX - resizeStartX;
      var dy = e.clientY - resizeStartY;
      if (resizeType === 'corner') {
        ui.style.width = Math.max(420, resizeStartW + dx) + 'px';
        ui.style.height = Math.max(200, resizeStartH + dy) + 'px';
        ui.style.overflow = 'auto';
      } else {
        ui.style.height = Math.max(200, resizeStartH + dy) + 'px';
        ui.style.overflow = 'auto';
      }
    });

    document.addEventListener('pointerup', function(e) {
      if (!isResizing) return;
      isResizing = false;
      if (e.target.releasePointerCapture && resizePointerId != null) {
        try { e.target.releasePointerCapture(resizePointerId); } catch(ex) {}
      }
      resizePointerId = null;
    });

    ui.style.position = ui.style.position || 'relative';
    ui.appendChild(createResizeHandle('corner'));
    ui.appendChild(createResizeHandle('bottom'));

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

    // v7.9.39: Project name display
    var projectNameEl = document.createElement('div');
    projectNameEl.id = 'loop-project-name';
    projectNameEl.style.cssText = 'font-size:10px;color:#fbbf24;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;';
    projectNameEl.title = 'Project name (from DOM XPath)';
    projectNameEl.textContent = getDisplayProjectName();

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

    titleRow.onpointerdown = function(e) {
      var isHide = e.target === hideBtn;
      if (isHide) return;
      startDragHandler(e);
    };

    titleRow.onpointerup = function(e) {
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
    titleRow.appendChild(projectNameEl);
    titleRow.appendChild(versionSpan);
    titleRow.appendChild(panelToggleSpan);
    titleRow.appendChild(hideBtn);

    var status = document.createElement('div');
    status.id = IDS.STATUS;
    status.style.cssText = 'font-family:monospace;font-size:11px;padding:4px 6px;background:rgba(0,0,0,.4);border-radius:4px;color:#9ca3af;';
    status.innerHTML = '<span style="color:#fbbf24;">⟳</span> Initializing... checking workspace &amp; credit status';

    var infoRow = document.createElement('div');
    infoRow.style.cssText = 'font-size:9px;color:#a5b4fc;padding:2px 6px;background:rgba(0,0,0,.2);border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    infoRow.textContent = '1. Open Dialog -> 2. Check Credit -> 3. Double-Confirm -> 4. Delegate | Ctrl+Alt+Up/Down | Ctrl+Up/Down (Move) | Ctrl+Alt+H to hide';

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
    var checkInFlight = false;
    var checkInFlightTimer = null;

    function resetCheckButtonState() {
      if (checkInFlightTimer) {
        clearTimeout(checkInFlightTimer);
        checkInFlightTimer = null;
      }
      checkInFlight = false;
      checkBtn.textContent = 'Check';
      checkBtn.style.opacity = '1';
      checkBtn.style.pointerEvents = 'auto';
    }

    checkBtn.onclick = function() {
      if (checkInFlight) {
        log('Check cooldown: already in flight', 'warn');
        return;
      }
      if (state.isDelegating) {
        log('Check blocked: move/delegation in progress', 'warn');
        checkBtn.style.opacity = '0.5';
        setTimeout(function() { checkBtn.style.opacity = '1'; }, 500);
        return;
      }

      checkInFlight = true;
      checkBtn.textContent = '⏳ Checking…';
      checkBtn.style.opacity = '0.6';
      checkBtn.style.pointerEvents = 'none';

      // Failsafe: never leave Check button permanently locked
      checkInFlightTimer = setTimeout(function() {
        if (checkInFlight) {
          log('Manual Check timeout (15s) — auto-resetting button state', 'warn');
          resetCheckButtonState();
        }
      }, 15000);

      var checkPromise;
      try {
        checkPromise = runCheck();
      } catch(syncErr) {
        log('Manual Check sync error: ' + syncErr.message, 'error');
        resetCheckButtonState();
        return;
      }

      if (checkPromise && typeof checkPromise.then === 'function') {
        checkPromise.then(function() {
          log('Manual Check completed successfully', 'success');
        }).catch(function(err) {
          log('Manual Check failed: ' + (err && err.message ? err.message : String(err)), 'error');
        }).then(function() {
          resetCheckButtonState();
        });
      } else {
        resetCheckButtonState();
      }
    };

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
    forceUpBtn.title = 'Force move project to previous workspace via API (Ctrl+Up)';
    forceUpBtn.style.cssText = btnStyle + 'background:#1d4ed8;color:#fff;font-size:10px;padding:5px 8px 4px 8px;transition:all 0.15s;';

    var forceDownBtn = document.createElement('button');
    forceDownBtn.textContent = '⏬ Move Down';
    forceDownBtn.title = 'Force move project to next workspace via API (Ctrl+Down)';
    forceDownBtn.style.cssText = btnStyle + 'background:#7c2d12;color:#fff;font-size:10px;padding:5px 8px 4px 8px;transition:all 0.15s;';

    // v7.9.55: In-flight cooldown for Force Move buttons — prevents double-click spam
    var forceMoveInFlight = false;
    var forceUpOrigStyle = forceUpBtn.style.cssText;
    var forceDownOrigStyle = forceDownBtn.style.cssText;

    function setForceMoveInFlight(activeBtn) {
      forceMoveInFlight = true;
      var label = activeBtn === forceUpBtn ? '⏳ Moving Up…' : '⏳ Moving Down…';
      activeBtn.textContent = label;
      forceUpBtn.style.opacity = '0.5';
      forceUpBtn.style.pointerEvents = 'none';
      forceDownBtn.style.opacity = '0.5';
      forceDownBtn.style.pointerEvents = 'none';
    }

    function resetForceMoveInFlight() {
      forceMoveInFlight = false;
      forceUpBtn.textContent = '⏫ Move Up';
      forceDownBtn.textContent = '⏬ Move Down';
      forceUpBtn.style.opacity = '';
      forceUpBtn.style.pointerEvents = '';
      forceDownBtn.style.opacity = '';
      forceDownBtn.style.pointerEvents = '';
    }

    forceUpBtn.onclick = function() {
      if (forceMoveInFlight) return;
      animateBtn(forceUpBtn);
      setForceMoveInFlight(forceUpBtn);
      moveToAdjacentWorkspace('up');
      setTimeout(resetForceMoveInFlight, 8000);
    };

    forceDownBtn.onclick = function() {
      if (forceMoveInFlight) return;
      animateBtn(forceDownBtn);
      setForceMoveInFlight(forceDownBtn);
      moveToAdjacentWorkspace('down');
      setTimeout(resetForceMoveInFlight, 8000);
    };

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

    // v7.9.52: CSV export button — exports workspace names + credits sorted ascending
    var csvBtn = document.createElement('button');
    csvBtn.textContent = '📋 CSV';
    csvBtn.title = 'Export all workspaces + credits as CSV (sorted A→Z)';
    csvBtn.style.cssText = btnStyle + 'background:#065f46;color:#6ee7b7;font-size:10px;padding:4px 8px;';
    csvBtn.onclick = function() { animateBtn(csvBtn); exportWorkspacesAsCsv(); };
    btnRow.appendChild(csvBtn);

    // v7.18: Export bundle button — downloads xpath-utils + macro-looping as one self-contained JS (no combo)
    var exportBundleBtn = document.createElement('button');
    exportBundleBtn.textContent = '📥 Export';
    exportBundleBtn.title = 'Download bundle (xpath-utils + macro-looping) — paste into any DevTools Console';
    exportBundleBtn.style.cssText = btnStyle + 'background:#92400e;color:#fde68a;font-size:10px;padding:4px 8px;';
    exportBundleBtn.onclick = function() {
      animateBtn(exportBundleBtn);
      var bundle = window.__exportBundle;
      if (!bundle || bundle.length < 100) {
        log('Export: No bundle available — re-inject via AHK to generate', 'error');
        return;
      }

      // Build metadata header
      var now = new Date();
      var timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
      var header = '// ============================================\n';
      header += '// MACROLOOP BUNDLE EXPORT (self-contained)\n';
      header += '// Generated: ' + timestamp + '\n';
      header += '// Version:   v' + VERSION + '\n';
      header += '// Contents:  xpath-utils.js + macro-looping.js\n';
      header += '// Length:    ' + bundle.length + ' chars\n';
      header += '// ============================================\n';
      header += '// All __PLACEHOLDER__ tokens have been resolved.\n';
      header += '// Paste this entire script into any browser DevTools Console.\n';
      header += '// TIP: If Domain Guard blocks, run: window.__comboForceInject = true  first.\n';
      header += '// ============================================\n\n';

      var fullExport = header + bundle;

      // Download as .js file
      var blob = new Blob([fullExport], { type: 'application/javascript' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'automator-bundle-v' + VERSION + '-' + now.toISOString().replace(/[:.]/g, '-').substring(0, 19) + '.js';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      log('Export: Downloaded bundle (' + fullExport.length + ' chars)', 'success');
    };
    btnRow.appendChild(exportBundleBtn);

    // v7.18: Copy JS button — clipboard only (no file download)
    var copyJsBtn = document.createElement('button');
    copyJsBtn.textContent = '📋 Copy JS';
    copyJsBtn.title = 'Copy bundle (xpath-utils + macro-looping) to clipboard — paste into DevTools Console';
    copyJsBtn.style.cssText = btnStyle + 'background:#1e3a5f;color:#93c5fd;font-size:10px;padding:4px 8px;';
    copyJsBtn.onclick = function() {
      animateBtn(copyJsBtn);
      var bundle = window.__exportBundle;
      if (!bundle || bundle.length < 100) {
        log('Copy JS: No bundle available — re-inject via AHK to generate', 'error');
        return;
      }
      navigator.clipboard.writeText(bundle).then(function() {
        log('Copy JS: Copied to clipboard (' + bundle.length + ' chars)', 'success');
        copyJsBtn.textContent = '✅ Copied!';
        setTimeout(function() { copyJsBtn.textContent = '📋 Copy JS'; }, 2000);
      }).catch(function(err) {
        log('Copy JS: Clipboard failed: ' + err.message, 'warn');
      });
    };
    btnRow.appendChild(copyJsBtn);

    // v7.19: Reopen Auth Panel button with live open/closed indicator
    var reopenAuthBtn = document.createElement('button');
    reopenAuthBtn.title = 'Reopen the Macro Auth panel (if closed)';
    reopenAuthBtn.style.cssText = btnStyle + 'background:#701a75;color:#f0abfc;font-size:10px;padding:4px 8px;';
    function updateAuthBtnState() {
      var isOpen = !!document.getElementById('marco-auth-panel');
      reopenAuthBtn.textContent = isOpen ? '🟢 Auth' : '🔴 Auth';
      reopenAuthBtn.title = isOpen ? 'Auth panel is open' : 'Click to reopen Auth panel';
    }
    updateAuthBtnState();
    setInterval(updateAuthBtnState, 2000);
    reopenAuthBtn.onclick = function() {
      animateBtn(reopenAuthBtn);
      if (window.__MARCO__ && typeof window.__MARCO__.showAuthPanel === 'function') {
        window.__MARCO__.showAuthPanel();
        log('Auth panel reopened via button', 'success');
        setTimeout(updateAuthBtnState, 300);
      } else {
        log('Auth panel not available — __MARCO__.showAuthPanel not found', 'warn');
      }
    };
    btnRow.appendChild(reopenAuthBtn);

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
      var projectName = getDisplayProjectName();
      var historyKey = getWsHistoryKey();
      if (history.length === 0) {
        wsHistoryPanel.innerHTML = '<div style="color:#6b7280;font-size:10px;padding:4px;">No workspace changes recorded for project "' + projectName + '"</div>';
        return;
      }
      var html = '<div style="font-size:9px;color:#818cf8;padding:2px 0;margin-bottom:2px;">📁 Project: ' + projectName + ' (' + history.length + ' entries)</div>';
      for (var i = history.length - 1; i >= 0; i--) {
        var e = history[i];
        html += '<div style="font-size:10px;font-family:monospace;padding:2px 0;color:#fbbf24;">';
        html += '<span style="color:#6b7280;">[' + e.display + ']</span> ';
        html += '<span style="color:#ef4444;">' + e.from + '</span>';
        html += ' <span style="color:#9ca3af;">→</span> ';
        html += '<span style="color:#10b981;">' + e.to + '</span>';
        html += '</div>';
      }
      html += '<div style="margin-top:4px;text-align:right;"><button onclick="(function(){try{localStorage.removeItem(\'' + historyKey + '\');document.getElementById(\'loop-ws-history-panel\').innerHTML=\'<div style=\\\'color:#6b7280;font-size:10px;padding:4px;\\\'>History cleared</div>\';}catch(e){}})();" style="padding:2px 6px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:2px;font-size:9px;cursor:pointer;">Clear History</button></div>';
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

    // v7.9.36: Retrieve from Cookie button
    var tokenCookieBtn = document.createElement('button');
    tokenCookieBtn.textContent = '🍪';
    tokenCookieBtn.title = 'Read bearer token from lovable-session-id.id cookie, save, and refresh data';
    tokenCookieBtn.style.cssText = 'padding:2px 6px;background:#b45309;color:#fef3c7;border:1px solid #92400e;border-radius:3px;font-size:10px;cursor:pointer;';
    tokenCookieBtn.onclick = function(e) {
      e.preventDefault(); e.stopPropagation();
      retrieveTokenFromCookie('loop');
    };
    tokenInputRow.appendChild(tokenCookieBtn);

    tokenBody.appendChild(tokenInputRow);
    tokenSection.appendChild(tokenHeader);
    tokenSection.appendChild(tokenBody);

    // === Workspace Dropdown Section ===
    var wsDropSection = document.createElement('div');
    wsDropSection.style.cssText = 'padding:4px 6px;background:rgba(0,0,0,.3);border:1px solid #4f46e5;border-radius:4px;';

    var wsDropHeader = document.createElement('div');
    wsDropHeader.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;';
    wsDropHeader.innerHTML = '<span style="font-size:11px;">🏢</span><span id="loop-ws-count-label" style="font-size:10px;color:#a5b4fc;font-weight:bold;">Workspaces</span>';

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
      var token = window.__loopResolvedToken || resolveToken();
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
      if (!isCtrlAlt) {
        // v7.9.33: Ctrl+Up/Down (no Alt) for force move — must check BEFORE returning
        var isCtrlOnly = e.ctrlKey && !e.altKey && !e.shiftKey;

        // v7.9.42: Ctrl+1 → bottom-left, Ctrl+3 → bottom-right
        if (isCtrlOnly && e.key === '1') {
          e.preventDefault();
          positionLoopController('bottom-left');
          return;
        }
        if (isCtrlOnly && e.key === '3') {
          e.preventDefault();
          positionLoopController('bottom-right');
          return;
        }

        if (isCtrlOnly && e.key === 'ArrowUp') {
          e.preventDefault();
          log('Ctrl+Up → Force Move UP via API');
          forceSwitch('up');
          return;
        }
        if (isCtrlOnly && e.key === 'ArrowDown') {
          e.preventDefault();
          log('Ctrl+Down → Force Move DOWN via API');
          forceSwitch('down');
          return;
        }
        return;
      }

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
  log('Keyboard: Ctrl+Alt+Up/Down to toggle loop, Ctrl+Up/Down to force move, Ctrl+Alt+H to show/hide');
})();
