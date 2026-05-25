const BASE = '/api'
const TIMEOUT_MS = 30_000

async function _fetch(path, opts = {}) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(BASE + path, { ...opts, signal: controller.signal })
    if (!r.ok) {
      const e = await r.json().catch(() => ({ error: r.statusText }))
      throw new Error(e.error || r.statusText)
    }
    return r.json()
  } finally {
    clearTimeout(id)
  }
}

async function _get(path) {
  return _fetch(path)
}

async function _post(path, body) {
  return _fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function _put(path, body) {
  return _fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function _delete(path) {
  return _fetch(path, { method: 'DELETE' })
}

export const getProxiedLogoUrl = (url) => {
  if (!url || !url.startsWith('http') || url.startsWith('/api/logos/render')) return url
  return `/api/logos/render?url=${encodeURIComponent(url)}`
}

// ── Auth ──────────────────────────────────────────────────────────────────
export const connect = (body) => _post('/auth/connect', body)
export const disconnect = () => _delete('/auth/disconnect')
export const getStatus = () => _get('/auth/status')
export const getConfig = () => _get('/auth/config')
export const saveConfig = (body) => _put('/auth/config', body)

// ── Settings ──────────────────────────────────────────────────────────────
export const getSettings = () => _get('/settings')
export const saveSettings = (body) => _post('/settings', body)

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
export const getNowNext = () => _get('/epg/now')

// ── Logos ─────────────────────────────────────────────────────────────────
export const getLogos = () => _get('/logos')
export const getLogoMap = () => _get('/logos/map')
export const addLogoOverride = (name, url) => _post('/logos', { name, url })
export const deleteLogoOverride = (name) => _delete(`/logos/${encodeURIComponent(name)}`)
export const refreshLogosDb = () => _post('/logos/refresh', {})

// ── Favorites ─────────────────────────────────────────────────────────────
export const getFavorites = () => _get('/favorites')
export const addFavoriteChannel = (uniqueId) => _post('/favorites/channels', { uniqueId })
export const removeFavoriteChannel = (uniqueId) => _delete(`/favorites/channels/${uniqueId}`)
export const createFavoriteGroup = (name) => _post('/favorites/groups', { name })
export const renameFavoriteGroup = (id, name) => _put(`/favorites/groups/${id}`, { name })
export const deleteFavoriteGroup = (id) => _delete(`/favorites/groups/${id}`)
export const addChannelToGroup = (groupId, uniqueId) => _post(`/favorites/groups/${groupId}/channels`, { uniqueId })
export const removeChannelFromGroup = (groupId, uniqueId) => _delete(`/favorites/groups/${groupId}/channels/${uniqueId}`)

// ── STBEmu export ─────────────────────────────────────────────────────────
export async function downloadStbEmuBackup() {
  const r = await fetch('/api/export/stbemu')
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(e.error || r.statusText)
  }
  const blob = await r.blob()
  const cd   = r.headers.get('Content-Disposition') || ''
  const m    = cd.match(/filename="([^"]+)"/)
  const name = m ? m[1] : 'stbemu_backup.json'
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

// ── Channel progress ──────────────────────────────────────────────────────
export const getChannelProgress = () => _get('/channels/progress')

// ── Favorites order ───────────────────────────────────────────────────────
export const reorderFavoriteChannels = (order) => _put('/favorites/channels/order', { order })
export const reorderFavoriteGroups   = (order) => _put('/favorites/groups/order',   { order })

// ── Stream ────────────────────────────────────────────────────────────────
export const getStreamUrl = (channelId) => _get(`/stream/${channelId}`)

