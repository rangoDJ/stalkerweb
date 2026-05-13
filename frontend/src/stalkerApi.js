// stalkerApi.js — thin wrapper around fetch() for the backend REST API
const BASE = '/api'

async function _get(path) {
  const r = await fetch(BASE + path)
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(e.error || r.statusText)
  }
  return r.json()
}

async function _post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(e.error || r.statusText)
  }
  return r.json()
}

async function _delete(path) {
  const r = await fetch(BASE + path, { method: 'DELETE' })
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(e.error || r.statusText)
  }
  return r.json()
}

// ── Auth ──────────────────────────────────────────────────────────────────
export const connect = (body) => _post('/auth/connect', body)
export const disconnect = () => _delete('/auth/disconnect')
export const getStatus = () => _get('/auth/status')
export const getConfig = () => _get('/auth/config')

// ── Channels & Groups ─────────────────────────────────────────────────────
export const getChannels = (group = null, refresh = false) => {
  const params = new URLSearchParams()
  if (group) params.set('group', group)
  if (refresh) params.set('refresh', '1')
  return _get(`/channels?${params}`)
}

export const getGroups = (refresh = false) =>
  _get(`/channels/groups/all${refresh ? '?refresh=1' : ''}`)

// ── EPG ───────────────────────────────────────────────────────────────────
export const getEpg = (period = 24) => _get(`/epg?period=${period}`)
export const getChannelEpg = (channelId, period = 24) =>
  _get(`/epg/${channelId}?period=${period}`)

// ── Stream ────────────────────────────────────────────────────────────────
export const getStreamUrl = (channelId) => _get(`/stream/${channelId}`)
