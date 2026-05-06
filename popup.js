/**
 * Auto-Form Pro - Popup Script
 * Developer: Dmitri Smoljannikov
 * 
 * Handles UI interactions, scenario management, and communication with background/content scripts.
 */

document.addEventListener('DOMContentLoaded', initialize);

// State management
let isRecording = false;
let isPlaying = false;
let currentScenario = null;
let scenarios = [];
let tempRecordedActions = [];
let playbackSpeed = 1; // 1 = normal, 2 = 2x speed

// DOM Elements
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const btnRecord = document.getElementById('btnRecord');
const btnStop = document.getElementById('btnStop');
const btnPlay = document.getElementById('btnPlay');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const btnClearLog = document.getElementById('btnClearLog');
const btnSpeed = document.getElementById('btnSpeed');
const scenarioList = document.getElementById('scenarioList');
const scenarioCount = document.getElementById('scenarioCount');
const logArea = document.getElementById('logArea');
const helpToggle = document.getElementById('helpToggle');
const helpContent = document.getElementById('helpContent');
const helpArrow = document.getElementById('helpArrow');

/**
 * Initialize popup
 */
async function initialize() {
  log('Auto-Form Pro popup initialized');
  
  // Load saved scenarios and speed setting
  await loadScenarios();
  await loadSpeedSetting();
  
  // Get current state from background
  await refreshState();
  
  // Bind event listeners
  bindEventListeners();
  
  // Render scenarios list
  renderScenarios();
}

/**
 * Bind all event listeners
 */
function bindEventListeners() {
  btnRecord.addEventListener('click', handleRecord);
  btnStop.addEventListener('click', handleStop);
  btnPlay.addEventListener('click', handlePlay);
  btnExport.addEventListener('click', handleExport);
  btnImport.addEventListener('click', handleImport);
  btnSpeed.addEventListener('click', toggleSpeed);
  btnClearLog.addEventListener('click', clearLog);
  
  // Help toggle
  helpToggle.addEventListener('click', () => {
    helpContent.classList.toggle('hidden');
    helpArrow.textContent = helpContent.classList.contains('hidden') ? '▼' : '▲';
  });
}

/**
 * Refresh state from background script
 */
async function refreshState() {
  try {
    const response = await sendMessage({ action: 'GET_STATE' });
    if (response?.success) {
      isRecording = response.state.isRecording;
      isPlaying = response.state.isPlaying;
      updateUI();
    }
  } catch (error) {
    log('Error refreshing state: ' + error.message);
  }
}

/**
 * Handle Record button click
 */
async function handleRecord() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      alert('No active tab found');
      return;
    }
    
    // Don't record on chrome:// or extension pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      alert('Cannot record on Chrome system pages. Please navigate to a website.');
      return;
    }
    
    isRecording = true;
    tempRecordedActions = [];
    
    const response = await sendMessage({ 
      action: 'START_RECORDING',
      data: { 
        scenario: 'New Scenario',
        startUrl: tab.url
      }
    });
    
    if (response?.success) {
      log('Recording started on: ' + tab.url);
      updateUI();
      
      // Notify content script
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'START_RECORDING',
        data: { startUrl: tab.url }
      }).catch(() => {
        // Content script will be injected automatically
      });
    }
  } catch (error) {
    log('Error starting recording: ' + error.message);
  }
}

/**
 * Handle Stop button click
 */
async function handleStop() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (isRecording) {
      // Get recorded actions from content script
      if (tab) {
        try {
          const contentResponse = await chrome.tabs.sendMessage(tab.id, { action: 'STOP_RECORDING' });
          if (contentResponse?.success) {
            tempRecordedActions = contentResponse.actions || [];
          }
        } catch (e) {
          // Content script may not be available
        }
      }
      
      await sendMessage({ action: 'STOP_RECORDING' });
      isRecording = false;
      
      // Prompt for scenario name
      if (tempRecordedActions.length > 0) {
        const name = prompt(`Recording stopped. ${tempRecordedActions.length} actions captured.\nEnter scenario name:`, 'New Scenario');
        if (name) {
          await saveScenario(name, tempRecordedActions);
        }
      } else {
        log('No actions were recorded');
      }
      
      tempRecordedActions = [];
    } else if (isPlaying) {
      await sendMessage({ action: 'STOP_PLAYBACK' });
      isPlaying = false;
      
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { action: 'STOP_PLAYBACK' }).catch(() => {});
      }
      
      log('Playback stopped');
    }
    
    updateUI();
  } catch (error) {
    log('Error stopping: ' + error.message);
  }
}

/**
 * Handle Play button click
 */
async function handlePlay() {
  if (!currentScenario) {
    alert('Please select a scenario to play');
    return;
  }
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      alert('No active tab found');
      return;
    }
    
    isPlaying = true;
    updateUI();
    
    await sendMessage({ 
      action: 'START_PLAYBACK',
      data: { scenario: currentScenario, speed: playbackSpeed }
    });
    
    log('Starting playback: ' + currentScenario.name + ' at ' + playbackSpeed + 'x speed');
    
    // If we need to navigate, open the URL first
    if (currentScenario.startUrl && !tab.url.includes(new URL(currentScenario.startUrl).hostname)) {
      await chrome.tabs.update(tab.id, { url: currentScenario.startUrl });
      // Playback will continue via background script after navigation
    } else {
      // Start playback immediately on current tab
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'START_PLAYBACK',
        scenario: currentScenario,
        speed: playbackSpeed
      }).catch(async () => {
        // Inject content script if not present
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Retry
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'START_PLAYBACK',
          scenario: currentScenario,
          speed: playbackSpeed
        });
      });
    }
  } catch (error) {
    log('Error starting playback: ' + error.message);
    isPlaying = false;
    updateUI();
  }
}

/**
 * Toggle playback speed between 1x and 2x
 */
async function toggleSpeed() {
  playbackSpeed = playbackSpeed === 1 ? 2 : 1;
  await chrome.storage.local.set({ playbackSpeed });
  updateSpeedButton();
  log('Playback speed set to ' + playbackSpeed + 'x');
}

/**
 * Load speed setting from storage
 */
async function loadSpeedSetting() {
  const result = await chrome.storage.local.get(['playbackSpeed']);
  playbackSpeed = result.playbackSpeed || 1;
  updateSpeedButton();
}

/**
 * Update speed button UI
 */
function updateSpeedButton() {
  if (!btnSpeed) return;
  
  btnSpeed.innerHTML = `<span class="btn-icon">${playbackSpeed === 2 ? '⚡⚡' : '⚡'}</span><span>Speed: ${playbackSpeed}x</span>`;
  
  if (playbackSpeed === 2) {
    btnSpeed.classList.add('active');
  } else {
    btnSpeed.classList.remove('active');
  }
}

/**
 * Handle Export button click
 */
async function handleExport() {
  if (scenarios.length === 0) {
    alert('No scenarios to export');
    return;
  }
  
  const dataStr = JSON.stringify(scenarios, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  await chrome.downloads.download({
    url: url,
    filename: `auto-form-pro-scenarios-${timestamp}.json`,
    saveAs: true
  });
  
  log('Scenarios exported to JSON');
}

/**
 * Handle Import button click
 */
async function handleImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      
      if (Array.isArray(imported)) {
        scenarios = [...scenarios, ...imported];
        await chrome.storage.local.set({ scenarios });
        renderScenarios();
        log(`Imported ${imported.length} scenarios`);
      } else if (imported.name && imported.actions) {
        scenarios.push(imported);
        await chrome.storage.local.set({ scenarios });
        renderScenarios();
        log(`Imported scenario: ${imported.name}`);
      } else {
        alert('Invalid JSON format');
      }
    } catch (error) {
      alert('Error importing: ' + error.message);
    }
  };
  
  input.click();
}

/**
 * Save a new scenario
 */
async function saveScenario(name, actions) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  const scenario = {
    id: Date.now().toString(),
    name: name,
    createdAt: new Date().toISOString(),
    startUrl: tab?.url || '',
    actions: actions
  };
  
  scenarios.push(scenario);
  await chrome.storage.local.set({ scenarios });
  
  renderScenarios();
  log(`Scenario saved: ${name} (${actions.length} actions)`);
}

/**
 * Delete a scenario
 */
async function deleteScenario(id, event) {
  event.stopPropagation();
  
  if (!confirm('Delete this scenario?')) return;
  
  scenarios = scenarios.filter(s => s.id !== id);
  await chrome.storage.local.set({ scenarios });
  
  if (currentScenario?.id === id) {
    currentScenario = null;
  }
  
  renderScenarios();
  log('Scenario deleted');
}

/**
 * Rename a scenario
 */
async function renameScenario(id, event) {
  event.stopPropagation();
  
  const scenario = scenarios.find(s => s.id === id);
  if (!scenario) return;
  
  const newName = prompt('Enter new name:', scenario.name);
  if (newName && newName.trim()) {
    scenario.name = newName.trim();
    await chrome.storage.local.set({ scenarios });
    renderScenarios();
    log('Scenario renamed to: ' + newName);
  }
}

/**
 * Select a scenario
 */
function selectScenario(scenario) {
  currentScenario = scenario;
  renderScenarios();
  log('Selected: ' + scenario.name);
}

/**
 * Load scenarios from storage
 */
async function loadScenarios() {
  const result = await chrome.storage.local.get(['scenarios']);
  scenarios = result.scenarios || [];
  scenarioCount.textContent = scenarios.length;
}

/**
 * Render scenarios list
 */
function renderScenarios() {
  scenarioCount.textContent = scenarios.length;
  
  if (scenarios.length === 0) {
    scenarioList.innerHTML = '<div class="empty-state">No scenarios saved yet</div>';
    btnPlay.disabled = true;
    return;
  }
  
  scenarioList.innerHTML = scenarios.map(scenario => `
    <div class="scenario-item ${currentScenario?.id === scenario.id ? 'selected' : ''}" data-id="${scenario.id}">
      <span class="scenario-name">${escapeHtml(scenario.name)}</span>
      <span style="font-size: 10px; color: #9ca3af; margin-right: 8px;">${scenario.actions.length} actions</span>
      <div class="scenario-actions">
        <button class="scenario-btn" data-action="rename" data-id="${scenario.id}">Rename</button>
        <button class="scenario-btn delete" data-action="delete" data-id="${scenario.id}">Delete</button>
      </div>
    </div>
  `).join('');
  
  // Bind scenario item clicks
  scenarioList.querySelectorAll('.scenario-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.dataset.action) {
        const id = item.dataset.id;
        const scenario = scenarios.find(s => s.id === id);
        if (scenario) selectScenario(scenario);
      }
    });
  });
  
  // Bind action buttons
  scenarioList.querySelectorAll('[data-action="rename"]').forEach(btn => {
    btn.addEventListener('click', (e) => renameScenario(btn.dataset.id, e));
  });
  
  scenarioList.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => deleteScenario(btn.dataset.id, e));
  });
  
  btnPlay.disabled = !currentScenario;
}

/**
 * Update UI based on state
 */
function updateUI() {
  if (isRecording) {
    statusBar.className = 'status-bar status-recording';
    statusText.textContent = 'Recording in progress...';
    btnRecord.disabled = true;
    btnStop.disabled = false;
    btnPlay.disabled = true;
  } else if (isPlaying) {
    statusBar.className = 'status-bar status-playing';
    statusText.textContent = 'Playback in progress...';
    btnRecord.disabled = true;
    btnStop.disabled = false;
    btnPlay.disabled = true;
  } else {
    statusBar.className = 'status-bar status-idle';
    statusText.textContent = 'Ready to record';
    btnRecord.disabled = false;
    btnStop.disabled = true;
    btnPlay.disabled = !currentScenario;
  }
}

/**
 * Log message to execution log
 */
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  logArea.textContent += `[${timestamp}] ${message}\n`;
  logArea.scrollTop = logArea.scrollHeight;
}

/**
 * Clear execution log
 */
function clearLog() {
  logArea.textContent = '';
  log('Log cleared');
}

/**
 * Send message to background script
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { success: false, error: 'No response' });
    });
  });
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from background/content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'PLAYBACK_COMPLETE') {
    isPlaying = false;
    updateUI();
    log('Playback completed');
  } else if (message.action === 'PLAYBACK_ERROR') {
    isPlaying = false;
    updateUI();
    log('Playback error: ' + message.error);
  }
  sendResponse({ success: true });
  return true;
});
