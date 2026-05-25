import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    const cond = false
    expect(cn('base', cond && 'hidden', 'visible')).toBe('base visible')
  })

  it('handles undefined values', () => {
    expect(cn('a', undefined, 'b')).toBe('a b')
  })

  it('handles tailwind conflict resolution', () => {
    const result = cn('px-4', 'px-2')
    expect(result).toBe('px-2')
  })
})
