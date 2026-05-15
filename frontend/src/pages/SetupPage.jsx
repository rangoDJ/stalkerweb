import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Trash2, RefreshCw, Image, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { connect, disconnect, getConfig, getStatus, getSettings, saveSettings, saveConfig, getLogos, addLogoOverride, deleteLogoOverride, refreshLogosDb, downloadStbEmuBackup, getChannels, getLogoMap } from '../stalkerApi'

async function checkLogoName(name) {
  const r = await fetch(`/api/logos/check?name=${encodeURIComponent(name)}`)
  return r.ok ? r.json() : null
}
import { useApp } from '../App'

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

export default function SetupPage() {
  const navigate = useNavigate()
  const { connected, setConnected, epgEnabled, setEpgEnabled, showAdult, setShowAdult, setLastPingAt, setIdleInfo } = useApp()

  const [form, setForm] = useState({
    portal: '', mac: '', timezone: 'Europe/London', lang: 'en',
    login: '', password: '', token: '', serial_number: '0000000000000',
    device_id: '', device_id2: '', signature: '', portal_signature: '',
    connection_timeout: 10,
  })
  const [epg, setEpg] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState(null) // { type: 'success'|'error', msg }

  // Logos state
  const [logoStats, setLogoStats] = useState(null)
  const [logoOverrides, setLogoOverrides] = useState({})
  const [logoRefreshing, setLogoRefreshing] = useState(false)
  const [newLogoName, setNewLogoName] = useState('')
  const [newLogoUrl, setNewLogoUrl] = useState('')
  const [logoNotice, setLogoNotice] = useState(null)
  const [testName, setTestName] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [deviceProfile, setDeviceProfile] = useState(null)
  const [unmatchedChannels, setUnmatchedChannels] = useState([])

  // STBEmu export settings
  const STB_MODELS    = ['MAG200', 'MAG250', 'MAG254', 'MAG256', 'MAG270', 'MAG322', 'MAG352', 'CUSTOM']
  const STB_FIRMWARES = ['0.2.18-r14-pub-250', '0.2.18-r19-pub-250', 'Generic']
  const [stbEmu, setStbEmu] = useState({
    stbemu_profile_name: '',
    stbemu_stb_model: 'MAG250',
    stbemu_custom_firmware: '',
    stbemu_firmware: '0.2.18-r14-pub-250',
  })
  const [stbEmuSaving, setStbEmuSaving]     = useState(false)
  const [stbEmuExporting, setStbEmuExporting] = useState(false)
  const [stbEmuNotice, setStbEmuNotice]     = useState(null)

  useEffect(() => {
    getConfig().then(cfg => {
      if (!cfg) return
      setForm(f => ({ ...f, ...cfg }))
    }).catch(() => {})
    getSettings().then(s => {
      setEpg(s.epg_enabled !== false)
      setStbEmu({
        stbemu_profile_name:    s.stbemu_profile_name    || '',
        stbemu_stb_model:       s.stbemu_stb_model       || 'MAG250',
        stbemu_custom_firmware: s.stbemu_custom_firmware || '',
        stbemu_firmware:        s.stbemu_firmware        || '0.2.18-r14-pub-250',
      })
    }).catch(() => {})
    getLogos().then(({ overrides, stats }) => {
      setLogoOverrides(overrides || {})
      setLogoStats(stats || null)
    }).catch(() => {})
    getStatus().then(s => { if (s.device) setDeviceProfile(s.device) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!connected) return
    Promise.all([getChannels(), getLogoMap()]).then(([chRes, logoMap]) => {
      const channels = chRes.channels ?? []
      const unmatched = channels
        .filter(ch => !logoMap[String(ch.uniqueId)])
        .map(ch => ch.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      setUnmatchedChannels(unmatched)
    }).catch(() => {})
  }, [connected])

  function set(k) {
    return (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleConnect(e) {
    e.preventDefault()
    setLoading(true)
    setNotice(null)
    try {
      await connect(form)
      setConnected(true)
      setNotice({ type: 'success', msg: 'Connected successfully.' })
      setTimeout(() => navigate('/channels'), 900)
    } catch (err) {
      setNotice({ type: 'error', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveConfig(e) {
    e.preventDefault()
    setLoading(true)
    setNotice(null)
    try {
      await saveConfig(form)
      setNotice({ type: 'success', msg: 'Settings saved.' })
    } catch (err) {
      setNotice({ type: 'error', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    setLoading(true)
    try {
      await disconnect()
      setConnected(false)
      setLastPingAt(null)
      setIdleInfo(null)
      setNotice({ type: 'success', msg: 'Disconnected.' })
      setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setNotice({ type: 'error', msg: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function handleLogoRefresh() {
    setLogoRefreshing(true)
    setLogoNotice(null)
    try {
      const { stats } = await refreshLogosDb()
      setLogoStats(stats)
      setLogoNotice({ type: 'success', msg: `Database refreshed — ${stats.db_size.toLocaleString()} channels indexed.` })
    } catch (err) {
      setLogoNotice({ type: 'error', msg: err.message })
    } finally {
      setLogoRefreshing(false)
    }
  }

  async function handleAddOverride(e) {
    e.preventDefault()
    if (!newLogoName.trim() || !newLogoUrl.trim()) return
    try {
      await addLogoOverride(newLogoName.trim(), newLogoUrl.trim())
      setLogoOverrides(prev => ({ ...prev, [newLogoName.trim()]: newLogoUrl.trim() }))
      setNewLogoName('')
      setNewLogoUrl('')
    } catch (err) {
      setLogoNotice({ type: 'error', msg: err.message })
    }
  }

  async function handleDeleteOverride(name) {
    try {
      await deleteLogoOverride(name)
      setLogoOverrides(prev => { const n = { ...prev }; delete n[name]; return n })
    } catch (err) {
      setLogoNotice({ type: 'error', msg: err.message })
    }
  }

  async function handleEpgToggle(val) {
    setEpg(val)
    setEpgEnabled(val)
    try {
      await saveSettings({ epg_enabled: val })
    } catch {
      // non-critical
    }
  }
  async function handleAdultToggle(val) {
    setShowAdult(val)
    try {
      await saveSettings({ show_adult: val })
    } catch {
      // non-critical
    }
  }

  async function handleStbEmuSave(e) {
    e.preventDefault()
    setStbEmuSaving(true)
    setStbEmuNotice(null)
    try {
      await saveSettings(stbEmu)
      setStbEmuNotice({ type: 'success', msg: 'Settings saved.' })
    } catch (err) {
      setStbEmuNotice({ type: 'error', msg: err.message })
    } finally {
      setStbEmuSaving(false)
    }
  }

  async function handleStbEmuExport() {
    setStbEmuExporting(true)
    setStbEmuNotice(null)
    try {
      await downloadStbEmuBackup()
    } catch (err) {
      setStbEmuNotice({ type: 'error', msg: err.message })
    } finally {
      setStbEmuExporting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Configure your portal connection and app preferences.</p>
      </div>

      {/* Notice banner */}
      {notice && (
        <div className={cn(
          'flex items-center gap-2 rounded-[var(--radius-sm)] px-4 py-3 text-sm',
          notice.type === 'success'
            ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25'
            : 'bg-[var(--color-live)]/10 text-[var(--color-live)] border border-[var(--color-live)]/25'
        )}>
          {notice.type === 'success'
            ? <CheckCircle2 size={16} className="shrink-0" />
            : <XCircle size={16} className="shrink-0" />}
          {notice.msg}
        </div>
      )}

      {/* Portal connection card */}
      <Card title="Portal Connection" description="Enter your Stalker Middleware portal details.">
        <form onSubmit={handleConnect} className="flex flex-col gap-4">
          <Field label="Portal URL" id="portal">
            <Input
              id="portal" type="url" placeholder="http://my.portal.com"
              value={form.portal} onChange={set('portal')}
              onBlur={() => {
                if (!form.portal.trim()) return
                const normalized = form.portal.trim().replace(/\/c\/?$/, '').replace(/\/?$/, '') + '/c/'
                setForm(f => ({ ...f, portal: normalized }))
              }}
              required
            />
          </Field>
          <Field label="MAC Address" id="mac">
            <Input
              id="mac" type="text" placeholder="00:1A:79:XX:XX:XX"
              value={form.mac} onChange={set('mac')} required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timezone" id="timezone">
              <Input id="timezone" value={form.timezone} onChange={set('timezone')} />
            </Field>
            <Field label="Language" id="lang">
              <Input id="lang" value={form.lang} onChange={set('lang')} />
            </Field>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors w-fit"
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Advanced options
          </button>

          {showAdvanced && (
            <div className="flex flex-col gap-4 pt-1 border-t border-[var(--color-border)]">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Login" id="login">
                  <Input id="login" value={form.login} onChange={set('login')} />
                </Field>
                <Field label="Password" id="password">
                  <Input id="password" type="password" value={form.password} onChange={set('password')} />
                </Field>
              </div>
              <Field label="Token" id="token">
                <Input id="token" value={form.token || ''} onChange={set('token')} className="font-mono text-xs" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Serial Number" id="serial_number">
                  <Input id="serial_number" value={form.serial_number} onChange={set('serial_number')} className="font-mono text-xs" />
                </Field>
                <Field label="Connection Timeout (s)" id="connection_timeout">
                  <Input id="connection_timeout" type="number" min={3} max={60} value={form.connection_timeout} onChange={set('connection_timeout')} />
                </Field>
              </div>
              <Field label="Device ID" id="device_id">
                <Input id="device_id" value={form.device_id || ''} onChange={set('device_id')} className="font-mono text-xs" />
              </Field>
              <Field label="Device ID 2" id="device_id2">
                <Input id="device_id2" value={form.device_id2 || ''} onChange={set('device_id2')} className="font-mono text-xs" />
              </Field>
              <Field label="Signature" id="signature">
                <Input id="signature" value={form.signature || ''} onChange={set('signature')} className="font-mono text-xs" />
              </Field>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={loading} className="min-w-28">
              {loading ? <Loader2 size={15} className="animate-spin" /> : connected ? 'Reconnect' : 'Connect'}
            </Button>
            {connected && (
              <Button type="button" variant="outline" onClick={handleSaveConfig} disabled={loading}>
                Save
              </Button>
            )}
            {connected && (
              <Button type="button" variant="outline" onClick={handleDisconnect} disabled={loading}>
                Disconnect
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* App preferences card */}
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
            <p className="text-xs text-[var(--color-muted)] mt-0.5">Parental lock for categories like "FOR ADULTS".</p>
          </div>
          <Switch checked={showAdult} onCheckedChange={handleAdultToggle} />
        </div>
      </Card>

      {/* STBEmu Export card */}
      <Card title="STBEmu Export" description="Generate an STBEmu-compatible backup file you can restore directly in the app.">
        <form onSubmit={handleStbEmuSave} className="flex flex-col gap-4">

          {stbEmuNotice && (
            <div className={cn(
              'flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs',
              stbEmuNotice.type === 'success'
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25'
                : 'bg-[var(--color-live)]/10 text-[var(--color-live)] border border-[var(--color-live)]/25'
            )}>
              {stbEmuNotice.type === 'success' ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
              {stbEmuNotice.msg}
            </div>
          )}

          <Field label="Profile Name" id="stbemu_profile_name">
            <Input
              id="stbemu_profile_name"
              placeholder="My IPTV Profile"
              value={stbEmu.stbemu_profile_name}
              onChange={e => setStbEmu(s => ({ ...s, stbemu_profile_name: e.target.value }))}
            />
          </Field>

          <Field label="STB Model" id="stbemu_stb_model">
            <select
              id="stbemu_stb_model"
              value={stbEmu.stbemu_stb_model}
              onChange={e => setStbEmu(s => ({ ...s, stbemu_stb_model: e.target.value }))}
              className="flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)]"
            >
              {STB_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>

          <Field label="Firmware" id="stbemu_firmware">
            <select
              id="stbemu_firmware"
              value={stbEmu.stbemu_firmware}
              onChange={e => setStbEmu(s => ({ ...s, stbemu_firmware: e.target.value }))}
              className="flex h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary-light)]"
            >
              {STB_FIRMWARES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>

          {stbEmu.stbemu_stb_model === 'CUSTOM' && (
            <Field label="Custom Firmware String" id="stbemu_custom_firmware" hint="e.g. mag-custom-2.20.02-pub-000">
              <Input
                id="stbemu_custom_firmware"
                placeholder="mag-xxx-2.20.02-pub-xxx"
                value={stbEmu.stbemu_custom_firmware}
                onChange={e => setStbEmu(s => ({ ...s, stbemu_custom_firmware: e.target.value }))}
                className="font-mono text-xs"
              />
            </Field>
          )}

          {stbEmu.stbemu_stb_model !== 'CUSTOM' && (
            <p className="text-xs text-[var(--color-muted)]">
              Firmware: <span className="font-mono">{
                (() => {
                  const slug = stbEmu.stbemu_stb_model.toLowerCase().replace(/^mag(\d+)$/, 'mag-$1')
                  const num  = stbEmu.stbemu_stb_model.replace(/^MAG/, '')
                  return `${slug}-2.20.02-pub-${num}`
                })()
              }</span>
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" variant="outline" disabled={stbEmuSaving} className="h-9 px-4 text-sm">
              {stbEmuSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
            </Button>
            <Button
              type="button"
              onClick={handleStbEmuExport}
              disabled={stbEmuExporting}
              className="h-9 px-4 text-sm gap-2"
            >
              {stbEmuExporting
                ? <Loader2 size={14} className="animate-spin" />
                : <Download size={14} />}
              Download Backup
            </Button>
          </div>
        </form>
      </Card>

      {/* Channel Logos card */}
      <Card title="Channel Logos" description="Logos are matched automatically from the iptv-org database. Add manual overrides for channels that don't match.">

        {/* Logo notice */}
        {logoNotice && (
          <div className={cn(
            'flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs',
            logoNotice.type === 'success'
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/25'
              : 'bg-[var(--color-live)]/10 text-[var(--color-live)] border border-[var(--color-live)]/25'
          )}>
            {logoNotice.type === 'success' ? <CheckCircle2 size={13} className="shrink-0" /> : <XCircle size={13} className="shrink-0" />}
            {logoNotice.msg}
          </div>
        )}

        {/* DB status row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <Image size={15} className="text-[var(--color-muted)] shrink-0" />
              <span className="text-xs text-[var(--color-muted)] truncate">
                {logoStats
                  ? logoStats.db_size > 0
                    ? `iptv-org: ${logoStats.db_size.toLocaleString()} entries`
                    : 'iptv-org database not loaded — click Refresh DB'
                  : 'Loading…'}
                {logoStats?.db_cached_at
                  ? ` · updated ${new Date(logoStats.db_cached_at).toLocaleDateString()}`
                  : ''}
              </span>
            </div>
            {logoStats?.total_channels > 0 && (
              <span className={cn(
                'text-xs ml-5',
                logoStats.matched_channels > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-live)]'
              )}>
                {logoStats.matched_channels} of {logoStats.total_channels} channels matched
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleLogoRefresh}
            disabled={logoRefreshing}
            className="shrink-0 h-8 px-3 text-xs gap-1.5"
          >
            <RefreshCw size={12} className={logoRefreshing ? 'animate-spin' : ''} />
            {logoRefreshing ? 'Refreshing…' : 'Refresh DB'}
          </Button>
        </div>

        {/* Name tester */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">Test Channel Name</p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. BBC ONE HD"
              value={testName}
              onChange={e => { setTestName(e.target.value); setTestResult(null) }}
              className="text-xs"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!testName.trim()}
              onClick={async () => {
                const r = await checkLogoName(testName.trim())
                setTestResult(r)
              }}
              className="shrink-0 h-9 px-3 text-xs"
            >
              Test
            </Button>
          </div>
          {testResult && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-xs flex flex-col gap-1">
              <span className="text-[var(--color-muted)]">Normalized: <span className="font-mono text-[var(--color-text)]">{testResult.normalized}</span></span>
              {testResult.logo
                ? <button
                    type="button"
                    onClick={() => { setNewLogoUrl(testResult.logo) }}
                    className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity group"
                    title="Click to use in Add Override"
                  >
                    <img src={testResult.logo} alt="" className="h-8 w-8 object-contain rounded shrink-0" onError={e => e.currentTarget.style.display='none'} />
                    <span className="text-[var(--color-success)] truncate group-hover:underline">{testResult.logo}</span>
                  </button>
                : <span className={testResult.db_loaded ? 'text-[var(--color-live)]' : 'text-[var(--color-muted)]'}>
                    {testResult.db_loaded ? 'No match found in database' : 'Database not loaded yet'}
                  </span>
              }
            </div>
          )}
        </div>

        {/* Manual overrides list */}
        {Object.keys(logoOverrides).length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">Manual Overrides</p>
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {Object.entries(logoOverrides).map(([name, url]) => (
                <div key={name} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5">
                  {url && (
                    <img
                      src={url}
                      alt=""
                      className="w-6 h-6 object-contain shrink-0 rounded"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  <span className="text-xs font-medium text-[var(--color-text)] flex-1 truncate">{name}</span>
                  <span className="text-xs text-[var(--color-muted)] flex-1 truncate hidden sm:block">{url}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteOverride(name)}
                    className="text-[var(--color-muted)] hover:text-[var(--color-live)] transition-colors shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add override form */}
        <form onSubmit={handleAddOverride} className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">Add Override</p>
          <div className="flex gap-2">
            <datalist id="unmatched-channels">
              {unmatchedChannels.map(name => <option key={name} value={name} />)}
            </datalist>
            <Input
              list="unmatched-channels"
              placeholder="Channel name"
              value={newLogoName}
              onChange={e => setNewLogoName(e.target.value)}
              className="text-xs flex-1"
            />
            <Input
              placeholder="Logo URL"
              value={newLogoUrl}
              onChange={e => setNewLogoUrl(e.target.value)}
              className="text-xs flex-[2]"
            />
            <Button
              type="submit"
              disabled={!newLogoName.trim() || !newLogoUrl.trim()}
              className="shrink-0 h-9 px-4 text-xs"
            >
              Add
            </Button>
          </div>
        </form>
      </Card>

      {/* Device Profile card */}
      {deviceProfile && (
        <Card title="Device Profile" description="STB identity sent to the Stalker portal on every request.">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ['STB Model',           deviceProfile.stb_type],
              ['HW Version',          deviceProfile.hw_version],
              ['Image Version',       deviceProfile.image_version],
              ['Firmware',            deviceProfile.image_description],
              ['Portal API',          deviceProfile.portal_version],
              ['JS API Version',      deviceProfile.js_api_version],
              ['STB API Version',     deviceProfile.stb_api_version],
              ['Player Engine',       deviceProfile.player_engine_version],
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
  )
}
