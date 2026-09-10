// Language handling for the per-profile "hide these languages" filter.
// Mirrors backend/lib/languages.js — see there for why the filter keys on the
// language half of a "LANGUAGE | SECTION" name rather than the whole name.

/** The language half of a "LANGUAGE | SECTION" name, normalised for comparison. */
export function languageOf(name) {
  return String(name ?? '').split('|')[0].trim().toUpperCase()
}

/** Builds a comparison-ready Set from a profile's stored list. */
export function toLanguageSet(list) {
  return new Set((Array.isArray(list) ? list : []).map(languageOf).filter(Boolean))
}

/** True when `name`'s language is hidden. */
export function isLanguageDisabled(name, disabledLanguages) {
  if (!disabledLanguages || disabledLanguages.size === 0) return false
  return disabledLanguages.has(languageOf(name))
}
