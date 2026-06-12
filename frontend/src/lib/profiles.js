// lib/profiles.js
// Client-side profile storage. Each profile holds the portal connection
// details plus per-profile UI preferences (currently: disabledGenres).
//
// Profiles and the "active profile" pointer both live in localStorage so the
// selection survives reloads and the backend auto-reconnect.

const PROFILES_KEY = 'stalkerweb_profiles'
const ACTIVE_KEY   = 'stalkerweb_active_profile'

export const DEFAULT_FORM = {
  name: '',
  portal: '', mac: '', timezone: 'Europe/London', lang: 'en',
  login: '', password: '', token: '', serial_number: '0000000000000',
  device_id: '', device_id2: '', signature: '', portal_signature: '',
  // STBEmu device (per-profile) — used for the STBEmu backup export
  stb_model: 'MAG250', firmware: '0.2.18-r14-pub-250', custom_firmware: '',
  connection_timeout: 10,
  disabledGenres: [],
}

export function uid() {
  return `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function normalizePortal(url) {
  return String(url).trim().replace(/\/c\/?$/, '').replace(/\/?$/, '') + '/c/'
}

export function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]') } catch { return [] }
}

export function saveProfiles(arr) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(arr))
}

// ── Active profile pointer ───────────────────────────────────────────────────

export function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_KEY) || null
}

export function setActiveProfileId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function getActiveProfile() {
  const id = getActiveProfileId()
  if (!id) return null
  return loadProfiles().find(p => p.id === id) || null
}

// ── Per-profile genre filters ────────────────────────────────────────────────

export function getProfileGenres(id) {
  const p = loadProfiles().find(x => x.id === id)
  return Array.isArray(p?.disabledGenres) ? p.disabledGenres : []
}

// Writes the disabledGenres array onto a profile and persists. Returns the
// updated profiles array.
export function setProfileGenres(id, genres) {
  const profiles = loadProfiles()
  const updated  = profiles.map(p =>
    p.id === id ? { ...p, disabledGenres: genres } : p
  )
  saveProfiles(updated)
  return updated
}

// One-time migration: genre filters used to live in the backend's global
// settings (disabled_genres). Now they're strictly per-profile. On first run,
// seed the active profile from that legacy global list if the profile has none
// yet, then never touch it again (so a user who deliberately clears all genres
// isn't re-seeded on the next load). Idempotent via a localStorage flag.
const GENRES_MIGRATED_KEY = 'stalkerweb_genres_migrated'

export function migrateGlobalGenresToActiveProfile(globalGenres) {
  if (localStorage.getItem(GENRES_MIGRATED_KEY)) return
  const id = getActiveProfileId()
  if (id && Array.isArray(globalGenres) && globalGenres.length && !getProfileGenres(id).length) {
    setProfileGenres(id, globalGenres)
  }
  localStorage.setItem(GENRES_MIGRATED_KEY, '1')
}
