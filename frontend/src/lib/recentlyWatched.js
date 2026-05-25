const RECENTLY_WATCHED_KEY = 'sw_recently_watched'
const RECENTLY_WATCHED_MAX = 15

export function getRecentlyWatched() {
  try { return JSON.parse(localStorage.getItem(RECENTLY_WATCHED_KEY) || '[]') } catch { return [] }
}

export function removeRecentlyWatched(uniqueId) {
  const filtered = getRecentlyWatched().filter(c => String(c.uniqueId) !== String(uniqueId))
  localStorage.setItem(RECENTLY_WATCHED_KEY, JSON.stringify(filtered))
}

export function pushRecentlyWatched(channel, logoUrl) {
  const entry = { uniqueId: String(channel.uniqueId), name: channel.name, number: channel.number, logo: logoUrl || '' }
  const prev = getRecentlyWatched().filter(c => String(c.uniqueId) !== String(channel.uniqueId))
  localStorage.setItem(RECENTLY_WATCHED_KEY, JSON.stringify([entry, ...prev].slice(0, RECENTLY_WATCHED_MAX)))
}
