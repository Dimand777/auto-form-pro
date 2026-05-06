/**
 * Auto-Form Pro - Recording Panel Script
 * Developer: Dmitri Smoljannikov
 * 
 * Standalone panel window that stays visible during recording.
 */

document.addEventListener('DOMContentLoaded', initialize);

// DOM Elements
const btnStop = document.getElementById('btnStop');
const actionCount = document.getElementById('actionCount');
const logArea = document.getElementById('logArea');

/**
 * Initialize panel
 */
async function initialize() {
  log('Recording panel initialized');
  
  // Bind event listeners
  btnStop.addEventListener('click', handleStop);
  
  // Setup message listener for real-time updates
  setupMessageListener();
  
  // Request current recording state
  const response = await sendMessage({ action: 'GET_STATE' });
  if (response?.success) {
    if (!response.state.isRecording) {
      log('No active recording found. Closing panel...');
      setTimeout(() => window.close(), 2000);
    }
  }
}

/**
 * Handle Stop button click
 */
async function handleStop() {
  try {
    btnStop.disabled = true;
    btnStop.textContent = 'Stopping...';
    
    // Stop recording in background
    await sendMessage({ action: 'STOP_RECORDING' });
    
    // Notify all content scripts to stop
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'STOP_RECORDING' });
      } catch (e) {
        // Tab may not have content script
      }
    }
    
    log('✅ Recording stopped and saved!');
    
    // Close this window after a delay
    setTimeout(() => window.close(), 1500);
  } catch (error) {
    log('❌ Error stopping: ' + error.message);
    btnStop.disabled = false;
    btnStop.textContent = 'STOP RECORDING & SAVE';
  }
}

/**
 * Setup message listener for updates from content scripts
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'UPDATE_LOG') {
      const data = message.data;
      if (data && data.message) {
        log(data.message);
      }
      sendResponse({ success: true });
    } else if (message.action === 'UPDATE_COUNT') {
      updateActionCount(data?.count || 0);
      sendResponse({ success: true });
    }
    return true;
  });
}

/**
 * Update action count display
 */
function updateActionCount(count) {
  actionCount.textContent = count;
  // Add animation effect
  actionCount.style.transform = 'scale(1.2)';
  setTimeout(() => {
    actionCount.style.transform = 'scale(1)';
  }, 200);
}

/**
 * Log message to panel
 */
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logArea.textContent += `[${timestamp}] ${message}\n`;
  logArea.scrollTop = logArea.scrollHeight;
}

/**
 * Send message to background
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { success: false, error: 'No response' });
    });
  });
}
