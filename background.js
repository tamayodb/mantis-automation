// background.js - Service Worker

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'CSV_READY') {
    chrome.storage.local.set({
      lastCSV: msg.csvData,
      lastUpdated: new Date().toISOString()
    });
  }

  if (msg.action === 'CSV_ERROR') {
    chrome.storage.local.set({ csvError: msg.message });
  }
});
