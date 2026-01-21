const API_URL = 'http://localhost:3000'

// DOM Elements
const loginView = document.getElementById('login-view')
const mainView = document.getElementById('main-view')
const phoneStep = document.getElementById('phone-step')
const codeStep = document.getElementById('code-step')
const phoneInput = document.getElementById('phone-input')
const codeInput = document.getElementById('code-input')
const sendCodeBtn = document.getElementById('send-code-btn')
const verifyCodeBtn = document.getElementById('verify-code-btn')
const backBtn = document.getElementById('back-btn')
const loginError = document.getElementById('login-error')
const saveBtn = document.getElementById('save-btn')
const savingSection = document.getElementById('saving-section')
const savedSection = document.getElementById('saved-section')
const saveSection = document.getElementById('save-section')
const errorSection = document.getElementById('error-section')
const saveError = document.getElementById('save-error')
const retryBtn = document.getElementById('retry-btn')
const articleTitle = document.getElementById('article-title')
const userPhone = document.getElementById('user-phone')
const logoutBtn = document.getElementById('logout-btn')

let currentPhoneNumber = ''

// Initialize
async function init() {
  const { token, phoneNumber } = await chrome.storage.local.get(['token', 'phoneNumber'])

  if (token && phoneNumber) {
    showMainView(phoneNumber)
  } else {
    showLoginView()
  }
}

function showLoginView() {
  loginView.classList.remove('hidden')
  mainView.classList.add('hidden')
  phoneStep.classList.remove('hidden')
  codeStep.classList.add('hidden')
  loginError.classList.add('hidden')
}

function showMainView(phoneNumber) {
  loginView.classList.add('hidden')
  mainView.classList.remove('hidden')
  userPhone.textContent = phoneNumber
  resetSaveState()
}

function resetSaveState() {
  saveSection.classList.remove('hidden')
  savingSection.classList.add('hidden')
  savedSection.classList.add('hidden')
  errorSection.classList.add('hidden')
}

function showError(element, message) {
  element.textContent = message
  element.classList.remove('hidden')
}

function hideError(element) {
  element.classList.add('hidden')
}

// Auth handlers
sendCodeBtn.addEventListener('click', async () => {
  const phone = phoneInput.value.trim()
  if (!phone || phone.length < 10) {
    showError(loginError, 'Please enter a valid phone number')
    return
  }

  sendCodeBtn.disabled = true
  sendCodeBtn.textContent = 'Sending...'
  hideError(loginError)

  try {
    const response = await fetch(`${API_URL}/v1/auth/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'Failed to send code')
    }

    currentPhoneNumber = phone
    phoneStep.classList.add('hidden')
    codeStep.classList.remove('hidden')
  } catch (error) {
    showError(loginError, error.message)
  } finally {
    sendCodeBtn.disabled = false
    sendCodeBtn.textContent = 'Send Code'
  }
})

verifyCodeBtn.addEventListener('click', async () => {
  const code = codeInput.value.trim()
  if (!code || code.length !== 6) {
    showError(loginError, 'Please enter a 6-digit code')
    return
  }

  verifyCodeBtn.disabled = true
  verifyCodeBtn.textContent = 'Verifying...'
  hideError(loginError)

  try {
    const response = await fetch(`${API_URL}/v1/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: currentPhoneNumber,
        code: code,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Invalid code')
    }

    // Save credentials
    await chrome.storage.local.set({
      token: data.token,
      phoneNumber: data.account.phoneNumber,
    })

    showMainView(data.account.phoneNumber)
  } catch (error) {
    showError(loginError, error.message)
  } finally {
    verifyCodeBtn.disabled = false
    verifyCodeBtn.textContent = 'Verify'
  }
})

backBtn.addEventListener('click', () => {
  phoneStep.classList.remove('hidden')
  codeStep.classList.add('hidden')
  codeInput.value = ''
  hideError(loginError)
})

// Save article handler
saveBtn.addEventListener('click', async () => {
  saveSection.classList.add('hidden')
  savingSection.classList.remove('hidden')
  errorSection.classList.add('hidden')

  try {
    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab || !tab.id) {
      throw new Error('No active tab found')
    }

    // Get HTML from the page
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    })

    const html = result.result
    const url = tab.url

    // Get auth token
    const { token } = await chrome.storage.local.get(['token'])

    if (!token) {
      throw new Error('Not logged in')
    }

    // Send to API
    const response = await fetch(`${API_URL}/v1/articles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ url, html }),
    })

    const data = await response.json()

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, logout
        await chrome.storage.local.remove(['token', 'phoneNumber'])
        showLoginView()
        return
      }
      throw new Error(data.message || 'Failed to save article')
    }

    // Show success
    savingSection.classList.add('hidden')
    savedSection.classList.remove('hidden')
    articleTitle.textContent = `"${data.title}"`

    // Reset after 3 seconds
    setTimeout(resetSaveState, 3000)
  } catch (error) {
    savingSection.classList.add('hidden')
    errorSection.classList.remove('hidden')
    saveError.textContent = error.message
  }
})

retryBtn.addEventListener('click', resetSaveState)

// Logout handler
logoutBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'phoneNumber'])
  showLoginView()
})

// Initialize on load
init()
