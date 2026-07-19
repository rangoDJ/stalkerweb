import { useState, useEffect, useCallback } from 'react'
import { User, Plus, Trash2, Zap, Loader2, AlertCircle, Check, Server, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getProfiles, saveProfile, activateProfile, deleteProfile, getConfig, getSettings, saveSettings } from '../stalkerApi'
import { useApp } from '@/lib/appContext'
import { showToast } from '@/lib/toast'
import { invalidateChannelCache } from '@/lib/channelCache'

// ── Profile card ──────────────────────────────────────────────────────────────
function ProfileCard({ name, profile, isActive, onActivate, onDelete, activating, deleting }) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-[var(--radius-md)] border p-4 transition-colors',
        isActive
          ? 'border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border)]'
      )}
    >
      {/* Active badge */}
      {isActive && (
        <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary-light)]">
          <Check size={11} /> Active
        </span>
      )}

      {/* Profile info */}
      <div className="flex items-center gap-3 pr-16">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)]">
          <User size={18} className={isActive ? 'text-[var(--color-primary-light)]' : 'text-[var(--color-muted)]'} />
        </div>
        <div className="min-w-0">
          <p className={cn('font-semibold text-sm truncate', isActive ? 'text-[var(--color-primary-light)]' : 'text-[var(--color-text)]')}>
            {name}
          </p>
          {profile.mac && (
            <p className="text-xs text-[var(--color-muted)] truncate font-mono mt-0.5">{profile.mac}</p>
          )}
        </div>
      </div>

      {/* Portal URL */}
      {profile.portal && (
        <div className="flex items-start gap-1.5 text-xs text-[var(--color-muted)] min-w-0">
          <Server size={12} className="mt-0.5 shrink-0" />
          <span className="truncate break-all">{profile.portal}</span>
        </div>
      )}

      {/* Timezone / lang */}
      {(profile.timezone || profile.lang) && (
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <Cpu size={11} className="shrink-0" />
          <span>
            {[profile.timezone, profile.lang && profile.lang.toUpperCase()].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-1">
        {!isActive && (
          <button
            onClick={() => onActivate(name)}
            disabled={activating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {activating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Activate
          </button>
        )}
        <button
          onClick={() => onDelete(name)}
          disabled={deleting}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:text-red-400 hover:border-red-400/40 disabled:opacity-50 transition-colors ml-auto"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Delete
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProfilesPage() {
  const { setConnected } = useApp()

  const [profiles, setProfiles] = useState({})
  const [currentConfig, setCurrentConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [saveName, setSaveName]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [activatingName, setActivatingName] = useState(null)
  const [deletingName,   setDeletingName]   = useState(null)

  const [vodEnabled, setVodEnabled] = useState(true)
  const [vodSaving,  setVodSaving]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [prof, cfg, settings] = await Promise.all([getProfiles(), getConfig(), getSettings()])
      setProfiles(prof?.profiles || {})
      setCurrentConfig(cfg)
      setVodEnabled(settings?.vod_enabled !== false)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── VOD visibility toggle (controls the Android app's VOD section) ──────────
  const handleToggleVod = async (next) => {
    setVodEnabled(next) // optimistic
    setVodSaving(true)
    try {
      await saveSettings({ vod_enabled: next })
      showToast(next ? 'VOD enabled' : 'VOD disabled', 'success')
    } catch (e) {
      setVodEnabled(!next) // revert
      showToast(`Failed to update VOD setting: ${e.message}`, 'error')
    } finally {
      setVodSaving(false)
    }
  }

  useEffect(() => { load() }, [load])

  // Determine which profile is currently active by matching portal + mac
  const activeProfileName = currentConfig
    ? Object.entries(profiles).find(
        ([, p]) => p.portal === currentConfig.portal && p.mac === currentConfig.mac
      )?.[0] ?? null
    : null

  // ── Save current config as named profile ───────────────────────────────────
  const handleSave = async () => {
    const name = saveName.trim()
    if (!name) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveProfile(name)
      setSaveName('')
      showToast(`Profile "${name}" saved`, 'success')
      await load()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Activate profile ───────────────────────────────────────────────────────
  const handleActivate = async (name) => {
    setActivatingName(name)
    try {
      await activateProfile(name)
      setConnected(true)
      invalidateChannelCache()
      showToast(`Switched to profile "${name}"`, 'success')
      await load()
    } catch (e) {
      showToast(`Failed to activate "${name}": ${e.message}`, 'error')
    } finally {
      setActivatingName(null)
    }
  }

  // ── Delete profile ─────────────────────────────────────────────────────────
  const handleDelete = async (name) => {
    if (!confirm(`Delete profile "${name}"?`)) return
    setDeletingName(name)
    try {
      await deleteProfile(name)
      showToast(`Profile "${name}" deleted`, 'info')
      await load()
    } catch (e) {
      showToast(`Failed to delete "${name}": ${e.message}`, 'error')
    } finally {
      setDeletingName(null)
    }
  }

  const profileEntries = Object.entries(profiles)

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Profiles</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Save and switch between multiple portal configurations.
        </p>
      </div>

      {/* Save current as profile */}
      <div className="mb-8 p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <p className="text-sm font-medium text-[var(--color-text)] mb-3">Save current connection as profile</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Profile name (e.g. Home, Work…)"
            maxLength={64}
            className="flex-1 px-3 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)]/60"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Save
          </button>
        </div>
        {saveError && (
          <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
            <AlertCircle size={12} /> {saveError}
          </p>
        )}
        {!currentConfig?.portal && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            No active connection to save. Connect to a portal first on the Settings page.
          </p>
        )}
      </div>

      {/* VOD visibility toggle */}
      <div className="mb-8 p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)]">Show VOD section</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              When off, the Android app hides the Movies / TV Shows (VOD) section.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={vodEnabled}
            disabled={vodSaving}
            onClick={() => handleToggleVod(!vodEnabled)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
              vodEnabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-2)] border border-[var(--color-border)]'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                vodEnabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>

      {/* Profile list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary-light)]" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-400 py-8">
          <AlertCircle size={16} /> {error}
        </div>
      ) : profileEntries.length === 0 ? (
        <div className="text-center py-16">
          <User size={32} className="mx-auto text-[var(--color-muted)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-muted)]">No profiles saved yet.</p>
          <p className="text-xs text-[var(--color-muted)] mt-1 opacity-70">
            Connect to a portal and use the form above to save it as a profile.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {profileEntries.map(([name, profile]) => (
            <ProfileCard
              key={name}
              name={name}
              profile={profile}
              isActive={name === activeProfileName}
              onActivate={handleActivate}
              onDelete={handleDelete}
              activating={activatingName === name}
              deleting={deletingName === name}
            />
          ))}
        </div>
      )}
    </div>
  )
}
