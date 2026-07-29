// lib/downloads.js — shared "VOD downloads" state, backed by an SSE
// subscription to /api/downloads/events so every component watching the
// queue (the Downloads page, a "downloading…" badge elsewhere, etc.) sees
// the same list without each polling independently.

import { getDownloads, enqueueDownloads, cancelDownload } from '../stalkerApi'

let jobs = []
let es = null
const listeners = new Set()

function notify() {
  listeners.forEach(fn => fn(jobs))
}

function ensureConnected() {
  if (es || typeof EventSource === 'undefined') return
  es = new EventSource('/api/downloads/events')
  es.onmessage = (e) => {
    try {
      jobs = JSON.parse(e.data)
      notify()
    } catch { /* ignore malformed frame */ }
  }
  es.onerror = () => {
    // Let the browser's built-in EventSource auto-reconnect; nothing to do
    // here beyond not tearing down state on a transient drop.
  }
}

// Subscribe to the live job list. Connects the SSE stream on first
// subscriber and tears it down when the last one unsubscribes.
export function subscribeDownloads(fn) {
  ensureConnected()
  listeners.add(fn)
  fn(jobs)
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && es) { es.close(); es = null }
  }
}

export function getDownloadJobs() {
  return jobs
}

// One-time fetch for a component that wants the current snapshot without
// waiting for the next SSE frame (the subscription above also delivers one
// immediately on connect, so this is mostly a convenience for callers that
// don't want to subscribe).
export async function fetchDownloads() {
  const r = await getDownloads()
  jobs = r.downloads || []
  notify()
  return jobs
}

// items: [{ videoId, cmd, series, seasonId, episodeId, title, seriesTitle }]
export async function queueDownload(items) {
  return enqueueDownloads(items)
}

export async function removeDownload(id) {
  return cancelDownload(id)
}
