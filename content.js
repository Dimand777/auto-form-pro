/**
 * Auto-Form Pro - Content Script (The Engine)
 * Developer: Dmitri Smoljannikov
 * 
 * Handles recording and playback of user interactions on web forms.
 */

(function() {
  'use strict';

  // State variables
  let isRecording = false;
  let isPlaying = false;
  let recordedActions = [];
  let currentScenario = null;
  let playbackStepIndex = 0;
  let lastActionTimestamp = 0; // Track timing for human-like delays
  let currentPlaybackSpeed = 1; // 1 = normal, 2 = 2x speed
  let floatingPanel = null; // Reference to floating UI panel
  const DEFAULT_DELAY = 500; // Default 500ms delay between steps
  const MIN_DELAY = 100; // Minimum 100ms delay for responsiveness
  const SMART_WAIT_TIMEOUT = 10000; // 10-second timeout for element selection

  // Initialize
  initialize();

  function initialize() {
    // Restore state from background
    chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
      if (response?.success) {
        const state = response.state;
        if (state.isRecording) {
          startRecording(state.startUrl);
        }
        if (state.isPlaying) {
          // Playback will be initiated by background when ready
        }
      }
    });

    // Listen for messages from background/popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      handleMessage(message, sender, sendResponse);
      return true;
    });
  }

  /**
   * Handle incoming messages
   */
  function handleMessage(message, sender, sendResponse) {
    const { action, data } = message;

    switch (action) {
      case 'START_RECORDING':
        startRecording(data?.startUrl);
        sendResponse({ success: true });
        break;

      case 'STOP_RECORDING':
        stopRecording();
        sendResponse({ success: true, actions: recordedActions });
        break;

      case 'RESUME_RECORDING':
        if (!isRecording) {
          startRecording(data?.startUrl);
        }
        sendResponse({ success: true });
        break;

      case 'START_PLAYBACK':
      case 'INITIATE_PLAYBACK':
        currentPlaybackSpeed = message.speed || 1;
        startPlayback(message.scenario);
        sendResponse({ success: true });
        break;

      case 'STOP_PLAYBACK':
        stopPlayback();
        sendResponse({ success: true });
        break;

      case 'RESUME_PLAYBACK':
        resumePlayback(message.stepIndex);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  }

  // Debounce timers for input handling
  let inputDebounceTimer = null;
  const INPUT_DEBOUNCE_DELAY = 500; // Wait 500ms after user stops typing
  let lastInputElement = null;
  let lastInputValue = '';

  /**
   * Start recording mode - uses event delegation on document.body
   */
  function startRecording(startUrl) {
    if (isRecording) return;
    
    isRecording = true;
    recordedActions = [];
    
    // Capture starting URL if not already set
    const currentStartUrl = startUrl || window.location.href;
    
    // Use event delegation on document.body to handle dynamic content
    // Capture phase (true) to catch events before they can be stopped
    document.body.addEventListener('click', handleDelegatedClick, true);
    document.body.addEventListener('mousedown', handleDelegatedMouseDown, true);
    document.body.addEventListener('input', handleDelegatedInput, true);
    document.body.addEventListener('change', handleDelegatedChange, true);
    document.body.addEventListener('submit', handleDelegatedSubmit, true);
    document.body.addEventListener('keydown', handleDelegatedKeyDown, true);
    
    // Also listen for scroll events which may trigger dynamic content
    document.body.addEventListener('scroll', handleScroll, { passive: true });
    
    // Inject floating panel - this is the ONLY panel visible during recording
    injectFloatingPanel();
    
    console.log('[Auto-Form Pro] Recording started on:', currentStartUrl);
    console.log('[Auto-Form Pro] Using event delegation for dynamic content capture');
  }

  /**
   * Stop recording mode
   */
  function stopRecording() {
    if (!isRecording) return;
    
    isRecording = false;
    
    // Clear any pending debounce
    if (inputDebounceTimer) {
      clearTimeout(inputDebounceTimer);
      // Save any pending input
      if (lastInputElement && lastInputValue) {
        saveInputAction(lastInputElement, lastInputValue);
      }
    }
    
    // Remove event listeners
    document.body.removeEventListener('click', handleDelegatedClick, true);
    document.body.removeEventListener('mousedown', handleDelegatedMouseDown, true);
    document.body.removeEventListener('input', handleDelegatedInput, true);
    document.body.removeEventListener('change', handleDelegatedChange, true);
    document.body.removeEventListener('submit', handleDelegatedSubmit, true);
    document.body.removeEventListener('keydown', handleDelegatedKeyDown, true);
    document.body.removeEventListener('scroll', handleScroll, { passive: true });
    
    // Remove floating panel
    removeFloatingPanel();
    
    // Reset state
    lastActionTimestamp = 0;
    lastInputElement = null;
    lastInputValue = '';
    
    console.log('[Auto-Form Pro] Recording stopped. Actions captured:', recordedActions.length);
  }

  /**
   * Handle scroll events (for infinite scroll pages)
   */
  function handleScroll(event) {
    // Scroll events can trigger dynamic content loading
    // We don't record them as actions, but we note that they happened
    console.log('[Auto-Form Pro] Scroll detected - dynamic content may load');
  }

  /**
   * Inject floating recording panel into the page
   */
  function injectFloatingPanel() {
    // Remove existing panel if any
    removeFloatingPanel();
    
    // Create panel container
    floatingPanel = document.createElement('div');
    floatingPanel.id = 'auto-form-pro-panel';
    floatingPanel.innerHTML = `
      <div class="afp-header">
        <span class="afp-dot"></span>
        <span class="afp-title">Recording...</span>
        <button class="afp-stop-btn" id="afp-stop">STOP</button>
      </div>
      <div class="afp-content">
        <div class="afp-stats">
          <span id="afp-action-count">0</span> actions captured
        </div>
        <div class="afp-log" id="afp-log"></div>
      </div>
    `;
    
    // Add styles
    const styles = document.createElement('style');
    styles.textContent = `
      #auto-form-pro-panel {
        position: fixed !important;
        top: 10px !important;
        right: 10px !important;
        width: 280px !important;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        border-radius: 12px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
        z-index: 2147483647 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        color: white !important;
        overflow: hidden !important;
        border: 2px solid rgba(255,255,255,0.2) !important;
      }
      #auto-form-pro-panel * {
        box-sizing: border-box !important;
      }
      .afp-header {
        display: flex !important;
        align-items: center !important;
        padding: 12px 16px !important;
        background: rgba(0,0,0,0.2) !important;
        border-bottom: 1px solid rgba(255,255,255,0.1) !important;
      }
      .afp-dot {
        width: 10px !important;
        height: 10px !important;
        background: #ff4444 !important;
        border-radius: 50% !important;
        margin-right: 10px !important;
        animation: afp-pulse 1.5s infinite !important;
        box-shadow: 0 0 10px #ff4444 !important;
      }
      @keyframes afp-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(0.9); }
      }
      .afp-title {
        flex: 1 !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        color: white !important;
      }
      .afp-stop-btn {
        padding: 6px 12px !important;
        background: #ff4444 !important;
        color: white !important;
        border: none !important;
        border-radius: 6px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
      }
      .afp-stop-btn:hover {
        background: #cc0000 !important;
        transform: scale(1.05) !important;
      }
      .afp-content {
        padding: 12px 16px !important;
      }
      .afp-stats {
        font-size: 13px !important;
        margin-bottom: 10px !important;
        opacity: 0.9 !important;
      }
      .afp-stats span {
        font-weight: 700 !important;
        font-size: 16px !important;
      }
      .afp-log {
        max-height: 150px !important;
        overflow-y: auto !important;
        background: rgba(0,0,0,0.3) !important;
        border-radius: 6px !important;
        padding: 8px !important;
        font-size: 11px !important;
        font-family: monospace !important;
        line-height: 1.4 !important;
      }
      .afp-log-entry {
        margin-bottom: 4px !important;
        padding: 2px 0 !important;
        border-bottom: 1px solid rgba(255,255,255,0.1) !important;
        color: #aaffaa !important;
      }
      .afp-log-entry:last-child {
        border-bottom: none !important;
      }
    `;
    
    // Append to document
    document.head.appendChild(styles);
    document.body.appendChild(floatingPanel);
    
    // Bind stop button
    const stopBtn = floatingPanel.querySelector('#afp-stop');
    if (stopBtn) {
      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopRecording();
        notifyBackground('STOP_RECORDING_FROM_PANEL');
      });
    }
    
    console.log('[Auto-Form Pro] Floating panel injected');
  }

  /**
   * Remove floating panel
   */
  function removeFloatingPanel() {
    if (floatingPanel) {
      floatingPanel.remove();
      floatingPanel = null;
    }
    // Also remove any stray panels (in case of duplicates)
    const existingPanels = document.querySelectorAll('#auto-form-pro-panel');
    existingPanels.forEach(panel => panel.remove());
  }

  /**
   * Update floating panel with action count and log
   */
  function updateFloatingPanel(message) {
    if (!floatingPanel) return;
    
    const countEl = floatingPanel.querySelector('#afp-action-count');
    const logEl = floatingPanel.querySelector('#afp-log');
    
    if (countEl) {
      countEl.textContent = recordedActions.length;
    }
    
    if (logEl && message) {
      const entry = document.createElement('div');
      entry.className = 'afp-log-entry';
      entry.textContent = message;
      logEl.appendChild(entry);
      logEl.scrollTop = logEl.scrollHeight;
      
      // Keep only last 20 entries
      while (logEl.children.length > 20) {
        logEl.removeChild(logEl.firstChild);
      }
    }
  }

  /**
   * SMART EVENT DELEGATION - Handle clicks via event delegation
   * Walks up DOM tree to find interactive parent element
   */
  function handleDelegatedClick(event) {
    if (!isRecording) return;
    
    // Skip if clicking inside our own panel
    if (event.target.closest('#auto-form-pro-panel')) return;
    
    // Find the closest interactive element (smart parent detection)
    const interactiveElement = findInteractiveElement(event.target);
    
    if (!interactiveElement) {
      console.log('[Auto-Form Pro] No interactive element found for click on:', event.target.tagName);
      return;
    }
    
    const selector = generateRobustSelector(interactiveElement);
    
    if (!selector) {
      console.log('[Auto-Form Pro] Could not generate selector for:', interactiveElement.tagName);
      return;
    }
    
    const now = Date.now();
    const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
    
    const action = {
      type: 'click',
      selector: selector,
      tagName: interactiveElement.tagName,
      elementType: getElementType(interactiveElement),
      timestamp: now,
      delay: delay,
      url: window.location.href,
      // Store additional metadata for better playback
      text: interactiveElement.textContent?.trim().substring(0, 50),
      href: interactiveElement.href || null
    };
    
    recordedActions.push(action);
    lastActionTimestamp = now;
    notifyBackground('RECORD_ACTION', action);
    
    // Log the action
    const elementDesc = getElementDescription(interactiveElement);
    const logMsg = `🖱️ CLICK: ${elementDesc}`;
    notifyBackground('LOG_ACTION', { message: logMsg, url: window.location.href });
    updateFloatingPanel(logMsg);
    
    console.log('[Auto-Form Pro] Smart click recorded on', interactiveElement.tagName, ':', selector);
  }

  /**
   * SMART MOUSEDOWN - Backup event handler
   */
  function handleDelegatedMouseDown(event) {
    // This serves as backup to click events
    // Most actions are already captured by click, but some frameworks use mousedown
    if (!isRecording) return;
    if (event.target.closest('#auto-form-pro-panel')) return;
    
    // Only record if no click was recorded recently for similar element
    const now = Date.now();
    const recentAction = recordedActions.find(a => 
      a.type === 'click' && 
      a.timestamp > now - 150
    );
    
    if (!recentAction) {
      // Fall back to click handler logic
      handleDelegatedClick(event);
    }
  }

  /**
   * SMART INPUT HANDLING - Aggressive input capture with debounce
   * Uses 'input' event (fires immediately) instead of 'change' (fires on blur)
   */
  function handleDelegatedInput(event) {
    if (!isRecording) return;
    
    const element = event.target;
    
    // Only handle input elements and contenteditable
    if (!isInputElement(element)) return;
    
    const value = element.isContentEditable ? element.innerText : element.value;
    
    // Store current state for debounced save
    lastInputElement = element;
    lastInputValue = value;
    
    // Clear existing timer
    if (inputDebounceTimer) {
      clearTimeout(inputDebounceTimer);
    }
    
    // Set new timer to save after user stops typing
    inputDebounceTimer = setTimeout(() => {
      saveInputAction(element, value);
    }, INPUT_DEBOUNCE_DELAY);
  }

  /**
   * Save input action after debounce
   */
  function saveInputAction(element, value) {
    if (!isRecording) return;
    
    const selector = generateRobustSelector(element);
    if (!selector) return;
    
    const now = Date.now();
    const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
    
    // Check if last action was on same element - if so, update it instead of adding new
    const lastAction = recordedActions[recordedActions.length - 1];
    if (lastAction && lastAction.type === 'input' && lastAction.selector === selector) {
      // Update existing action
      lastAction.value = value;
      lastAction.timestamp = now;
      console.log('[Auto-Form Pro] Updated input value for:', selector);
    } else {
      // Add new action
      recordedActions.push({
        type: 'input',
        selector: selector,
        value: value,
        timestamp: now,
        delay: delay,
        url: window.location.href
      });
      
      lastActionTimestamp = now;
      notifyBackground('RECORD_ACTION', { type: 'input', selector, value, timestamp: now, delay });
      
      const valuePreview = value.length > 30 ? value.substring(0, 30) + '...' : value;
      const logMsg = `⌨️ INPUT: ${getElementDescription(element)} = "${valuePreview}" (${value.length} chars)`;
      notifyBackground('LOG_ACTION', { message: logMsg, url: window.location.href });
      updateFloatingPanel(logMsg);
      
      console.log('[Auto-Form Pro] Input recorded:', selector, 'Value:', valuePreview);
    }
    
    // Reset
    lastInputElement = null;
    lastInputValue = '';
  }

  /**
   * SMART CHANGE HANDLING - For checkboxes, radios, selects
   */
  function handleDelegatedChange(event) {
    if (!isRecording) return;
    
    const element = event.target;
    
    // Handle different element types
    if (element.type === 'checkbox' || element.type === 'radio') {
      const selector = generateRobustSelector(element);
      if (!selector) return;
      
      const now = Date.now();
      const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
      
      recordedActions.push({
        type: 'change',
        selector: selector,
        value: element.checked,
        inputType: element.type,
        timestamp: now,
        delay: delay,
        url: window.location.href
      });
      
      lastActionTimestamp = now;
      notifyBackground('RECORD_ACTION', { type: 'change', selector, value: element.checked, timestamp: now, delay });
      
      const logMsg = `� ${element.type.toUpperCase()}: ${getElementDescription(element)} = ${element.checked ? '✓' : '☐'}`;
      notifyBackground('LOG_ACTION', { message: logMsg, url: window.location.href });
      updateFloatingPanel(logMsg);
      
      console.log('[Auto-Form Pro] Checkbox/Radio recorded:', selector, 'Checked:', element.checked);
    }
    // Note: Select elements are handled via click on option or just record the final value
  }

  /**
   * Handle form submissions
   */
  function handleDelegatedSubmit(event) {
    if (!isRecording) return;
    
    const form = event.target;
    const selector = generateRobustSelector(form);
    
    if (selector) {
      // Save any pending input before form submission
      if (inputDebounceTimer && lastInputElement && lastInputValue) {
        clearTimeout(inputDebounceTimer);
        saveInputAction(lastInputElement, lastInputValue);
      }
      
      const now = Date.now();
      const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
      
      recordedActions.push({
        type: 'submit',
        selector: selector,
        formId: form.id || null,
        formName: form.name || null,
        timestamp: now,
        delay: delay,
        url: window.location.href
      });
      
      lastActionTimestamp = now;
      notifyBackground('RECORD_ACTION', { type: 'submit', selector, timestamp: now, delay });
      
      const logMsg = `📤 SUBMIT: Form "${form.id || form.name || 'unnamed'}"`;
      notifyBackground('LOG_ACTION', { message: logMsg, url: window.location.href });
      updateFloatingPanel(logMsg);
      
      console.log('[Auto-Form Pro] Form submission recorded:', selector);
    }
  }

  /**
   * Handle keyboard events (Enter, Tab, Escape)
   */
  function handleDelegatedKeyDown(event) {
    if (!isRecording) return;
    
    // Only record special keys
    if (!['Enter', 'Tab', 'Escape'].includes(event.key)) return;
    
    const element = event.target;
    const selector = generateRobustSelector(element);
    
    if (selector) {
      const now = Date.now();
      const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
      
      recordedActions.push({
        type: 'keydown',
        selector: selector,
        key: event.key,
        timestamp: now,
        delay: delay,
        url: window.location.href
      });
      
      lastActionTimestamp = now;
      notifyBackground('RECORD_ACTION', { type: 'keydown', selector, key: event.key, timestamp: now, delay });
      
      const logMsg = `⌨️ KEY: ${event.key} on ${getElementDescription(element)}`;
      notifyBackground('LOG_ACTION', { message: logMsg, url: window.location.href });
      updateFloatingPanel(logMsg);
    }
  }

  /**
   * Check if element is an input element
   */
  function isInputElement(element) {
    const tag = element.tagName.toLowerCase();
    const inputTypes = ['input', 'textarea', 'select'];
    
    if (inputTypes.includes(tag)) return true;
    if (element.isContentEditable) return true;
    if (element.getAttribute('role') === 'textbox') return true;
    
    return false;
  }

  /**
   * Get element type for action metadata
   */
  function getElementType(element) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') return element.type || 'text';
    if (element.getAttribute('role')) return element.getAttribute('role');
    return tag;
  }

  /**
   * Handle input events
   */
  function handleInput(event) {
    if (!isRecording) return;
    
    const element = event.target;
    const selector = generateUniqueSelector(element);
    
    if (!selector) return;
    
    // Debounce input events - only record the last value
    clearTimeout(element._inputTimeout);
    element._inputTimeout = setTimeout(() => {
      const now = Date.now();
      
      // Remove previous input action for same element (if within 1 second)
      const lastAction = recordedActions[recordedActions.length - 1];
      if (lastAction && lastAction.type === 'input' && lastAction.selector === selector) {
        if (now - lastAction.timestamp < 1000) {
          recordedActions.pop();
        }
      }
      
      const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
      
      const action = {
        type: 'input',
        selector: selector,
        value: element.value,
        timestamp: now,
        delay: delay, // Store the actual time since last action
        url: window.location.href
      };
      
      recordedActions.push(action);
      lastActionTimestamp = now;
      notifyBackground('RECORD_ACTION', action);
      
      // Log the input action
      const elementDesc = getElementDescription(element);
      const valuePreview = element.value.length > 20 ? element.value.substring(0, 20) + '...' : element.value;
      const logMsg = `⌨️ INPUT: ${elementDesc} (${element.value.length} chars)`;
      notifyBackground('LOG_ACTION', { 
        message: logMsg,
        url: window.location.href 
      });
      updateFloatingPanel(logMsg);
      
      console.log('[Auto-Form Pro] Input recorded:', selector, 'Value:', element.value, 'Delay:', delay + 'ms');
    }, 300);
  }

  /**
   * Handle change events (for select, checkbox, radio)
   */
  function handleChange(event) {
    if (!isRecording) return;
    
    const element = event.target;
    const selector = generateUniqueSelector(element);
    
    if (!selector) return;
    
    let value;
    if (element.type === 'checkbox') {
      value = element.checked;
    } else if (element.type === 'radio') {
      value = element.value;
    } else {
      value = element.value;
    }
    
    const now = Date.now();
    const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
    
    const action = {
      type: 'change',
      selector: selector,
      value: value,
      timestamp: now,
      delay: delay, // Store the actual time since last action
      url: window.location.href
    };
    
    recordedActions.push(action);
    lastActionTimestamp = now;
    notifyBackground('RECORD_ACTION', action);
    
    // Log the change action
    const elementDesc = getElementDescription(element);
    const valueStr = typeof value === 'boolean' ? (value ? '✓ checked' : '☐ unchecked') : `"${value}"`;
    const logMsg = `🔄 CHANGE: ${elementDesc} = ${valueStr}`;
    notifyBackground('LOG_ACTION', { 
      message: logMsg,
      url: window.location.href 
    });
    updateFloatingPanel(logMsg);
    
    console.log('[Auto-Form Pro] Change recorded:', selector, 'Value:', value, 'Delay:', delay + 'ms');
  }

  /**
   * SMART PARENT DETECTION - Walk up DOM tree to find interactive element
   * Handles "ghost elements" like spans inside buttons
   */
  function findInteractiveElement(target) {
    if (!target || target === document.body || target === document.documentElement) {
      return null;
    }
    
    // Interactive element tags
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    
    // Interactive roles
    const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'treeitem'];
    
    let current = target;
    let depth = 0;
    const maxDepth = 5; // Don't walk too far up
    
    while (current && current !== document.body && depth < maxDepth) {
      const tag = current.tagName;
      const role = current.getAttribute('role');
      
      // Check if this is an interactive element
      if (interactiveTags.includes(tag)) {
        return current;
      }
      
      // Check for ARIA roles that indicate interactivity
      if (role && interactiveRoles.includes(role.toLowerCase())) {
        return current;
      }
      
      // Check for click handlers (elements with onclick or cursor:pointer)
      const style = window.getComputedStyle(current);
      if (style.cursor === 'pointer' || current.onclick || current.hasAttribute('ng-click') || 
          current.hasAttribute('data-click') || current.hasAttribute('v-on:click')) {
        return current;
      }
      
      // Move up to parent
      current = current.parentElement;
      depth++;
    }
    
    // If we walked up but found nothing interactive, return original target
    // only if it seems clickable (has click handler or pointer cursor)
    const targetStyle = window.getComputedStyle(target);
    if (targetStyle.cursor === 'pointer' || target.onclick) {
      return target;
    }
    
    return null;
  }

  /**
   * ROBUST SELECTOR GENERATION - Creates stable selectors that work across sessions
   * Avoids dynamic class names, prioritizes stable attributes
   */
  function generateRobustSelector(element) {
    if (!element || element === document.body) return null;
    
    // Priority 1: ID (if stable - not auto-generated)
    if (element.id && !isAutoGeneratedId(element.id)) {
      const idSelector = `#${CSS.escape(element.id)}`;
      if (isUniqueSelector(idSelector)) {
        return idSelector;
      }
    }
    
    // Priority 2: Name attribute (very stable for forms)
    if (element.name) {
      const nameSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      if (isUniqueSelector(nameSelector)) {
        return nameSelector;
      }
    }
    
    // Priority 3: Data attributes (test automation friendly)
    const stableDataAttrs = ['data-testid', 'data-id', 'data-automation-id', 'data-qa', 'data-cy'];
    for (const attr of stableDataAttrs) {
      if (element.hasAttribute(attr)) {
        const value = element.getAttribute(attr);
        const selector = `[${attr}="${CSS.escape(value)}"]`;
        if (isUniqueSelector(selector)) {
          return selector;
        }
      }
    }
    
    // Priority 4: Type + Placeholder combination for inputs
    if (element.placeholder && element.tagName === 'INPUT') {
      const type = element.type || 'text';
      const selector = `input[type="${type}"][placeholder="${CSS.escape(element.placeholder)}"]`;
      if (isUniqueSelector(selector)) {
        return selector;
      }
    }
    
    // Priority 5: ARIA attributes
    if (element.getAttribute('aria-label')) {
      const selector = `[aria-label="${CSS.escape(element.getAttribute('aria-label'))}"]`;
      if (isUniqueSelector(selector)) {
        return selector;
      }
    }
    
    // Priority 6: Stable class names (avoid dynamic ones like _1a2b3c)
    const stableClasses = getStableClasses(element);
    if (stableClasses.length > 0) {
      const classSelector = `${element.tagName.toLowerCase()}.${stableClasses.map(c => CSS.escape(c)).join('.')}`;
      if (isUniqueSelector(classSelector)) {
        return classSelector;
      }
    }
    
    // Priority 7: Text content for buttons and links
    if (element.textContent && (element.tagName === 'BUTTON' || element.tagName === 'A')) {
      const text = element.textContent.trim().substring(0, 30);
      if (text) {
        // Try with tag and text
        const textSelector = `${element.tagName.toLowerCase()}:has-text("${text}")`;
        // Note: :has-text may not work in all browsers, use alternative
        const attrSelector = `${element.tagName.toLowerCase()}[data-afp-text="${CSS.escape(text)}"]`;
        // Store text as data attribute for playback
        element.setAttribute('data-afp-text', text);
        if (isUniqueSelector(attrSelector)) {
          return attrSelector;
        }
      }
    }
    
    // Priority 8: Structural path with nth-child
    return generateStructuralPath(element);
  }

  /**
   * Check if ID looks auto-generated (like react root, or random strings)
   */
  function isAutoGeneratedId(id) {
    // React generated IDs often contain colons
    if (id.includes(':')) return true;
    // Random strings like "id_1a2b3c" or "ember123"
    if (/^id_[a-f0-9]{6,}$/.test(id)) return true;
    if (/^ember\d+$/.test(id)) return true;
    if (/^react-root/.test(id)) return true;
    // Numeric only IDs
    if (/^\d+$/.test(id)) return true;
    return false;
  }

  /**
   * Check if selector is unique on the page
   */
  function isUniqueSelector(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length === 1;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get stable class names (filter out dynamic hashes)
   */
  function getStableClasses(element) {
    if (!element.className) return [];
    
    const classes = element.className.split(' ').filter(c => c.trim());
    
    // Filter out classes that look like auto-generated hashes
    return classes.filter(cls => {
      // Skip classes that are just hashes (like _1a2b3c, css-123abc)
      if (/^[a-f0-9]{6,}$/i.test(cls)) return false;
      if (/^css-[a-z0-9]{5,}$/i.test(cls)) return false;
      if (/^styled__/i.test(cls)) return false;
      // Skip very short random-looking classes
      if (/^_[a-z0-9]{5,}$/i.test(cls)) return false;
      return true;
    });
  }

  /**
   * Generate structural path as last resort
   */
  function generateStructuralPath(element) {
    const path = [];
    let current = element;
    let depth = 0;
    const maxDepth = 6;
    
    while (current && current !== document.body && depth < maxDepth) {
      let selector = current.tagName.toLowerCase();
      
      // Add ID if present (even if potentially dynamic, better than nothing)
      if (current.id) {
        selector += `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }
      
      // Add stable classes if any
      const stableClasses = getStableClasses(current);
      if (stableClasses.length > 0) {
        selector += '.' + stableClasses.map(c => CSS.escape(c)).join('.');
      }
      
      // Add nth-child for disambiguation
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = Array.from(parent.children).indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
      depth++;
    }
    
    return path.join(' > ');
  }

  /**
   * Legacy selector generation (kept for compatibility)
   */
  function generateUniqueSelector(element) {
    return generateRobustSelector(element);
  }

  /**
   * Start playback of a scenario
   */
  async function startPlayback(scenario) {
    if (isPlaying || !scenario) return;
    
    currentScenario = scenario;
    isPlaying = true;
    playbackStepIndex = 0;
    
    // Navigate to starting URL first if needed
    if (scenario.startUrl && window.location.href !== scenario.startUrl) {
      console.log('[Auto-Form Pro] Navigating to start URL:', scenario.startUrl);
      window.location.href = scenario.startUrl;
      return; // Playback will resume after navigation
    }
    
    // Start executing actions
    await executePlayback();
  }

  /**
   * Resume playback from a specific step
   */
  async function resumePlayback(stepIndex) {
    if (!currentScenario) return;
    
    isPlaying = true;
    playbackStepIndex = stepIndex || 0;
    await executePlayback();
  }

  /**
   * Execute playback of all actions
   */
  async function executePlayback() {
    if (!currentScenario || !currentScenario.actions) return;
    
    const actions = currentScenario.actions;
    
    while (isPlaying && playbackStepIndex < actions.length) {
      const action = actions[playbackStepIndex];
      
      try {
        await executeAction(action);
        notifyBackground('PLAYBACK_STEP_COMPLETE', { stepIndex: playbackStepIndex });
        playbackStepIndex++;
        
        // Use the recorded delay for human-like timing, with minimum delay
        // Apply speed multiplier (2x speed = half the delay)
        const nextAction = actions[playbackStepIndex];
        const delayMs = nextAction?.delay || DEFAULT_DELAY;
        const speedAdjustedDelay = Math.floor(delayMs / currentPlaybackSpeed);
        const actualDelay = Math.max(speedAdjustedDelay, MIN_DELAY);
        
        console.log('[Auto-Form Pro] Waiting', actualDelay + 'ms before next action (human-like timing at ' + currentPlaybackSpeed + 'x speed)');
        await delay(actualDelay);
      } catch (error) {
        console.error('[Auto-Form Pro] Playback error:', error);
        notifyBackground('PLAYBACK_ERROR', { error: error.message });
        alert(`[Auto-Form Pro] Error at step ${playbackStepIndex + 1}: ${error.message}`);
        stopPlayback();
        break;
      }
    }
    
    if (playbackStepIndex >= actions.length) {
      console.log('[Auto-Form Pro] Playback completed successfully');
      notifyBackground('STOP_PLAYBACK');
      isPlaying = false;
    }
  }

  /**
   * Execute a single action with Smart Wait logic
   */
  async function executeAction(action) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const attemptExecution = () => {
        try {
          const element = document.querySelector(action.selector);
          
          if (!element) {
            // Smart Wait - retry for up to 10 seconds
            if (Date.now() - startTime < SMART_WAIT_TIMEOUT) {
              setTimeout(attemptExecution, 100);
              return;
            }
            reject(new Error(`Element not found: ${action.selector}`));
            return;
          }
          
          // Element found, execute the action
          switch (action.type) {
            case 'click':
              element.click();
              break;
              
            case 'input':
              element.focus();
              element.value = action.value;
              // React/Vue compatibility - dispatch input event
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              break;
              
            case 'change':
              if (element.type === 'checkbox') {
                element.checked = action.value;
              } else {
                element.value = action.value;
              }
              element.dispatchEvent(new Event('change', { bubbles: true }));
              break;
              
            default:
              console.warn('[Auto-Form Pro] Unknown action type:', action.type);
          }
          
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      attemptExecution();
    });
  }

  /**
   * Stop playback
   */
  function stopPlayback() {
    isPlaying = false;
    playbackStepIndex = 0;
    console.log('[Auto-Form Pro] Playback stopped');
  }

  /**
   * Utility: Delay promise
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get human-readable element description
   */
  function getElementDescription(element) {
    if (!element) return 'unknown element';
    
    const tagName = element.tagName.toLowerCase();
    const type = element.type ? `[${element.type}]` : '';
    const name = element.name ? ` "${element.name}"` : '';
    const id = element.id ? ` #${element.id}` : '';
    const placeholder = element.placeholder ? ` (placeholder: "${element.placeholder}")` : '';
    const text = element.textContent ? element.textContent.trim().substring(0, 30) : '';
    
    // For links, show text and href
    if (tagName === 'a') {
      const href = element.href ? ` → ${new URL(element.href).pathname}` : '';
      return `link "${text}"${href}`;
    }
    
    // For buttons
    if (tagName === 'button' || (tagName === 'input' && element.type === 'submit')) {
      const btnText = element.value || text || 'button';
      return `button "${btnText}"`;
    }
    
    // For inputs
    if (tagName === 'input') {
      const inputType = element.type || 'text';
      const inputName = element.name || element.id || element.placeholder || 'unnamed';
      return `${inputType} field "${inputName}"`;
    }
    
    // For select
    if (tagName === 'select') {
      return `dropdown "${element.name || 'unnamed'}"`;
    }
    
    // For textarea
    if (tagName === 'textarea') {
      return `textarea "${element.name || element.id || 'unnamed'}"`;
    }
    
    // Generic fallback
    return `${tagName}${type}${name}${id}${placeholder}` || 'element';
  }

  /**
   * Send message to background script
   */
  function notifyBackground(action, data) {
    chrome.runtime.sendMessage({ action, data }).catch(() => {
      // Background may be unavailable
    });
  }

})();
