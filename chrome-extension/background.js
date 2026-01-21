// Background service worker for Consumemate

// Listen for extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Consumemate extension installed')
})

// Handle keyboard shortcuts (if we add them later)
chrome.commands?.onCommand.addListener((command) => {
  if (command === 'save-article') {
    // Open popup or trigger save
    chrome.action.openPopup()
  }
})

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTENT') {
    // Get content from the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id) {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => document.documentElement.outerHTML,
        })
        sendResponse({ html: result[0].result, url: tabs[0].url })
      }
    })
    return true // Indicates async response
  }
})
