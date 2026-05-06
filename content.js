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

  /**
   * Start recording mode
   */
  function startRecording(startUrl) {
    if (isRecording) return;
    
    isRecording = true;
    recordedActions = [];
    
    // Capture starting URL if not already set
    const currentStartUrl = startUrl || window.location.href;
    
    // Add event listeners - use capture phase to catch all events
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('keydown', handleKeyDown, true);
    
    console.log('[Auto-Form Pro] Recording started on:', currentStartUrl);
  }

  /**
   * Stop recording mode
   */
  function stopRecording() {
    if (!isRecording) return;
    
    isRecording = false;
    
    // Remove event listeners
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('mousedown', handleMouseDown, true);
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('change', handleChange, true);
    document.removeEventListener('submit', handleSubmit, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    
    // Reset timestamp for next recording
    lastActionTimestamp = 0;
    
    console.log('[Auto-Form Pro] Recording stopped. Actions captured:', recordedActions.length);
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
   * Handle click events - captures ALL clicks
   */
  function handleClick(event) {
    if (!isRecording) return;
    
    const element = event.target;
    const selector = generateUniqueSelector(element);
    
    // Even if we can't generate a perfect selector, try to record the action
    if (!selector) {
      console.log('[Auto-Form Pro] Click detected but no selector generated for:', element.tagName);
      return;
    }
    
    const now = Date.now();
    const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
    
    const action = {
      type: 'click',
      selector: selector,
      tagName: element.tagName,
      timestamp: now,
      delay: delay,
      url: window.location.href
    };
    
    recordedActions.push(action);
    lastActionTimestamp = now;
    notifyBackground('RECORD_ACTION', action);
    
    // Get element description for logging
    const elementDesc = getElementDescription(element);
    const isLink = element.tagName === 'A' || element.closest('a');
    const isButton = element.tagName === 'BUTTON' || element.type === 'submit' || element.type === 'button';
    const linkInfo = isLink ? ' [LINK]' : isButton ? ' [BUTTON]' : '';
    
    const logMsg = `🖱️ CLICK: ${elementDesc}${linkInfo}`;
    notifyBackground('LOG_ACTION', { 
      message: logMsg,
      url: window.location.href 
    });
    updateFloatingPanel(logMsg);
    
    console.log('[Auto-Form Pro] Click recorded:', selector, 'on', element.tagName, 'Delay:', delay + 'ms');
  }

  /**
   * Handle mousedown events - backup for clicks that might be missed
   */
  function handleMouseDown(event) {
    if (!isRecording) return;
    
    // Only record if we haven't recorded a click recently for this element
    const element = event.target;
    const now = Date.now();
    
    // Check if we already recorded a click on this element in the last 100ms
    const recentClick = recordedActions.find(a => 
      a.type === 'click' && 
      a.timestamp > now - 100 &&
      a.tagName === element.tagName
    );
    
    if (!recentClick) {
      // Record this as a click too
      const selector = generateUniqueSelector(element);
      if (selector) {
        const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
        
        recordedActions.push({
          type: 'click',
          selector: selector,
          tagName: element.tagName,
          timestamp: now,
          delay: delay,
          url: window.location.href
        });
        
        lastActionTimestamp = now;
        notifyBackground('RECORD_ACTION', { type: 'click', selector, timestamp: now, delay });
        
        const logMsg = `🖱️ MOUSE: ${getElementDescription(element)}`;
        notifyBackground('LOG_ACTION', { message: logMsg, url: window.location.href });
        updateFloatingPanel(logMsg);
      }
    }
  }

  /**
   * Handle form submissions
   */
  function handleSubmit(event) {
    if (!isRecording) return;
    
    const form = event.target;
    const selector = generateUniqueSelector(form);
    
    if (selector) {
      const now = Date.now();
      const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
      
      recordedActions.push({
        type: 'submit',
        selector: selector,
        tagName: 'FORM',
        timestamp: now,
        delay: delay,
        url: window.location.href
      });
      
      lastActionTimestamp = now;
      notifyBackground('RECORD_ACTION', { type: 'submit', selector, timestamp: now, delay });
      
      const logMsg = `📤 SUBMIT: Form ${form.id || form.name || 'unnamed'}`;
      notifyBackground('LOG_ACTION', { message: logMsg, url: window.location.href });
      updateFloatingPanel(logMsg);
      
      console.log('[Auto-Form Pro] Form submission recorded:', selector);
    }
  }

  /**
   * Handle keyboard events
   */
  function handleKeyDown(event) {
    if (!isRecording) return;
    
    // Record special keys
    if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') {
      const element = event.target;
      const selector = generateUniqueSelector(element);
      
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
   * Generate a unique CSS selector for an element
   */
  function generateUniqueSelector(element) {
    if (!element || element === document.body) return null;
    
    // Try ID first
    if (element.id) {
      const idSelector = `#${CSS.escape(element.id)}`;
      if (document.querySelectorAll(idSelector).length === 1) {
        return idSelector;
      }
    }
    
    // Try data attributes
    const dataAttrs = ['data-testid', 'data-id', 'data-automation-id', 'data-qa'];
    for (const attr of dataAttrs) {
      if (element.hasAttribute(attr)) {
        const value = element.getAttribute(attr);
        const selector = `[${attr}="${CSS.escape(value)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }
    
    // Try name attribute for form elements
    if (element.name) {
      const nameSelector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      if (document.querySelectorAll(nameSelector).length === 1) {
        return nameSelector;
      }
    }
    
    // Build path using classes and tag names
    let path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }
      
      if (current.className) {
        const classes = current.className.split(' ')
          .filter(c => c.trim())
          .map(c => CSS.escape(c.trim()))
          .join('.');
        if (classes) {
          selector += `.${classes}`;
        }
      }
      
      // Add nth-child for siblings
      const siblings = Array.from(current.parentNode?.children || []);
      const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
      
      // Limit path length
      if (path.length > 5) break;
    }
    
    const fullSelector = path.join(' > ');
    
    // Verify uniqueness
    try {
      if (document.querySelectorAll(fullSelector).length === 1) {
        return fullSelector;
      }
    } catch (e) {
      // Invalid selector, continue
    }
    
    // Fallback: use full path from body
    return fullSelector;
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
