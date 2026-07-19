import { getChannels, getGroups, getLogoMap, getChannelProgress } from '../stalkerApi'

// ── Module-level state ────────────────────────────────────────────────────────
// `cache`      — last known snapshot ({ channels, groups, logoMap, loading })
// `inflight`   — deduplicates concurrent initial fetches
// `polling`    — true while the background progress poller is running
// `generation` — incremented on invalidate so stale pollers self-cancel
// `listeners`  — components subscribed to channel-data updates

let cache = null
let inflight = null
let polling = false
let generation = 0
const listeners = new Set()

function notify(data) {
  listeners.forEach(fn => fn(data))
}

// Opens a Server-Sent Events connection to /api/channels/events and re-fetches
// the channel list every time the backend's page count grows — so the grid
// fills in page-by-page instead of sitting empty until the whole load
// finishes — then does one last fetch once loading=false.  Falls back to
// polling if SSE is unavailable.
function startPolling(gen) {
  if (polling) return
  polling = true
  let lastCount = -1

  // Re-fetches the channel list if the backend's count moved since our last
  // fetch (skips redundant re-fetches on ticks where nothing new landed).
  const refetch = async (loading) => {
    const chRes = await getChannels()
    if (gen !== generation) return
    if (chRes?.channels) {
      cache = { ...cache, channels: chRes.channels, loading }
      notify(cache)
    }
  }

  // Try SSE first (lower latency, no round-trips)
  if (typeof EventSource !== 'undefined') {
    const es = new EventSource('/api/channels/events')
    es.onmessage = async (e) => {
      if (gen !== generation) { es.close(); polling = false; return }
      try {
        const prog = JSON.parse(e.data)
        if (!prog.loading) {
          es.close()
          await refetch(false)
          polling = false
          return
        }
        if (prog.channelCount !== lastCount) {
          lastCount = prog.channelCount
          await refetch(true)
        }
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => {
      es.close()
      polling = false
      // Fall back to a single delayed retry
      setTimeout(() => _pollOnce(gen), 3000)
    }
    return
  }

  // Fallback: plain polling when EventSource is unavailable
  _pollOnce(gen)
}

async function _pollOnce(gen) {
  polling = true
  let lastCount = -1
  try {
    while (true) {
      await new Promise(r => setTimeout(r, 1500))
      if (gen !== generation) break
      const prog = await getChannelProgress()
      if (gen !== generation) break
      if (!prog.loading) {
        const chRes = await getChannels()
        if (gen !== generation) break
        if (chRes?.channels) {
          cache = { ...cache, channels: chRes.channels, loading: false }
          notify(cache)
        }
        break
      }
      if (prog.channelCount !== lastCount) {
        lastCount = prog.channelCount
        const chRes = await getChannels()
        if (gen !== generation) break
        if (chRes?.channels) {
          cache = { ...cache, channels: chRes.channels, loading: true }
          notify(cache)
        }
      }
    }
  } catch { /* best-effort */ } finally {
    polling = false
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Returns immediately with whatever the backend has right now (may be a
// partial channel list while loading is in progress).  If the backend reports
// loading=true, starts a background poller that will call subscribeChannelUpdates
// listeners when the full data is ready.
export async function getCachedChannelData() {
  if (cache) return cache
  if (inflight) return inflight

  const gen = generation
  inflight = Promise.all([getChannels(), getGroups(), getLogoMap()])
    .then(([chRes, grpRes, logoMap]) => {
      cache = {
        channels: chRes.channels ?? [],
        groups:   grpRes.groups ?? [],
        logoMap,
        loading:  chRes.loading ?? false,
      }
      inflight = null
      // If backend is still loading, start polling so subscribers get the
      // complete list once it arrives — without blocking the caller.
      if (cache.loading) startPolling(gen)
      return cache
    })
    .catch(e => { inflight = null; throw e })

  return inflight
}

// Register a callback that fires whenever the full channel data arrives from
// the background poller.  Returns an unsubscribe function.
export function subscribeChannelUpdates(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Clears the cache (e.g. on disconnect).  Increments generation so any
// in-progress poller self-cancels rather than overwriting the cleared state.
export function invalidateChannelCache() {
  cache = null
  generation++
}
