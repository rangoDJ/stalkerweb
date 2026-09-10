import { describe, it, expect } from 'vitest'
import { languageOf, isLanguageDisabled, toLanguageSet, collectLanguages } from '../lib/languages.js'

describe('languageOf', () => {
  it('takes the half before the separator', () => {
    expect(languageOf('PUNJABI | WEB SERIES')).toBe('PUNJABI')
  })

  it('normalises case and the stray whitespace portal titles carry', () => {
    // Observed live: 'OTHERS | NETFLIX                        '
    expect(languageOf('  others | netflix          ')).toBe('OTHERS')
  })

  it('returns the whole name when there is no section', () => {
    expect(languageOf('SPORTS')).toBe('SPORTS')
  })

  it('handles null and undefined without throwing', () => {
    expect(languageOf(null)).toBe('')
    expect(languageOf(undefined)).toBe('')
  })
})

describe('isLanguageDisabled', () => {
  const hidden = toLanguageSet(['PUNJABI', 'urdu'])

  it('matches a category by its language regardless of section', () => {
    // The whole names never match across channels and VOD; the language does.
    expect(isLanguageDisabled('PUNJABI | MUSIC ALBUMS', hidden)).toBe(true)
    expect(isLanguageDisabled('URDU | STAGE DRAMAS', hidden)).toBe(true)
  })

  it('leaves other languages alone', () => {
    expect(isLanguageDisabled('ENGLISH | NETFLIX', hidden)).toBe(false)
  })

  it('is a no-op when nothing is hidden', () => {
    expect(isLanguageDisabled('PUNJABI | MOVIES', new Set())).toBe(false)
    expect(isLanguageDisabled('PUNJABI | MOVIES', null)).toBe(false)
  })
})

describe('collectLanguages', () => {
  it('de-duplicates across channel genres and VOD categories, sorted', () => {
    expect(collectLanguages([
      'ENGLISH | NEWS', 'ENGLISH | KIDS MOVIES', 'PUNJABI | TV',
    ])).toEqual(['ENGLISH', 'PUNJABI'])
  })

  it('keeps portal spelling variants as separate entries', () => {
    // This is the point of building the list from both sources: the same portal
    // says BENGALI for channels and BANGALI for VOD, so both must be togglable.
    expect(collectLanguages(['BENGALI | TV', 'BANGALI | MOVIES']))
      .toEqual(['BANGALI', 'BENGALI'])
  })

  it('drops the portal catch-all pseudo-entry', () => {
    expect(collectLanguages(['All', 'ENGLISH | NEWS'])).toEqual(['ENGLISH'])
  })
})
