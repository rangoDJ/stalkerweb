// epgReminders.js — localStorage-backed EPG reminder management
// localStorage key: 'epg_reminders' → [{ id, channelId, channelName, title, startTime, notifiedAt }]

const STORAGE_KEY = 'epg_reminders'
const NOTIFY_AHEAD_MS = 2 * 60 * 1000 // 2 minutes

function loadRaw() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRaw(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage full or unavailable — fail silently
  }
}

/**
 * Returns all saved reminders.
 * @returns {{ id: string, channelId: string, channelName: string, title: string, startTime: number, notifiedAt: number|null }[]}
 */
export function getReminders() {
  return loadRaw()
}

/**
 * Adds a new reminder. Deduplicates by channelId + startTime.
 * @param {string} channelId
 * @param {string} channelName
 * @param {string} title
 * @param {number} startTime  Unix timestamp (seconds)
 */
export function addReminder(channelId, channelName, title, startTime) {
  const items = loadRaw()
  const exists = items.find(r => r.channelId === channelId && r.startTime === startTime)
  if (exists) return exists

  const id = `${channelId}_${startTime}_${Date.now()}`
  const reminder = { id, channelId, channelName, title, startTime, notifiedAt: null }
  items.push(reminder)
  saveRaw(items)
  return reminder
}

/**
 * Removes a reminder by id.
 * @param {string} id
 */
export function removeReminder(id) {
  const items = loadRaw().filter(r => r.id !== id)
  saveRaw(items)
}

/**
 * Marks a reminder as notified (prevents double-firing).
 * @param {string} id
 */
export function markNotified(id) {
  const items = loadRaw().map(r =>
    r.id === id ? { ...r, notifiedAt: Date.now() } : r
  )
  saveRaw(items)
}

/**
 * Returns reminders that are due to fire (startTime within next NOTIFY_AHEAD_MS)
 * and have not yet been notified.
 * Also prunes reminders whose startTime is more than 1 hour in the past.
 */
export function checkReminders() {
  const now = Date.now()
  let items = loadRaw()

  // Prune old reminders (started more than 1 hour ago)
  const pruned = items.filter(r => r.startTime * 1000 > now - 60 * 60 * 1000)
  if (pruned.length !== items.length) {
    saveRaw(pruned)
    items = pruned
  }

  // Return reminders due within NOTIFY_AHEAD_MS that haven't been notified
  return items.filter(r => {
    if (r.notifiedAt) return false
    const msUntilStart = r.startTime * 1000 - now
    return msUntilStart >= 0 && msUntilStart <= NOTIFY_AHEAD_MS
  })
}
