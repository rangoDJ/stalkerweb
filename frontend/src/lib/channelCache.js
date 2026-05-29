import { getChannels, getGroups, getLogoMap } from '../stalkerApi'

let cache = null
let inflight = null

// Module-level cache shared across all page instances.
// Second caller within the same session resolves instantly from memory.
export async function getCachedChannelData() {
  if (cache) return cache
  if (inflight) return inflight
  inflight = Promise.all([getChannels(), getGroups(), getLogoMap()])
    .then(([chRes, grpRes, logoMap]) => {
      cache = {
        channels: chRes.channels ?? [],
        groups: grpRes.groups ?? [],
        logoMap,
      }
      inflight = null
      return cache
    })
    .catch(e => {
      inflight = null
      throw e
    })
  return inflight
}

export function invalidateChannelCache() {
  cache = null
}
