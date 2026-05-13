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
export const renameFavoriteGroup = (id, name) => {
  return fetch(`/api/favorites/groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then(r => r.json())
}
export const deleteFavoriteGroup = (id) => _delete(`/favorites/groups/${id}`)
export const addChannelToGroup = (groupId, uniqueId) => _post(`/favorites/groups/${groupId}/channels`, { uniqueId })
export const removeChannelFromGroup = (groupId, uniqueId) => _delete(`/favorites/groups/${groupId}/channels/${uniqueId}`)

// ── Stream ────────────────────────────────────────────────────────────────
export const getStreamUrl = (channelId) => _get(`/stream/${channelId}`)
