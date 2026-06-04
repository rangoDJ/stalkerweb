import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle,
  Trash2, RefreshCw, Image, Download, Plus, Pencil, Plug, PlugZap,
  X, Wifi, WifiOff,
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
} from '../stalkerApi'
import { useApp } from '@/lib/appContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function checkLogoName(name) {
  const r = await fetch(`/api/logos/check?name=${encodeURIComponent(name)}`)
  return r.ok ? r.json() : null
}

function uid() { return `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

const PROFILES_KEY = 'stalkerweb_profiles'

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]') } catch { return [] }
}
function saveProfiles(arr) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(arr))
}

const DEFAULT_FORM = {
  name: '',
  portal: '', mac: '', timezone: 'Europe/London', lang: 'en',
  login: '', password: '', token: '', serial_number: '0000000000000',
  device_id: '', device_id2: '', signature: '', portal_signature: '',
  connection_timeout: 10,
}

function normalizePortal(url) {
  return String(url).trim().replace(/\/c\/?$/, '').replace(/\/?$/, '') + '/c/'
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
    <div className={cn('rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 flex flex-col gap-5', className)}>
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
      <div className="relative z-10 w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">

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
              <Field label="Token" id="prof-token">
                <Input id="prof-token" value={form.token || ''} onChange={set('token')} className="font-mono text-xs" />
              </Field>
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
  const [allGenres, setAllGenres]     = useState([])
  const [genresLoading, setGenresLoading] = useState(false)

  const STB_MODELS    = ['MAG200', 'MAG250', 'MAG254', 'MAG256', 'MAG270', 'MAG322', 'MAG352', 'CUSTOM']
  const STB_FIRMWARES = ['0.2.18-r14-pub-250', '0.2.18-r19-pub-250', 'Generic']
  const [stbEmu, setStbEmu]           = useState({ stbemu_profile_name: '', stbemu_stb_model: 'MAG250', stbemu_custom_firmware: '', stbemu_firmware: '0.2.18-r14-pub-250' })
  const [stbEmuSaving, setStbEmuSaving]   = useState(false)
  const [stbEmuExporting, setStbEmuExporting] = useState(false)
  const [stbEmuNotice, setStbEmuNotice]   = useState(null)

  // ── Startup: load status + saved config + logos ───────────────────────────
  useEffect(() => {
    Promise.all([
      getConfig().catch(() => null),
      getSettings().catch(() => null),
      getLogos().catch(() => ({ overrides: {}, stats: null })),
      getStatus().catch(() => ({})),
    ]).then(([cfg, s, logos, status]) => {
      // Track which portal is currently connected
      if (status?.connected && status?.portal && status?.mac) {
        setConnectedPortal({ portal: status.portal, mac: status.mac })
      }

      // Import backend-saved config as a profile if it doesn't exist yet
      if (cfg?.portal && cfg?.mac) {
        const existing = loadProfiles()
        const already  = existing.some(p => p.portal === cfg.portal && p.mac === cfg.mac)
        if (!already) {
          const imported = { ...DEFAULT_FORM, ...cfg, id: uid(), name: '' }
          const updated  = [imported, ...existing]
          saveProfiles(updated)
          setProfiles(updated)
        }
      }

      if (s) {
        setEpg(s.epg_enabled !== false)
        setStbEmu({
          stbemu_profile_name:    s.stbemu_profile_name    || '',
          stbemu_stb_model:       s.stbemu_stb_model       || 'MAG250',
          stbemu_custom_firmware: s.stbemu_custom_firmware || '',
          stbemu_firmware:        s.stbemu_firmware        || '0.2.18-r14-pub-250',
        })
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
      const unmatched  = channels.filter(ch => !logoMap[String(ch.uniqueId)]).map(ch => ch.name).filter(Boolean).sort((a, b) => a.localeCompare(b))
      setUnmatchedChannels(unmatched)
    }).catch(() => {})
  }, [connected])

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
      setNewLogoName(''); setNewLogoUrl('')
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
  async function handleToggleGenre(genreName) {
    const next = new Set(disabledGenres)
    next.has(genreName) ? next.delete(genreName) : next.add(genreName)
    setDisabledGenres(next)
    try { await saveSettings({ disabled_genres: [...next] }) } catch { /* non-critical */ }
  }
  async function handleEnableAllGenres() {
    setDisabledGenres(new Set())
    try { await saveSettings({ disabled_genres: [] }) } catch { /* non-critical */ }
  }
  async function handleDisableAllGenres() {
    const all = new Set(allGenres.map(g => g.name))
    setDisabledGenres(all)
    try { await saveSettings({ disabled_genres: [...all] }) } catch { /* non-critical */ }
  }
  async function handleStbEmuSave(e) {
    e.preventDefault(); setStbEmuSaving(true); setStbEmuNotice(null)
    try { await saveSettings(stbEmu); setStbEmuNotice({ type: 'success', msg: 'Settings saved.' }) }
    catch (err) { setStbEmuNotice({ type: 'error', msg: err.message }) }
    finally { setStbEmuSaving(false) }
  }
  async function handleStbEmuExport() {
    setStbEmuExporting(true); setStbEmuNotice(null)
    try { await downloadStbEmuBackup() }
    catch (err) { setStbEmuNotice({ type: 'error', msg: err.message }) }
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
        <Card title="Genre Filters" description="Choose which genres appear in your channel browser. Disabled genres are hidden everywhere.">
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
        <Card title="STBEmu Export" description="Generate an STBEmu-compatible backup file you can restore directly in the app.">
          <form onSubmit={handleStbEmuSave} className="flex flex-col gap-4">
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
            <Field label="Profile Name" id="stb-prof-name">
              <Input id="stb-prof-name" placeholder="My IPTV Profile" value={stbEmu.stbemu_profile_name}
                onChange={e => setStbEmu(s => ({ ...s, stbemu_profile_name: e.target.value }))} />
            </Field>
            <Field label="STB Model" id="stb-model">
              <select id="stb-model" value={stbEmu.stbemu_stb_model}
                onChange={e => setStbEmu(s => ({ ...s, stbemu_stb_model: e.target.value }))}
                className="flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)]">
                {STB_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Firmware" id="stb-fw">
              <select id="stb-fw" value={stbEmu.stbemu_firmware}
                onChange={e => setStbEmu(s => ({ ...s, stbemu_firmware: e.target.value }))}
                className="flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)]">
                {STB_FIRMWARES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            {stbEmu.stbemu_stb_model === 'CUSTOM' && (
              <Field label="Custom Firmware String" id="stb-custom-fw" hint="e.g. mag-custom-2.20.02-pub-000">
                <Input id="stb-custom-fw" placeholder="mag-xxx-2.20.02-pub-xxx" value={stbEmu.stbemu_custom_firmware}
                  onChange={e => setStbEmu(s => ({ ...s, stbemu_custom_firmware: e.target.value }))} className="font-mono text-xs" />
              </Field>
            )}
            {stbEmu.stbemu_stb_model !== 'CUSTOM' && (
              <p className="text-xs text-[var(--color-muted)]">
                Firmware: <span className="font-mono">{(() => { const slug = stbEmu.stbemu_stb_model.toLowerCase().replace(/^mag(\d+)$/, 'mag-$1'); const num = stbEmu.stbemu_stb_model.replace(/^MAG/, ''); return `${slug}-2.20.02-pub-${num}` })()}</span>
              </p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" variant="outline" disabled={stbEmuSaving} className="h-9 px-4 text-sm">
                {stbEmuSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
              </Button>
              <Button type="button" onClick={handleStbEmuExport} disabled={stbEmuExporting} className="h-9 px-4 text-sm gap-2">
                {stbEmuExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Download Backup
              </Button>
            </div>
          </form>
        </Card>

        {/* ── Channel Logos ─────────────────────────────────────────────────── */}
        <Card title="Channel Logos" description="Logos are matched automatically from the iptv-org database. Add manual overrides for channels that don't match.">
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
                  {logoStats.matched_channels} of {logoStats.total_channels} channels matched
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
              <datalist id="unmatched-channels">
                {unmatchedChannels.map(name => <option key={name} value={name} />)}
              </datalist>
              <Input list="unmatched-channels" placeholder="Channel name" value={newLogoName} onChange={e => setNewLogoName(e.target.value)} className="text-xs flex-1" />
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
