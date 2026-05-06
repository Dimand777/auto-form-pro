/**
 * Auto-Form Pro - Background Service Worker (State Manager)
 * Developer: Dmitri Smoljannikov
 * 
 * Handles persistent state across page reloads and redirects
to ensure the playback flow continues seamlessly without interruption.
 */

// State management constants
const STATE_KEYS = {
  IS_RECORDING: 'isRecording',
  IS_PLAYING: 'isPlaying',
  CURRENT_SCENARIO: 'currentScenario',
  CURRENT_STEP_INDEX: 'currentStepIndex',
  START_URL: 'startUrl'
};

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Auto-Form Pro] Extension installed');
  // Reset all states on fresh install
  resetAllStates();
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async responses
});

// Handle tab updates to restore state on page reload/redirect
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleTabUpdate(tabId, tab.url);
  }
});

/**
 * Handle incoming messages
 */
async function handleMessage(message, sender, sendResponse) {
  const { action, data } = message;

  switch (action) {
    case 'START_RECORDING':
      await startRecording(data?.scenario, data?.startUrl);
      sendResponse({ success: true });
      break;

    case 'STOP_RECORDING':
      await stopRecording();
      sendResponse({ success: true });
      break;

    case 'START_PLAYBACK':
      await startPlayback(data?.scenario);
      sendResponse({ success: true });
      break;

    case 'STOP_PLAYBACK':
      await stopPlayback();
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      const state = await getCurrentState();
      sendResponse({ success: true, state });
      break;

    case 'RECORD_ACTION':
      await recordAction(data);
      sendResponse({ success: true });
      break;

    case 'PLAYBACK_STEP_COMPLETE':
      await handleStepComplete(data);
      sendResponse({ success: true });
      break;

    case 'PLAYBACK_ERROR':
      await handlePlaybackError(data);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
}

/**
 * Start recording mode
 */
async function startRecording(scenario, startUrl) {
  await chrome.storage.local.set({
    [STATE_KEYS.IS_RECORDING]: true,
    [STATE_KEYS.IS_PLAYING]: false,
    [STATE_KEYS.CURRENT_SCENARIO]: scenario || 'New Scenario',
    [STATE_KEYS.CURRENT_STEP_INDEX]: 0,
    [STATE_KEYS.START_URL]: startUrl || ''
  });
  
  console.log('[Auto-Form Pro] Recording started:', scenario);
}

/**
 * Stop recording mode
 */
async function stopRecording() {
  await chrome.storage.local.set({
    [STATE_KEYS.IS_RECORDING]: false
  });
  console.log('[Auto-Form Pro] Recording stopped');
}

/**
 * Start playback mode
 */
async function startPlayback(scenario) {
  await chrome.storage.local.set({
    [STATE_KEYS.IS_RECORDING]: false,
    [STATE_KEYS.IS_PLAYING]: true,
    [STATE_KEYS.CURRENT_SCENARIO]: scenario?.name || 'Unknown',
    [STATE_KEYS.CURRENT_STEP_INDEX]: 0,
    [STATE_KEYS.START_URL]: scenario?.startUrl || ''
  });
  
  console.log('[Auto-Form Pro] Playback started:', scenario?.name);
  
  // Notify content script to begin playback
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'INITIATE_PLAYBACK',
      scenario: scenario
    }).catch(() => {
      // Content script may not be loaded yet, that's OK
    });
  }
}

/**
 * Stop playback mode
 */
async function stopPlayback() {
  await chrome.storage.local.set({
    [STATE_KEYS.IS_PLAYING]: false,
    [STATE_KEYS.CURRENT_STEP_INDEX]: 0
  });
  console.log('[Auto-Form Pro] Playback stopped');
}

/**
 * Get current state
 */
async function getCurrentState() {
  const state = await chrome.storage.local.get([
    STATE_KEYS.IS_RECORDING,
    STATE_KEYS.IS_PLAYING,
    STATE_KEYS.CURRENT_SCENARIO,
    STATE_KEYS.CURRENT_STEP_INDEX,
    STATE_KEYS.START_URL
  ]);
  
  return {
    isRecording: state[STATE_KEYS.IS_RECORDING] || false,
    isPlaying: state[STATE_KEYS.IS_PLAYING] || false,
    currentScenario: state[STATE_KEYS.CURRENT_SCENARIO] || '',
    currentStepIndex: state[STATE_KEYS.CURRENT_STEP_INDEX] || 0,
    startUrl: state[STATE_KEYS.START_URL] || ''
  };
}

/**
 * Handle tab update - restore state on page reload/redirect
 */
async function handleTabUpdate(tabId, url) {
  const state = await getCurrentState();
  
  // If we're recording, notify the content script to resume
  if (state.isRecording) {
    chrome.tabs.sendMessage(tabId, {
      action: 'RESUME_RECORDING',
      startUrl: state.startUrl
    }).catch(() => {
      // Content script may not be available on this URL
    });
  }
  
  // If we're playing back and the URL matches the scenario's start URL,
  // notify the content script to resume playback
  if (state.isPlaying && state.startUrl) {
    const isTargetUrl = url === state.startUrl || url.startsWith(state.startUrl);
    if (isTargetUrl) {
      chrome.tabs.sendMessage(tabId, {
        action: 'RESUME_PLAYBACK',
        stepIndex: state.currentStepIndex
      }).catch(() => {
        // Content script may not be available on this URL
      });
    }
  }
}

/**
 * Record a new action
 */
async function recordAction(actionData) {
  // Action is stored via content script, this is just for logging
  console.log('[Auto-Form Pro] Action recorded:', actionData.type);
}

/**
 * Handle step completion during playback
 */
async function handleStepComplete(data) {
  const nextStep = (data?.stepIndex || 0) + 1;
  await chrome.storage.local.set({
    [STATE_KEYS.CURRENT_STEP_INDEX]: nextStep
  });
  console.log('[Auto-Form Pro] Step completed, advancing to:', nextStep);
}

/**
 * Handle playback errors
 */
async function handlePlaybackError(data) {
  console.error('[Auto-Form Pro] Playback error:', data?.error);
  await chrome.storage.local.set({
    [STATE_KEYS.IS_PLAYING]: false
  });
}

/**
 * Reset all states
 */
async function resetAllStates() {
  await chrome.storage.local.set({
    [STATE_KEYS.IS_RECORDING]: false,
    [STATE_KEYS.IS_PLAYING]: false,
    [STATE_KEYS.CURRENT_SCENARIO]: '',
    [STATE_KEYS.CURRENT_STEP_INDEX]: 0,
    [STATE_KEYS.START_URL]: ''
  });
}
