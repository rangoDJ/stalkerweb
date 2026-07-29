import { getActiveProfileId } from './profiles'

const RECENTLY_WATCHED_MAX = 15

// Scoped per-profile so switching portals doesn't show (or navigate to)
// channels from a different portal's recently-watched history.
function storageKey() {
  const id = getActiveProfileId()
  return id ? `sw_recently_watched_${id}` : 'sw_recently_watched'
}

export function getRecentlyWatched() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '[]') } catch { return [] }
}

export function removeRecentlyWatched(uniqueId) {
  const filtered = getRecentlyWatched().filter(c => String(c.uniqueId) !== String(uniqueId))
  localStorage.setItem(storageKey(), JSON.stringify(filtered))
}

export function pushRecentlyWatched(channel, logoUrl) {
  const entry = { uniqueId: String(channel.uniqueId), name: channel.name, number: channel.number, logo: logoUrl || '' }
  const prev = getRecentlyWatched().filter(c => String(c.uniqueId) !== String(channel.uniqueId))
  localStorage.setItem(storageKey(), JSON.stringify([entry, ...prev].slice(0, RECENTLY_WATCHED_MAX)))
}
