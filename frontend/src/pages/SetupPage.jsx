import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle,
  Trash2, RefreshCw, Image, Download, Plus, Pencil, Plug, PlugZap,
  X, Wifi, WifiOff, Copy, Check, ExternalLink, ListVideo, CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  connect, disconnect, getConfig, getStatus, getSettings, saveSettings,
  getLogos, addLogoOverride, deleteLogoOverride, refreshLogosDb,
  downloadStbEmuBackup, getChannels, getLogoMap, getProxiedLogoUrl, getGroups,
  getLogoStripWords, addLogoStripWord, deleteLogoStripWord,
} from '../stalkerApi'
import { invalidateChannelCache } from '../lib/channelCache'
import { useApp } from '@/lib/appContext'
import {
  loadProfiles, saveProfiles, uid, normalizePortal, DEFAULT_FORM,
  setActiveProfileId, setProfileGenres, getActiveProfileId,
} from '@/lib/profiles'

// ── Helpers ───────────────────────────────────────────────────────────────────

// STBEmu device options — kept in sync with backend routes/settings.js
const STB_MODELS    = ['MAG200', 'MAG250', 'MAG254', 'MAG256', 'MAG270', 'MAG322', 'MAG352', 'CUSTOM']
const STB_FIRMWARES = ['0.2.18-r14-pub-250', '0.2.18-r19-pub-250', 'Generic']

async function checkLogoName(name) {
  const r = await fetch(`/api/logos/check?name=${encodeURIComponent(name)}`)
  return r.ok ? r.json() : null
}

// ── Shared UI primitives ─────────────────────────────────────────────────────

function Field({ label, id, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
    </div>
  )
}

function Card({ title, description, children, className }) {
  return (
    <div className={cn('glass rounded-[var(--radius-lg)] p-6 flex flex-col gap-5', className)}>
      <div>
        <h2 className="font-semibold text-[var(--color-text)]">{title}</h2>
        {description && <p className="text-sm text-[var(--color-muted)] mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Notice({ notice }) {
  if (!notice) return null
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-[var(--radius-sm)] px-4 py-3 text-sm',
      notice.type === 'success'
        ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25'
        : 'bg-[var(--color-live)]/10 text-[var(--color-live)] border border-[var(--color-live)]/25'
    )}>
      {notice.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
      {notice.msg}
    </div>
  )
}

// ── Copyable link row (M3U / XMLTV export URLs) ───────────────────────────────

function LinkRow({ label, url, hint, icon: Icon }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — user can still select the field manually */ }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-[var(--color-muted)] shrink-0" />
        <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
      </div>
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          onFocus={e => e.target.select()}
          className="font-mono text-xs flex-1"
        />
        <Button type="button" variant="outline" onClick={copy} className="shrink-0 h-9 px-3 text-xs gap-1.5">
          {copied ? <Check size={13} className="text-[var(--color-success)]" /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Open in new tab"
          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          <ExternalLink size={13} />
        </a>
      </div>
      {hint && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
    </div>
  )
}

// ── Profile form sheet ────────────────────────────────────────────────────────

function ProfileSheet({ initial, onSave, onClose }) {
  const [form, setForm]       = useState({ ...DEFAULT_FORM, ...initial })
  const [showAdv, setShowAdv] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  function handleSubmit(e) {
    e.preventDefault()
    const p = { ...form, portal: normalizePortal(form.portal) }
    onSave(p)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="glass-strong relative z-10 w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
          <h3 className="font-semibold text-[var(--color-text)]">
            {initial?.id ? 'Edit Profile' : 'New Profile'}
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* scrollable form body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          <Field label="Profile Name" id="prof-name" hint="A friendly label — shown in the profiles list.">
            <Input id="prof-name" placeholder="e.g. Home IPTV" value={form.name} onChange={set('name')} />
          </Field>

          <Field label="Portal URL" id="prof-portal">
            <Input id="prof-portal" type="url" placeholder="http://my.portal.com" value={form.portal}
              onChange={set('portal')}
              onBlur={() => { if (form.portal.trim()) setForm(f => ({ ...f, portal: normalizePortal(f.portal) })) }}
              required />
          </Field>

          <Field label="MAC Address" id="prof-mac">
            <Input id="prof-mac" placeholder="00:1A:79:XX:XX:XX" value={form.mac} onChange={set('mac')} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Timezone" id="prof-tz">
              <Input id="prof-tz" value={form.timezone} onChange={set('timezone')} />
            </Field>
            <Field label="Language" id="prof-lang">
              <Input id="prof-lang" value={form.lang} onChange={set('lang')} />
            </Field>
          </div>

          {/* advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdv(v => !v)}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors w-fit"
          >
            {showAdv ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Advanced options
          </button>

          {showAdv && (
            <div className="flex flex-col gap-4 pt-1 border-t border-[var(--color-border)]">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Login" id="prof-login">
                  <Input id="prof-login" value={form.login} onChange={set('login')} />
                </Field>
                <Field label="Password" id="prof-pw">
                  <Input id="prof-pw" type="password" value={form.password} onChange={set('password')} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Serial Number" id="prof-sn">
                  <Input id="prof-sn" value={form.serial_number} onChange={set('serial_number')} className="font-mono text-xs" />
                </Field>
                <Field label="Timeout (s)" id="prof-to">
                  <Input id="prof-to" type="number" min={3} max={60} value={form.connection_timeout} onChange={set('connection_timeout')} />
                </Field>
              </div>
              <Field label="Device ID" id="prof-did">
                <Input id="prof-did" value={form.device_id || ''} onChange={set('device_id')} className="font-mono text-xs" />
              </Field>
              <Field label="Device ID 2" id="prof-did2">
                <Input id="prof-did2" value={form.device_id2 || ''} onChange={set('device_id2')} className="font-mono text-xs" />
              </Field>
              <Field label="Signature" id="prof-sig">
                <Input id="prof-sig" value={form.signature || ''} onChange={set('signature')} className="font-mono text-xs" />
              </Field>

              {/* STBEmu device — used when exporting an STBEmu backup for this profile */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--color-border)]">
                <Field label="STB Model" id="prof-stb-model">
                  <select id="prof-stb-model" value={form.stb_model || 'MAG250'} onChange={set('stb_model')}
                    className="flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)]">
                    {STB_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Firmware" id="prof-stb-fw">
                  <select id="prof-stb-fw" value={form.firmware || '0.2.18-r14-pub-250'} onChange={set('firmware')}
                    className="flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)]">
                    {STB_FIRMWARES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </div>
              {form.stb_model === 'CUSTOM' && (
                <Field label="Custom Firmware String" id="prof-custom-fw" hint="e.g. mag-custom-2.20.02-pub-000">
                  <Input id="prof-custom-fw" placeholder="mag-xxx-2.20.02-pub-xxx" value={form.custom_firmware || ''}
                    onChange={set('custom_firmware')} className="font-mono text-xs" />
                </Field>
              )}
            </div>
          )}

          {/* sticky footer */}
          <div className="flex gap-3 pt-2 pb-1 mt-auto sticky bottom-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] -mx-5 px-5 py-3">
            <Button type="submit" className="flex-1">Save Profile</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Profile card ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, isConnected, onConnect, onEdit, onDelete, connecting }) {
  const label = profile.name || new URL(profile.portal).hostname || profile.portal
  const busy  = connecting === profile.id

  return (
    <div className={cn(
      'relative rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-4 flex flex-col gap-3 transition-colors',
      isConnected
        ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5'
        : 'border-[var(--color-border)]'
    )}>

      {/* connected badge */}
      {isConnected && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-semibold text-[var(--color-primary-light)] bg-[var(--color-primary)]/15 rounded-full px-2 py-0.5">
          <Wifi size={10} />
          Connected
        </span>
      )}

      {/* identity */}
      <div className="flex flex-col gap-0.5 pr-24">
        <p className="text-sm font-semibold text-[var(--color-text)] truncate">{label}</p>
        <p className="text-xs text-[var(--color-muted)] truncate">{profile.portal}</p>
        <p className="text-xs font-mono text-[var(--color-muted)]">{profile.mac}</p>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2">
        {isConnected ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onConnect(profile)}
            disabled={!!connecting}
            className="h-8 px-3 text-xs gap-1.5"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
            Reconnect
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => onConnect(profile)}
            disabled={!!connecting}
            className="h-8 px-3 text-xs gap-1.5"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plug size={12} />}
            Connect
          </Button>
        )}
        <button
          onClick={() => onEdit(profile)}
          className="h-8 w-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(profile.id)}
          className="h-8 w-8 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:text-[var(--color-live)] hover:bg-[var(--color-surface-2)] transition-colors"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const navigate = useNavigate()
  const { connected, setConnected, setEpgEnabled, showAdult, setShowAdult,
          disabledGenres, setDisabledGenres, setLastPingAt, setIdleInfo } = useApp()

  // ── Profiles ────────────────────────────────────────────────────────────────
  const [profiles, setProfiles]     = useState(loadProfiles)
  const [sheet, setSheet]           = useState(null)   // null | {} (new) | { id,... } (edit)
  const [connecting, setConnecting] = useState(null)   // profile id being connected
  const [notice, setNotice]         = useState(null)
  const [connectedPortal, setConnectedPortal] = useState(null) // {portal, mac} from status
  const [initLoading, setInitLoading] = useState(true)

  // ── App preferences / logos / genres / stbemu state ─────────────────────────
  const [epg, setEpg]               = useState(true)
  const [logoStats, setLogoStats]   = useState(null)
  const [logoOverrides, setLogoOverrides] = useState({})
  const [logoRefreshing, setLogoRefreshing] = useState(false)
  const [newLogoName, setNewLogoName] = useState('')
  const [newLogoUrl, setNewLogoUrl]   = useState('')
  const [logoNotice, setLogoNotice]   = useState(null)
  const [testName, setTestName]       = useState('')
  const [testResult, setTestResult]   = useState(null)
  const [deviceProfile, setDeviceProfile] = useState(null)
  const [unmatchedChannels, setUnmatchedChannels] = useState([])
  const [logoSearchOpen, setLogoSearchOpen]       = useState(false)
  const [logoSearchQuery, setLogoSearchQuery]     = useState('')
  const logoSearchRef = useRef(null)
  const [stripWords, setStripWords]       = useState([])
  const [newStripWord, setNewStripWord]   = useState('')
  const [stripApplying, setStripApplying] = useState(false)
  const [allGenres, setAllGenres]     = useState([])
  const [genresLoading, setGenresLoading] = useState(false)

  // STBEmu export — the user picks ANY profile to export (connected or not).
  // Model/firmware/device come from the chosen profile.
  const [exportProfileId, setExportProfileId] = useState('')
  const [stbEmuExporting, setStbEmuExporting] = useState(false)
  const [stbEmuNotice, setStbEmuNotice]   = useState(null)

  // ── Startup: load status + saved config + logos ───────────────────────────
  useEffect(() => {
    Promise.all([
      getConfig().catch(() => null),
      getSettings().catch(() => null),
      getLogos().catch(() => ({ overrides: {}, stats: null })),
      getStatus().catch(() => ({})),
      getLogoStripWords().catch(() => ({ stripWords: [] })),
    ]).then(([cfg, s, logos, status, sw]) => {
      if (sw?.stripWords) setStripWords(sw.stripWords)
      // Track which portal is currently connected
      if (status?.connected && status?.portal && status?.mac) {
        setConnectedPortal({ portal: status.portal, mac: status.mac })
      }

      // Import backend-saved config as a profile if it doesn't exist yet.
      // Seed the imported profile's genre filters from the backend's old
      // global disabled_genres list (one-time migration to per-profile).
      if (cfg?.portal && cfg?.mac) {
        const existing = loadProfiles()
        const match    = existing.find(p => p.portal === cfg.portal && p.mac === cfg.mac)
        if (!match) {
          const imported = {
            ...DEFAULT_FORM, ...cfg, id: uid(), name: '',
            disabledGenres: Array.isArray(s?.disabled_genres) ? s.disabled_genres : [],
          }
          const updated  = [imported, ...existing]
          saveProfiles(updated)
          setProfiles(updated)
          // If this imported profile is the one currently connected, mark active
          if (status?.connected && status?.portal === cfg.portal && status?.mac === cfg.mac) {
            setActiveProfileId(imported.id)
          }
        } else if (status?.connected && status?.portal === cfg.portal && status?.mac === cfg.mac && !getActiveProfileId()) {
          setActiveProfileId(match.id)
        }
      }

      if (s) {
        setEpg(s.epg_enabled !== false)
      }
      if (logos) { setLogoOverrides(logos.overrides || {}); setLogoStats(logos.stats || null) }
      if (status?.device) setDeviceProfile(status.device)
    }).finally(() => setInitLoading(false))
  }, [])

  useEffect(() => {
    if (!connected) return
    setGenresLoading(true)
    getGroups()
      .then(r => setAllGenres((r.groups ?? []).filter(g => g.name?.toLowerCase() !== 'all')))
      .catch(() => {})
      .finally(() => setGenresLoading(false))
  }, [connected])

  useEffect(() => {
    if (!connected) return
    Promise.all([getChannels(), getLogoMap()]).then(([chRes, logoMap]) => {
      const channels   = chRes.channels ?? []
      const unmatched  = channels.filter(ch => !logoMap[String(ch.uniqueId)]).map(ch => ({ name: ch.name, number: ch.number })).filter(ch => ch.name).sort((a, b) => a.number - b.number)
      setUnmatchedChannels(unmatched)
    }).catch(() => {})
  }, [connected])

  useEffect(() => {
    if (!logoSearchOpen) return
    const handleClickOutside = e => {
      if (logoSearchRef.current && !logoSearchRef.current.contains(e.target)) setLogoSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [logoSearchOpen])

  // ── Profile CRUD ─────────────────────────────────────────────────────────
  function handleSaveProfile(form) {
    const isNew = !form.id
    const prof  = isNew ? { ...form, id: uid() } : form

    setProfiles(prev => {
      const updated = isNew
        ? [prof, ...prev]
        : prev.map(p => p.id === prof.id ? prof : p)
      saveProfiles(updated)
      return updated
    })
    setSheet(null)
    setNotice({ type: 'success', msg: isNew ? 'Profile added.' : 'Profile updated.' })
    setTimeout(() => setNotice(null), 2500)
  }

  function handleDeleteProfile(id) {
    setProfiles(prev => { const u = prev.filter(p => p.id !== id); saveProfiles(u); return u })
  }

  async function handleConnect(profile) {
    setConnecting(profile.id)
    setNotice(null)
    try {
      await connect(profile)
      setConnected(true)
      setConnectedPortal({ portal: profile.portal, mac: profile.mac })

      // Discard any channel list cached from a previously connected portal,
      // so ChannelsPage re-fetches this portal's channels instead of
      // serving a stale snapshot.
      invalidateChannelCache()

      // Mark this profile active and load ITS genre filters into the app
      // context so ChannelsPage / PlayerPage filter by the right list.
      setActiveProfileId(profile.id)
      setDisabledGenres(new Set(
        Array.isArray(profile.disabledGenres) ? profile.disabledGenres : []
      ))

      setNotice({ type: 'success', msg: `Connected to ${profile.name || profile.portal}` })
      setTimeout(() => navigate('/channels'), 900)
    } catch (err) {
      setNotice({ type: 'error', msg: err.message })
    } finally {
      setConnecting(null)
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect()
      setConnected(false)
      setConnectedPortal(null)
      setActiveProfileId(null)
      setLastPingAt(null)
      setIdleInfo(null)
      setNotice({ type: 'success', msg: 'Disconnected.' })
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setNotice({ type: 'error', msg: err.message })
    }
  }

  function isConnectedProfile(p) {
    return connected && connectedPortal &&
      p.portal === connectedPortal.portal && p.mac === connectedPortal.mac
  }

  // ── Strip word handlers ───────────────────────────────────────────────────
  // After any strip-word change, re-fetch logo stats (to show the updated
  // matched-channel count) and invalidate the channel cache so ChannelsPage
  // and PlayerPage pick up the new logo map on their next render.
  async function _applyStripChange(apiCall) {
    setStripApplying(true)
    setLogoNotice(null)
    try {
      const r = await apiCall()
      setStripWords(r.stripWords)

      // Re-fetch logo stats — getLogo() applies strip words dynamically,
      // so a fresh /api/logos call gives the updated matched-channel count
      // without needing to re-download the iptv-org database.
      const logos = await getLogos()
      if (logos.stats) setLogoStats(logos.stats)

      // Invalidate channel cache so logo map refreshes on next page visit
      invalidateChannelCache()

      const matched = logos.stats?.matched_channels ?? '?'
      const total   = logos.stats?.total_channels   ?? '?'
      setLogoNotice({ type: 'success', msg: `Applied — ${matched} of ${total} channels now matched. Logo map will refresh on next visit.` })
    } catch (err) {
      setLogoNotice({ type: 'error', msg: err.message })
    } finally {
      setStripApplying(false)
    }
  }

  async function handleAddStripWord(e) {
    e.preventDefault()
    const w = newStripWord.trim()
    if (!w) return
    setNewStripWord('')
    await _applyStripChange(() => addLogoStripWord(w))
  }

  async function handleDeleteStripWord(word) {
    await _applyStripChange(() => deleteLogoStripWord(word))
  }

  // ── Other handlers ────────────────────────────────────────────────────────
  async function handleLogoRefresh() {
    setLogoRefreshing(true); setLogoNotice(null)
    try {
      const { stats } = await refreshLogosDb()
      setLogoStats(stats)
      setLogoNotice({ type: 'success', msg: `Database refreshed — ${stats.db_size.toLocaleString()} channels indexed.` })
    } catch (err) { setLogoNotice({ type: 'error', msg: err.message }) }
    finally { setLogoRefreshing(false) }
  }

  async function handleAddOverride(e) {
    e.preventDefault()
    if (!newLogoName.trim() || !newLogoUrl.trim()) return
    try {
      await addLogoOverride(newLogoName.trim(), newLogoUrl.trim())
      setLogoOverrides(prev => ({ ...prev, [newLogoName.trim()]: newLogoUrl.trim() }))
      setNewLogoName(''); setNewLogoUrl(''); setLogoSearchQuery(''); setLogoSearchOpen(false)
    } catch (err) { setLogoNotice({ type: 'error', msg: err.message }) }
  }

  async function handleDeleteOverride(name) {
    try {
      await deleteLogoOverride(name)
      setLogoOverrides(prev => { const n = { ...prev }; delete n[name]; return n })
    } catch (err) { setLogoNotice({ type: 'error', msg: err.message }) }
  }

  async function handleEpgToggle(val) {
    setEpg(val); setEpgEnabled(val)
    try { await saveSettings({ epg_enabled: val }) } catch { /* non-critical */ }
  }
  async function handleAdultToggle(val) {
    setShowAdult(val)
    try { await saveSettings({ show_adult: val }) } catch { /* non-critical */ }
  }
  // Genre filters are stored per-profile in localStorage. Persist to the
  // active profile and update the app context; the channel cache is
  // invalidated so the channel/player pages re-filter on next visit.
  function persistGenres(set) {
    setDisabledGenres(set)
    const activeId = getActiveProfileId()
    if (activeId) {
      const updated = setProfileGenres(activeId, [...set])
      setProfiles(updated)
    }
    invalidateChannelCache()
  }
  function handleToggleGenre(genreName) {
    const next = new Set(disabledGenres)
    next.has(genreName) ? next.delete(genreName) : next.add(genreName)
    persistGenres(next)
  }
  function handleEnableAllGenres() {
    persistGenres(new Set())
  }
  function handleDisableAllGenres() {
    persistGenres(new Set(allGenres.map(g => g.name)))
  }
  async function handleStbEmuExport() {
    setStbEmuExporting(true); setStbEmuNotice(null)
    try {
      // If a profile is selected, export that profile; otherwise export the
      // currently-connected/saved config (GET fallback).
      const prof = exportProfileId ? profiles.find(p => p.id === exportProfileId) : null
      await downloadStbEmuBackup(prof || undefined)
    } catch (err) { setStbEmuNotice({ type: 'error', msg: err.message }) }
    finally { setStbEmuExporting(false) }
  }

  if (initLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <>
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">Profiles</h1>
            <p className="text-sm text-[var(--color-muted)] mt-1">Manage your portal connections.</p>
          </div>
          {connected && (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-live)] transition-colors border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-1.5 hover:border-[var(--color-live)]/40 mt-1"
            >
              <WifiOff size={13} />
              Disconnect
            </button>
          )}
        </div>

        <Notice notice={notice} />

        {/* ── Profile list ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {profiles.length === 0 && (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
              <p className="text-sm text-[var(--color-muted)]">No profiles yet.</p>
              <p className="text-xs text-[var(--color-muted)] mt-1">Add a profile to connect to a Stalker portal.</p>
            </div>
          )}

          {profiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              isConnected={isConnectedProfile(p)}
              onConnect={handleConnect}
              onEdit={prof => setSheet(prof)}
              onDelete={handleDeleteProfile}
              connecting={connecting}
            />
          ))}

          <button
            onClick={() => setSheet({})}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5 transition-colors"
          >
            <Plus size={15} />
            Add Profile
          </button>
        </div>

        {/* ── IPTV Links (M3U / XMLTV) ─────────────────────────────────────── */}
        {(() => {
          const origin = (typeof window !== 'undefined' && window.location?.origin) || ''
          return (
            <Card title="IPTV Links" description="Add StalkerWeb to Jellyfin, Plex, Emby, Dispatcharr, or any IPTV client using these URLs.">
              <LinkRow
                label="M3U Playlist"
                icon={ListVideo}
                url={`${origin}/api/m3u`}
                hint="Channel list — add as an M3U / playlist URL in your IPTV client or tuner."
              />
              <LinkRow
                label="XMLTV EPG Guide"
                icon={CalendarDays}
                url={`${origin}/api/xmltv`}
                hint={epg
                  ? 'Program guide in XMLTV format — add as the EPG / guide URL alongside the M3U.'
                  : 'Program guide in XMLTV format. Enable EPG below for this to return data.'}
              />
              {!connected && (
                <p className="text-xs text-[var(--color-muted)]">
                  Connect to a portal above so clients can pull live channel and guide data from these links.
                </p>
              )}
            </Card>
          )
        })()}

        {/* ── App Preferences ─────────────────────────────────────────────── */}
        <Card title="App Preferences" description="Customize how StalkerWeb behaves.">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">EPG / Program Guide</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Disable if your portal does not support EPG data.</p>
            </div>
            <Switch checked={epg} onCheckedChange={handleEpgToggle} />
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">Show Adult Content</p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">Parental lock for categories like &quot;FOR ADULTS&quot;.</p>
            </div>
            <Switch checked={showAdult} onCheckedChange={handleAdultToggle} />
          </div>
        </Card>

        {/* ── Genre Filters ────────────────────────────────────────────────── */}
        <Card title="Genre Filters" description="Choose which genres appear in your channel browser. These filters are saved per-profile — each portal connection keeps its own list.">
          {!connected ? (
            <p className="text-sm text-[var(--color-muted)]">Connect to a portal to manage genre filters.</p>
          ) : genresLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <Loader2 size={14} className="animate-spin" /> Loading genres…
            </div>
          ) : allGenres.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No genres found on this portal.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleEnableAllGenres} className="px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors">Enable all</button>
                <button type="button" onClick={handleDisableAllGenres} className="px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors">Disable all</button>
                <span className="text-xs text-[var(--color-muted)] ml-1">{allGenres.length - disabledGenres.size} of {allGenres.length} enabled</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {allGenres.map(g => {
                  const disabled = disabledGenres.has(g.name)
                  return (
                    <button key={g.id} type="button" onClick={() => handleToggleGenre(g.name)}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                        disabled
                          ? 'bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)] opacity-50 line-through'
                          : 'bg-[var(--color-primary)]/15 text-[var(--color-primary-light)] border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/25'
                      )}>
                      {g.name}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </Card>

        {/* ── STBEmu Export ────────────────────────────────────────────────── */}
        <Card title="STBEmu Export" description="Generate an STBEmu-compatible backup file you can restore directly in the app. Pick which profile to export — the STB model, firmware, and profile name come from that profile.">
          <div className="flex flex-col gap-4">
            {stbEmuNotice && (
              <div className={cn('flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs',
                stbEmuNotice.type === 'success'
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25'
                  : 'bg-[var(--color-live)]/10 text-[var(--color-live)] border border-[var(--color-live)]/25'
              )}>
                {stbEmuNotice.type === 'success' ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
                {stbEmuNotice.msg}
              </div>
            )}
            <Field label="Profile to Export" id="stb-export-profile" hint="Select which profile to export. The name, STB model, firmware, and connection details come from the chosen profile.">
              <select id="stb-export-profile" value={exportProfileId}
                onChange={e => setExportProfileId(e.target.value)}
                className="flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)]">
                <option value="">Current / Connected Config</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.portal}{p.stb_model ? ` (${p.stb_model})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-center gap-3 pt-1">
              <Button type="button" onClick={handleStbEmuExport} disabled={stbEmuExporting} className="h-9 px-4 text-sm gap-2">
                {stbEmuExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download Backup
              </Button>
            </div>
          </div>
        </Card>

        {/* ── Logo Strip Words ─────────────────────────────────────────────── */}
        <Card title="Logo Strip Words" description="Words removed from channel names before logo matching. Useful when your portal adds country or quality suffixes — e.g. add 'CANADA' so 'BBC CANADA' matches the 'BBC' logo.">

          {/* Feedback notice shared with logo overrides section */}
          {logoNotice && (
            <div className={cn('flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs',
              logoNotice.type === 'success'
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25'
                : 'bg-[var(--color-live)]/10 text-[var(--color-live)] border border-[var(--color-live)]/25'
            )}>
              {logoNotice.type === 'success' ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
              {logoNotice.msg}
            </div>
          )}

          {/* Current strip words as dismissible pill chips */}
          {stripWords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {stripWords.map(w => (
                <span key={w} className="flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] pl-3 pr-1.5 py-1 text-xs text-[var(--color-text)]">
                  {w}
                  <button type="button" onClick={() => handleDeleteStripWord(w)} disabled={stripApplying}
                    className="text-[var(--color-muted)] hover:text-[var(--color-live)] transition-colors ml-0.5 disabled:opacity-40" title="Remove">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {stripWords.length === 0 && !stripApplying && (
            <p className="text-xs text-[var(--color-muted)]">No strip words configured yet.</p>
          )}

          <form onSubmit={handleAddStripWord} className="flex gap-2">
            <Input placeholder="e.g. CANADA, USA, FHD…" value={newStripWord}
              onChange={e => setNewStripWord(e.target.value)} className="text-xs flex-1"
              disabled={stripApplying} />
            <Button type="submit" disabled={!newStripWord.trim() || stripApplying} className="shrink-0 h-9 px-4 text-xs gap-1.5">
              {stripApplying ? <Loader2 size={12} className="animate-spin" /> : null}
              Add
            </Button>
          </form>
          <p className="text-xs text-[var(--color-muted)]">
            Whole-word, case-insensitive. After adding a word the logo match count updates automatically
            and all channel pages refresh their logos on the next visit.
          </p>
        </Card>

        {/* ── Channel Logos ─────────────────────────────────────────────────── */}
        <Card title="Channel Logos" description="Logos come from your Stalker portal by default. Optionally fetch the iptv-org database to fill in logos for channels the portal doesn't provide, and add manual overrides per channel.">
          {logoNotice && (
            <div className={cn('flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs',
              logoNotice.type === 'success'
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25'
                : 'bg-[var(--color-live)]/10 text-[var(--color-live)] border border-[var(--color-live)]/25'
            )}>
              {logoNotice.type === 'success' ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
              {logoNotice.msg}
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <Image size={15} className="text-[var(--color-muted)] shrink-0" />
                <span className="text-xs text-[var(--color-muted)] truncate">
                  {logoStats ? logoStats.db_size > 0 ? `iptv-org: ${logoStats.db_size.toLocaleString()} entries` : 'iptv-org database not loaded — click Refresh DB' : 'Loading…'}
                  {logoStats?.db_cached_at ? ` · updated ${new Date(logoStats.db_cached_at).toLocaleDateString()}` : ''}
                </span>
              </div>
              {logoStats?.total_channels > 0 && (
                <span className={cn('text-xs ml-5', logoStats.matched_channels > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-live)]')}>
                  {logoStats.matched_channels} of {logoStats.total_channels} channels matched by iptv-org/overrides
                </span>
              )}
            </div>
            <Button type="button" variant="outline" onClick={handleLogoRefresh} disabled={logoRefreshing} className="shrink-0 h-8 px-3 text-xs gap-1.5">
              <RefreshCw size={12} className={logoRefreshing ? 'animate-spin' : ''} />
              {logoRefreshing ? 'Refreshing…' : 'Refresh DB'}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">Test Channel Name</p>
            <div className="flex gap-2">
              <Input placeholder="e.g. BBC ONE HD" value={testName}
                onChange={e => { setTestName(e.target.value); setTestResult(null) }} className="text-xs" />
              <Button type="button" variant="outline" disabled={!testName.trim()}
                onClick={async () => setTestResult(await checkLogoName(testName.trim()))}
                className="shrink-0 h-9 px-3 text-xs">Test</Button>
            </div>
            {testResult && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs flex flex-col gap-1">
                <span className="text-[var(--color-muted)]">Normalized: <span className="font-mono text-[var(--color-text)]">{testResult.normalized}</span></span>
                {testResult.logo
                  ? <button type="button" onClick={() => setNewLogoUrl(testResult.logo)}
                      className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity group" title="Click to use in Add Override">
                      <img src={getProxiedLogoUrl(testResult.logo)} alt="" className="h-8 w-8 object-contain rounded shrink-0" onError={e => e.currentTarget.style.display='none'} />
                      <span className="text-[var(--color-success)] truncate group-hover:underline">{testResult.logo}</span>
                    </button>
                  : <span className={testResult.db_loaded ? 'text-[var(--color-live)]' : 'text-[var(--color-muted)]'}>
                      {testResult.db_loaded ? 'No match found in database' : 'Database not loaded yet'}
                    </span>
                }
              </div>
            )}
          </div>
          {Object.keys(logoOverrides).length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">Manual Overrides</p>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {Object.entries(logoOverrides).map(([name, url]) => (
                  <div key={name} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5">
                    {url && <img src={getProxiedLogoUrl(url)} alt="" className="w-6 h-6 object-contain shrink-0 rounded" onError={e => { e.currentTarget.style.display='none' }} />}
                    <span className="text-xs font-medium text-[var(--color-text)] flex-1 truncate">{name}</span>
                    <span className="text-xs text-[var(--color-muted)] flex-1 truncate hidden sm:block">{url}</span>
                    <button type="button" onClick={() => handleDeleteOverride(name)} className="text-[var(--color-muted)] hover:text-[var(--color-live)] transition-colors shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={handleAddOverride} className="flex flex-col gap-2">
            <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">Add Override</p>
            <div className="flex gap-2">
              <div ref={logoSearchRef} className="relative flex-1">
                <Input
                  placeholder="Channel name or number"
                  value={newLogoName}
                  onChange={e => { setNewLogoName(e.target.value); setLogoSearchQuery(e.target.value); setLogoSearchOpen(true) }}
                  onFocus={() => { setLogoSearchQuery(newLogoName); setLogoSearchOpen(true) }}
                  className="text-xs"
                />
                {logoSearchOpen && logoSearchQuery.trim() && (() => {
                  const q = logoSearchQuery.toLowerCase()
                  const matches = unmatchedChannels.filter(ch =>
                    ch.name.toLowerCase().includes(q) ||
                    String(ch.number).includes(q)
                  ).slice(0, 20)
                  if (!matches.length) return null
                  return (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {matches.map(ch => (
                        <button key={ch.name} type="button"
                          onClick={() => { setNewLogoName(ch.name); setLogoSearchOpen(false) }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-hover)] flex items-center gap-2"
                        >
                          <span className="text-[var(--color-muted)] shrink-0 w-10 text-right">Ch {ch.number}</span>
                          <span className="truncate">{ch.name}</span>
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <Input placeholder="Logo URL" value={newLogoUrl} onChange={e => setNewLogoUrl(e.target.value)} className="text-xs flex-[2]" />
              <Button type="submit" disabled={!newLogoName.trim() || !newLogoUrl.trim()} className="shrink-0 h-9 px-4 text-xs">Add</Button>
            </div>
          </form>
        </Card>

        {/* ── Device Profile ───────────────────────────────────────────────── */}
        {deviceProfile && (
          <Card title="Device Profile" description="STB identity sent to the Stalker portal on every request.">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                ['STB Model', deviceProfile.stb_type], ['HW Version', deviceProfile.hw_version],
                ['Image Version', deviceProfile.image_version], ['Firmware', deviceProfile.image_description],
                ['Portal API', deviceProfile.portal_version], ['JS API Version', deviceProfile.js_api_version],
                ['STB API Version', deviceProfile.stb_api_version], ['Player Engine', deviceProfile.player_engine_version],
              ].map(([label, value]) => value && (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-xs text-[var(--color-muted)]">{label}</span>
                  <span className="text-xs font-mono text-[var(--color-text)]">{value}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-0.5 pt-1 border-t border-[var(--color-border)]">
              <span className="text-xs text-[var(--color-muted)]">User-Agent</span>
              <span className="text-xs font-mono text-[var(--color-text)] break-all">{deviceProfile.user_agent}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-[var(--color-muted)]">X-User-Agent</span>
              <span className="text-xs font-mono text-[var(--color-text)]">{deviceProfile.x_user_agent}</span>
            </div>
          </Card>
        )}
      </div>

      {/* ── Profile sheet (add / edit) ───────────────────────────────────── */}
      {sheet !== null && (
        <ProfileSheet
          initial={sheet}
          onSave={handleSaveProfile}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
