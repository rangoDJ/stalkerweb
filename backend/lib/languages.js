// lib/languages.js
// Shared language handling for the per-profile "hide these languages" filter.
//
// Both channel genres and VOD categories are named "LANGUAGE | SECTION"
// ("ENGLISH | NEWS", "PUNJABI | WEB SERIES"), but the section halves come from
// different parts of the portal and rarely match, so filtering on whole names
// is useless across the two — on a live portal exactly 1 of 125 VOD categories
// matched a disabled channel genre. The language half does match, and is what
// users actually think in, so the filter keys on that.
//
// Portals are not consistent about spelling it, either: the same portal serves
// channel genres as "BENGALI | TV" and VOD categories as "BANGALI | MOVIES".
// Rather than maintain a per-portal alias table, the language list offered to
// the user is built from channels *and* VOD, so both spellings appear as their
// own entries and can each be turned off.

'use strict';

/**
 * The language half of a "LANGUAGE | SECTION" name, normalised for comparison.
 * Returns the whole (normalised) name when there is no section separator.
 * Portal titles carry stray whitespace, hence the trim on both halves.
 */
function languageOf(name) {
  return String(name ?? '').split('|')[0].trim().toUpperCase();
}

/** True when `name`'s language is in `disabledLanguages`. */
function isLanguageDisabled(name, disabledLanguages) {
  if (!disabledLanguages || disabledLanguages.size === 0) return false;
  return disabledLanguages.has(languageOf(name));
}

/** Builds a comparison-ready Set from a profile's stored list. */
function toLanguageSet(list) {
  return new Set((Array.isArray(list) ? list : []).map(languageOf).filter(Boolean));
}

/**
 * Distinct languages across the supplied names, sorted. Used to build the
 * list of togglable languages; "ALL" is the portal's catch-all pseudo-entry
 * and is never a language.
 */
function collectLanguages(names) {
  const out = new Set();
  for (const n of names || []) {
    const lang = languageOf(n);
    if (lang && lang !== 'ALL') out.add(lang);
  }
  return [...out].sort();
}

module.exports = { languageOf, isLanguageDisabled, toLanguageSet, collectLanguages };
