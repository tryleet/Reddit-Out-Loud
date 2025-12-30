// src/background/background.ts

console.log('🎬 Reddit Conversation Reader - Background Service Worker Started');

// Listen for tab updates (navigation, reload)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // When tab starts loading a new page
  if (changeInfo.status === 'loading') {
    console.log(`🔄 Tab ${tabId} is loading:`, tab.url);

    // Send cleanup message to content script (if it exists)
    chrome.tabs.sendMessage(tabId, { action: 'cleanup' }).catch(() => {
      // Content script might not be loaded yet, ignore error
    });
  }
});

// Listen for tab removal (tab closed)
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`🗑️ Tab ${tabId} closed`);
  // Cleanup happens automatically when tab closes
});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('✅ Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    console.log('🎉 First time installation!');
  } else if (details.reason === 'update') {
    console.log('⬆️ Extension updated');
  }
});

// Handle when service worker starts up
chrome.runtime.onStartup.addListener(() => {
  console.log('🔌 Browser started, service worker active');
});

// Keep service worker alive (optional, for debugging)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request);

  if (request.action === 'ping') {
    sendResponse({ status: 'alive' });
  }

  return true;
});