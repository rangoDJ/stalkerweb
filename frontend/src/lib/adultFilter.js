const ADULT_PATTERNS = [
  'adult',
  'for adults',
  'xxx',
  '18+',
  'erotic',
  'erotica',
  'hentai',
  'porn',
  'sexy',
  'nsfw',
]

export function isAdult(name) {
  const lower = name?.toLowerCase() || ''
  return ADULT_PATTERNS.some(p => lower.includes(p))
}
