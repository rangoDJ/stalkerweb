import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import FavoritesManager from '../favorites/FavoritesManager.js'

const TMP_DIR = path.join(os.tmpdir(), 'stalkerweb-test-fav-migrate-' + Date.now())

// Stands in for ChannelManager.resolveLegacyId: legacy hash → portal id.
const LEGACY_TO_NEW = { 607446590: '90210', 111111111: '90211' }
const resolve = (id) => LEGACY_TO_NEW[id] ?? null

describe('FavoritesManager.migrateLegacyIds', () => {
  let favorites

  beforeEach(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true })
    favorites = new FavoritesManager(TMP_DIR)
  })

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('rewrites legacy ids in the flat favorites list', () => {
    favorites.addChannel('607446590')

    expect(favorites.migrateLegacyIds(resolve)).toBe(1)
    expect(favorites.getFavoriteChannelIds()).toEqual(['90210'])
  })

  it('rewrites legacy ids inside groups too', () => {
    const g = favorites.createGroup('News')
    favorites.addChannelToGroup(g.id, '111111111')

    expect(favorites.migrateLegacyIds(resolve)).toBe(1)
    expect(favorites.getRaw().groups[0].channels).toEqual(['90211'])
  })

  it('leaves unknown ids alone rather than dropping the favorite', () => {
    // A channel missing from a partial load must keep its star.
    favorites.addChannel('999999999')

    expect(favorites.migrateLegacyIds(resolve)).toBe(0)
    expect(favorites.getFavoriteChannelIds()).toEqual(['999999999'])
  })

  it('is idempotent — a second run changes nothing', () => {
    favorites.addChannel('607446590')
    favorites.migrateLegacyIds(resolve)

    expect(favorites.migrateLegacyIds(resolve)).toBe(0)
    expect(favorites.getFavoriteChannelIds()).toEqual(['90210'])
  })
})
