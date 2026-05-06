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
    
    // Add event listeners
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleChange, true);
    
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
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('change', handleChange, true);
    
    // Reset timestamp for next recording
    lastActionTimestamp = 0;
    
    console.log('[Auto-Form Pro] Recording stopped. Actions captured:', recordedActions.length);
  }

  /**
   * Handle click events
   */
  function handleClick(event) {
    if (!isRecording) return;
    
    const element = event.target;
    const selector = generateUniqueSelector(element);
    
    if (!selector) return;
    
    const now = Date.now();
    const delay = recordedActions.length > 0 ? now - lastActionTimestamp : 0;
    
    const action = {
      type: 'click',
      selector: selector,
      timestamp: now,
      delay: delay, // Store the actual time since last action
      url: window.location.href
    };
    
    recordedActions.push(action);
    lastActionTimestamp = now;
    notifyBackground('RECORD_ACTION', action);
    
    console.log('[Auto-Form Pro] Click recorded:', selector, 'Delay:', delay + 'ms');
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
        const nextAction = actions[playbackStepIndex];
        const delayMs = nextAction?.delay || DEFAULT_DELAY;
        const actualDelay = Math.max(delayMs, MIN_DELAY);
        
        console.log('[Auto-Form Pro] Waiting', actualDelay + 'ms before next action (human-like timing)');
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
   * Send message to background script
   */
  function notifyBackground(action, data) {
    chrome.runtime.sendMessage({ action, data }).catch(() => {
      // Background may be unavailable
    });
  }

})();
