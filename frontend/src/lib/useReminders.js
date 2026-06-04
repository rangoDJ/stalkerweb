import { useState, useEffect, useCallback } from 'react'
import {
  getReminders,
  addReminder as _addReminder,
  removeReminder as _removeReminder,
  checkReminders,
  markNotified,
} from './epgReminders'

const CHECK_INTERVAL_MS = 30_000

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

  // Refresh local state from storage
  const refresh = useCallback(() => {
    setReminders(getReminders())
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
    refresh()
  }, [refresh])

  // Periodic checker
  useEffect(() => {
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [check])

  const addReminder = useCallback((channelId, channelName, title, startTime) => {
    _addReminder(channelId, channelName, title, startTime)
    refresh()
  }, [refresh])

  const removeReminder = useCallback((id) => {
    _removeReminder(id)
    refresh()
  }, [refresh])

  return { reminders, addReminder, removeReminder, refresh }
}
