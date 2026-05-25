import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import CacheManager from '../cache/CacheManager.js'

const TMP_DIR = path.join(os.tmpdir(), 'stalkerweb-test-' + Date.now())

describe('CacheManager', () => {
  let cache

  beforeEach(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true })
    cache = new CacheManager(TMP_DIR)
  })

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('returns null when no config exists', () => {
    expect(cache.load()).toBeNull()
  })

  it('saves and loads config', () => {
    cache.save({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    const loaded = cache.load()
    expect(loaded.portal).toBe('http://test.com/c/')
    expect(loaded.mac).toBe('00:1A:79:00:00:01')
  })

  it('saves and retrieves token', () => {
    cache.save({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    cache.saveToken('http://test.com/c/', 'abc123')
    expect(cache.getToken('http://test.com/c/')).toBe('abc123')
  })

  it('falls back to legacy token field', () => {
    cache.save({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01', token: 'legacy-token' })
    expect(cache.getToken('http://test.com/c/')).toBe('legacy-token')
  })

  it('saves portal signature', () => {
    cache.save({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    cache.savePortalSignature('sig-from-portal')
    const loaded = cache.load()
    expect(loaded.portal_signature).toBe('sig-from-portal')
  })

  it('clearAll removes config and cache', () => {
    cache.save({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    const cacheFile = path.join(TMP_DIR, 'cache', 'test.txt')
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile, 'data')
    cache.clearAll()
    expect(() => fs.readFileSync(cache.configFile)).toThrow()
    expect(fs.readdirSync(path.join(TMP_DIR, 'cache'))).toHaveLength(0)
  })
})
