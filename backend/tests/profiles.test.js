import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import ProfilesManager from '../profiles/ProfilesManager.js'

const TMP_DIR = path.join(os.tmpdir(), 'stalkerweb-test-profiles-' + Date.now())

describe('ProfilesManager', () => {
  let profiles

  beforeEach(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true })
    profiles = new ProfilesManager(TMP_DIR)
  })

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('starts empty', () => {
    expect(profiles.list()).toEqual({ profiles: [], activeProfileId: null })
  })

  it('creates a profile and assigns an id', () => {
    const p = profiles.create({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    expect(p.id).toBeTruthy()
    expect(profiles.list().profiles).toHaveLength(1)
  })

  it('preserves a client-supplied id (for migration)', () => {
    const p = profiles.create({ id: 'prof_123', portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    expect(p.id).toBe('prof_123')
  })

  it('falls back to a generated id if the supplied one collides', () => {
    profiles.create({ id: 'prof_dup', portal: 'http://a.com/c/', mac: '00:1A:79:00:00:01' })
    const p2 = profiles.create({ id: 'prof_dup', portal: 'http://b.com/c/', mac: '00:1A:79:00:00:02' })
    expect(p2.id).not.toBe('prof_dup')
  })

  it('updates a profile by id', () => {
    const p = profiles.create({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01', name: 'Old' })
    const updated = profiles.update(p.id, { name: 'New' })
    expect(updated.name).toBe('New')
    expect(updated.portal).toBe('http://test.com/c/')
  })

  it('returns null updating a missing profile', () => {
    expect(profiles.update('nope', { name: 'x' })).toBeNull()
  })

  it('sets and clears the active profile', () => {
    const p = profiles.create({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    expect(profiles.setActive(p.id)).toBe(true)
    expect(profiles.list().activeProfileId).toBe(p.id)
    expect(profiles.setActive(null)).toBe(true)
    expect(profiles.list().activeProfileId).toBeNull()
  })

  it('rejects setting an active profile that does not exist', () => {
    expect(profiles.setActive('nonexistent')).toBe(false)
  })

  it('removing the active profile clears the active pointer', () => {
    const p = profiles.create({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    profiles.setActive(p.id)
    profiles.remove(p.id)
    expect(profiles.list()).toEqual({ profiles: [], activeProfileId: null })
  })

  it('removing a non-active profile leaves the active pointer intact', () => {
    const p1 = profiles.create({ portal: 'http://a.com/c/', mac: '00:1A:79:00:00:01' })
    const p2 = profiles.create({ portal: 'http://b.com/c/', mac: '00:1A:79:00:00:02' })
    profiles.setActive(p1.id)
    profiles.remove(p2.id)
    expect(profiles.list().activeProfileId).toBe(p1.id)
  })

  it('persists across a fresh manager instance', () => {
    profiles.create({ portal: 'http://test.com/c/', mac: '00:1A:79:00:00:01' })
    const reloaded = new ProfilesManager(TMP_DIR)
    expect(reloaded.list().profiles).toHaveLength(1)
  })
})
