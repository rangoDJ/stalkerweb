import { useState, useEffect } from 'react'
import { getFavorites, addFavoriteChannel, removeFavoriteChannel } from '../stalkerApi'
import { showToast } from './toast'

let favsCache = null
let favsInflight = null

function getCachedFavorites() {
  if (favsCache) return Promise.resolve(favsCache)
  if (favsInflight) return favsInflight
  favsInflight = getFavorites()
    .then(r => { favsCache = r; favsInflight = null; return r })
    .catch(e => { favsInflight = null; throw e })
  return favsInflight
}

function invalidateFavs() { favsCache = null }

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState(new Set())

  useEffect(() => {
    getCachedFavorites()
      .then(r => setFavoriteIds(new Set(r.channels.map(c => String(c.uniqueId)))))
      .catch(() => {})
  }, [])

  async function toggleFavorite(channel) {
    const id = String(channel.uniqueId)
    const wasIn = favoriteIds.has(id)
    // Optimistic update
    setFavoriteIds(prev => { const s = new Set(prev); wasIn ? s.delete(id) : s.add(id); return s })
    try {
      await (wasIn ? removeFavoriteChannel(id) : addFavoriteChannel(id))
      invalidateFavs()
    } catch {
      // Roll back on API failure
      setFavoriteIds(prev => { const s = new Set(prev); wasIn ? s.add(id) : s.delete(id); return s })
      showToast(wasIn ? 'Could not remove favorite' : 'Could not add favorite', 'error')
    }
  }

  return { favoriteIds, setFavoriteIds, toggleFavorite }
}
