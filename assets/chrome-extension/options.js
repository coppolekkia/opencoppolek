import { deriveRelayToken } from './background-utils.js'
import { classifyRelayCheckException, classifyRelayCheckResponse } from './options-validation.js'

const DEFAULT_PORT = 18792

function clampPort(value) {
  const n = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(n)) return DEFAULT_PORT
  if (n <= 0 || n > 65535) return DEFAULT_PORT
  return n
}

function updateRelayUrl(host, port) {
  const el = document.getElementById('relay-url')
  if (!el) return
  const h = String(host || '127.0.0.1').trim() || '127.0.0.1'
  el.textContent = `http://${h}:${port}/`
}

function setStatus(kind, message) {
  const status = document.getElementById('status')
  if (!status) return
  status.dataset.kind = kind || ''
  status.textContent = message || ''
}

async function checkRelayReachable(host, port, token) {
  const h = String(host || '127.0.0.1').trim() || '127.0.0.1'
  const url = `http://${h}:${port}/json/version`
  const trimmedToken = String(token || '').trim()
  if (!trimmedToken) {
    setStatus('error', 'Gateway token required. Save your gateway token to connect.')
    return
  }
  try {
    const relayToken = await deriveRelayToken(trimmedToken, port)
    // Delegate the fetch to the background service worker to bypass
    // CORS preflight on the custom x-openclaw-relay-token header.
    const res = await chrome.runtime.sendMessage({
      type: 'relayCheck',
      url,
      token: relayToken,
    })
    const result = classifyRelayCheckResponse(res, port)
    if (result.action === 'throw') throw new Error(result.error)
    setStatus(result.kind, result.message)
  } catch (err) {
    const result = classifyRelayCheckException(err, port)
    setStatus(result.kind, result.message)
  }
}

async function load() {
  const stored = await chrome.storage.local.get(['relayHost', 'relayPort', 'gatewayToken'])
  const host = String(stored.relayHost || '').trim() || '127.0.0.1'
  const port = clampPort(stored.relayPort)
  const token = String(stored.gatewayToken || '').trim()
  document.getElementById('host').value = host
  document.getElementById('port').value = String(port)
  document.getElementById('token').value = token
  updateRelayUrl(host, port)
  await checkRelayReachable(host, port, token)
}

async function save() {
  const hostInput = document.getElementById('host')
  const portInput = document.getElementById('port')
  const tokenInput = document.getElementById('token')
  const host = String(hostInput.value || '').trim() || '127.0.0.1'
  const port = clampPort(portInput.value)
  const token = String(tokenInput.value || '').trim()
  await chrome.storage.local.set({ relayHost: host, relayPort: port, gatewayToken: token })
  hostInput.value = host
  portInput.value = String(port)
  tokenInput.value = token
  updateRelayUrl(host, port)
  await checkRelayReachable(host, port, token)
}

document.getElementById('save').addEventListener('click', () => void save())
void load()
