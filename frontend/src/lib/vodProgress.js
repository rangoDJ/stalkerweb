// Persisted "Continue Watching" progress for VOD movies and series episodes.
// Same localStorage approach as recentlyWatched.js, but stores a playback
// position + the params needed to relaunch the exact title/episode.

const VOD_PROGRESS_KEY = 'sw_vod_progress'
const VOD_PROGRESS_MAX = 20

// Don't offer resume for the first 30s (barely started) or the last 5%
// (effectively finished — clear it instead so it leaves the row).
export const VOD_RESUME_MIN_SECS = 30
export const VOD_DONE_FRACTION   = 0.95

export function getVodProgressList() {
  try {
    const list = JSON.parse(localStorage.getItem(VOD_PROGRESS_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// Composite key so a movie and each episode of a series track independently.
export function makeVodKey({ videoId, seasonId = '', episodeId = '' }) {
  return [videoId, seasonId, episodeId].filter(Boolean).join(':')
}

export function getVodProgress(key) {
  return getVodProgressList().find(e => e.key === key) || null
}

export function removeVodProgress(key) {
  const list = getVodProgressList().filter(e => e.key !== key)
  localStorage.setItem(VOD_PROGRESS_KEY, JSON.stringify(list))
}

// entry: { key, title, episodeTitle, screenshotUrl, position, duration, params }
// Drops the entry (rather than saving) when the title is barely started or
// effectively finished, so the Continue Watching row self-prunes.
export function saveVodProgress(entry) {
  if (!entry?.key || !entry.duration || !isFinite(entry.duration)) return
  const list = getVodProgressList().filter(e => e.key !== entry.key)
  const fraction = entry.position / entry.duration
  if (entry.position < VOD_RESUME_MIN_SECS || fraction >= VOD_DONE_FRACTION) {
    localStorage.setItem(VOD_PROGRESS_KEY, JSON.stringify(list))
    return
  }
  const next = [{ ...entry, updatedAt: Date.now() }, ...list].slice(0, VOD_PROGRESS_MAX)
  localStorage.setItem(VOD_PROGRESS_KEY, JSON.stringify(next))
}
