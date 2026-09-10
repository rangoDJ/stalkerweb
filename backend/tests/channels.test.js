import { describe, it, expect, beforeEach } from 'vitest'
import ChannelManager from '../stalker/ChannelManager.js'

// _parseChannels only needs getBasePath() off the client to build logo URLs.
const stubClient = { getBasePath: () => 'http://portal.example.com/c/' }

const page = (items) => ({ js: { data: items } })
// `id` is the portal's own channel id and is what uniqueId is derived from,
// so it has to vary per channel the way a real portal's does.
const channel = (name, number) => ({ name, number, id: String(number), cmd: 'ffmpeg http://x', tv_genre_id: '1' })

describe('ChannelManager channel de-duplication', () => {
  let cm

  beforeEach(() => {
    cm = new ChannelManager(stubClient)
  })

  it('keeps one entry when the same channel arrives on two pages', () => {
    // Pages are fetched in parallel and the portal's list can shift between
    // requests, so an item can legitimately appear on more than one page.
    cm._parseChannels(page([channel('CBS - WCBS | NEW YORK CITY', 555)]))
    cm._parseChannels(page([channel('CBS - WCBS | NEW YORK CITY', 555)]))

    expect(cm.getChannels()).toHaveLength(1)
  })

  it('keeps _channels and _channelIndex the same length', () => {
    // The index is a Map and always absorbed duplicates; the array did not, so
    // the two could disagree and clients keyed by uniqueId would see repeats.
    cm._parseChannels(page([
      channel('A', 1),
      channel('B', 2),
      channel('A', 1),
      channel('C', 3),
    ]))

    const ids = cm.getChannels().map((c) => c.uniqueId)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    expect(cm.getChannels().length).toBe(cm._channelIndex.size)
  })

  it('still returns distinct channels for distinct name/number pairs', () => {
    cm._parseChannels(page([channel('Same Name', 1), channel('Same Name', 2)]))

    expect(cm.getChannels()).toHaveLength(2)
  })

  it('drops nameless items without counting them', () => {
    cm._parseChannels(page([{ number: 1 }, channel('Real', 1)]))

    expect(cm.getChannels()).toHaveLength(1)
    expect(cm.getChannels()[0].name).toBe('Real')
  })
})

describe('ChannelManager uniqueId derivation', () => {
  let cm

  beforeEach(() => {
    cm = new ChannelManager(stubClient)
  })

  it('uses the portal channel id as uniqueId', () => {
    cm._parseChannels(page([{ ...channel('BBC One', 101), id: '90210' }]))

    expect(cm.getChannels()[0].uniqueId).toBe('90210')
  })

  it('keeps the old name+number hash as legacyId', () => {
    cm._parseChannels(page([{ ...channel('BBC One', 101), id: '90210' }]))
    const ch = cm.getChannels()[0]

    expect(ch.legacyId).toMatch(/^\d+$/)
    expect(ch.legacyId).not.toBe(ch.uniqueId)
  })

  it('resolves a channel by either its new or its legacy id', () => {
    cm._parseChannels(page([{ ...channel('BBC One', 101), id: '90210' }]))
    const ch = cm.getChannels()[0]

    expect(cm.getChannel('90210')).toBe(ch)
    expect(cm.getChannel(ch.legacyId)).toBe(ch)
    expect(cm.resolveLegacyId(ch.legacyId)).toBe('90210')
    expect(cm.getChannel('does-not-exist')).toBeNull()
  })

  it('separates channels that the legacy hash would have collapsed', () => {
    // Same name and number, different portal ids: under the old scheme both
    // hashed alike and de-duplication silently dropped one.
    cm._parseChannels(page([
      { ...channel('Dup', 7), id: '111' },
      { ...channel('Dup', 7), id: '222' },
    ]))

    expect(cm.getChannels().map((c) => c.uniqueId)).toEqual(['111', '222'])
  })

  it('falls back to the hash when the portal omits an id', () => {
    cm._parseChannels(page([{ name: 'No Id', number: 5 }]))
    const ch = cm.getChannels()[0]

    expect(ch.uniqueId).toBe(ch.legacyId)
    expect(ch.uniqueId).toMatch(/^\d+$/)
  })
})
