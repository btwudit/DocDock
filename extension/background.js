/**
 * DocDock Chrome Extension - Background Service Worker (Manifest V3)
 * Handles Side Panel activation on toolbar icon click and message routing.
 */

// Enable opening side panel when the user clicks the extension toolbar icon
function configureSidePanelBehavior() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.warn('Could not set side panel behavior:', error));
  }
}

// Run immediately upon service worker evaluation
configureSidePanelBehavior();

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior();
});

// Explicit action click fallback for Chrome versions where setPanelBehavior is not auto-triggered
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel && chrome.sidePanel.open) {
    try {
      if (tab && tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (err) {
      console.warn('Fallback open side panel failed:', err);
    }
  }
});

// Listen for messages from sidepanel or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'PING') {
    sendResponse({ status: 'PONG', version: '1.0.0' });
    return false;
  }
  return false;
});
