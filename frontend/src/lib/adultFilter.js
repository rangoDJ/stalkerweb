export function isAdult(name) {
  const lower = name?.toLowerCase() || ''
  return lower.includes('adult') || lower.includes('for adults')
}
