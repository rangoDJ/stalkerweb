import { useState, useEffect, useCallback } from 'react'
import {
  getReminders,
  addReminder as _addReminder,
  removeReminder as _removeReminder,
  checkReminders,
  markNotified,
} from './epgReminders'

const CHECK_INTERVAL_MS = 30_000

// Shared across every useReminders() call site (TopNav's ReminderBell,
// EpgGridPage's per-programme toggle, …) so adding/removing/firing a
// reminder in one instance is reflected in all the others immediately,
// instead of each keeping independent state that only converges once its
// own 30s check happens to find something due.
const listeners = new Set()
function notifyAll() {
  const list = getReminders()
  listeners.forEach(fn => fn(list))
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const perm = await Notification.requestPermission()
  return perm === 'granted'
}

function fireNotification(reminder) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const minutesAway = Math.round((reminder.startTime * 1000 - Date.now()) / 60000)
  const body = minutesAway > 0
    ? `Starting in ${minutesAway} minute${minutesAway !== 1 ? 's' : ''} on ${reminder.channelName}`
    : `Starting now on ${reminder.channelName}`
  try {
    new Notification(`Reminder: ${reminder.title}`, {
      body,
      icon: '/favicon.ico',
      tag: reminder.id,
    })
  } catch {
    // Notification creation can fail in some browsers — ignore
  }
}

/**
 * Hook that manages EPG reminders and fires browser notifications when due.
 * Checks every 30 seconds.
 */
export function useReminders() {
  const [reminders, setReminders] = useState(() => getReminders())

  // Subscribe to updates from any useReminders() instance, anywhere.
  useEffect(() => {
    listeners.add(setReminders)
    return () => listeners.delete(setReminders)
  }, [])

  // Refresh (this instance's local view — but also broadcasts to every
  // other subscribed instance, since the storage read is the same for all)
  const refresh = useCallback(() => {
    notifyAll()
  }, [])

  // Check for due reminders and fire notifications
  const check = useCallback(async () => {
    const due = checkReminders()
    if (due.length === 0) return

    const permitted = await requestNotificationPermission()
    for (const r of due) {
      markNotified(r.id)
      if (permitted) fireNotification(r)
    }
    notifyAll()
  }, [])

  // Periodic checker
  useEffect(() => {
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [check])

  const addReminder = useCallback((channelId, channelName, title, startTime) => {
    _addReminder(channelId, channelName, title, startTime)
    notifyAll()
  }, [])

  const removeReminder = useCallback((id) => {
    _removeReminder(id)
    notifyAll()
  }, [])

  return { reminders, addReminder, removeReminder, refresh }
}
