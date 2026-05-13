import { useState, useEffect } from 'react'
import { connect, disconnect, getConfig } from '../stalkerApi'

const DEFAULT_FORM = {
  portal: '',
  mac: '',
  timezone: 'Europe/London',
  lang: 'en',
  serial_number: '0000000000000',
  device_id: '',
  device_id2: '',
  login: '',
  password: '',
  token: '',
  signature: '',
  portal_signature: '',
  connection_timeout: 10,
}

export default function SetupPage({ onConnect, status }) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [savedCreds, setSavedCreds] = useState(null) // { portal_signature, tokens }

  const loadConfig = () => {
    getConfig().then((cfg) => {
      if (!cfg) return
      setForm((f) => ({
        ...f,
        portal:             cfg.portal             ?? f.portal,
        mac:                cfg.mac                ?? f.mac,
        timezone:           cfg.timezone           ?? f.timezone,
        lang:               cfg.lang               ?? f.lang,
        login:              cfg.login              ?? f.login,
        serial_number:      cfg.serial_number      ?? f.serial_number,
        device_id:          cfg.device_id          ?? f.device_id,
        device_id2:         cfg.device_id2         ?? f.device_id2,
        signature:          cfg.signature          ?? f.signature,
        portal_signature:   cfg.portal_signature   ?? f.portal_signature,
        connection_timeout: cfg.connection_timeout ?? f.connection_timeout,
        token:              cfg.token              ?? f.token,
      }))
      setSavedCreds({
        portal_signature: cfg.portal_signature || null,
        tokens: cfg.tokens || {},
      })
      if (cfg.login || cfg.serial_number !== '0000000000000' ||
          cfg.device_id || cfg.signature || cfg.token) {
        setAdvanced(true)
      }
    }).catch(() => {})
  }

  useEffect(() => { loadConfig() }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleConnect = async () => {
    setError(null)
    setSuccess(false)
    if (!form.portal) { setError('Portal URL is required'); return }
    if (!form.mac)    { setError('MAC address is required'); return }
    setLoading(true)
    try {
      await connect(form)
      setSuccess(true)
      await onConnect()
      loadConfig()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    setSuccess(false)
    await onConnect()
  }

  return (
    <div style={{ maxWidth: 600, margin: '36px auto', padding: '0 24px' }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', marginBottom: 6 }}>
          Portal Setup
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
          Configure your Stalker Middleware portal connection.
        </p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div className="field">
          <label>Portal URL</label>
          <input
            placeholder="http://your-portal.example.com/"
            value={form.portal}
            onChange={(e) => set('portal', e.target.value)}
          />
        </div>

        <div className="field">
          <label>MAC Address</label>
          <input
            placeholder="00:1A:79:XX:XX:XX"
            value={form.mac}
            onChange={(e) => set('mac', e.target.value)}
            style={{ fontFamily: 'Menlo, Consolas, monospace', letterSpacing: '0.03em' }}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Timezone</label>
            <input value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
          </div>
          <div className="field">
            <label>Language</label>
            <input value={form.lang} maxLength={5} onChange={(e) => set('lang', e.target.value)} />
          </div>
        </div>

        <button
          className="btn-secondary"
          style={{ alignSelf: 'flex-start', padding: '5px 13px', fontSize: 12, borderRadius: 100 }}
          onClick={() => setAdvanced((a) => !a)}
        >
          {advanced ? '▲ Hide advanced' : '▼ Advanced options'}
        </button>

        {advanced && (
          <>
            <div style={{ height: 1, background: 'var(--border)' }} />

            <div className="field-row">
              <div className="field">
                <label>Login</label>
                <input value={form.login} onChange={(e) => set('login', e.target.value)} />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Token</label>
              <input
                value={form.token}
                onChange={(e) => set('token', e.target.value)}
                style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }}
              />
            </div>

            <div className="field">
              <label>Serial Number</label>
              <input
                value={form.serial_number}
                onChange={(e) => set('serial_number', e.target.value)}
                style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Device ID</label>
                <input value={form.device_id} onChange={(e) => set('device_id', e.target.value)} style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }} />
              </div>
              <div className="field">
                <label>Device ID2</label>
                <input value={form.device_id2} onChange={(e) => set('device_id2', e.target.value)} style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }} />
              </div>
            </div>

            <div className="field">
              <label>Device Signature</label>
              <input value={form.signature} onChange={(e) => set('signature', e.target.value)} style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }} />
            </div>

            <div className="field">
              <label>Portal Signature <span style={{ fontWeight: 400, color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>(returned by portal after auth)</span></label>
              <input
                value={form.portal_signature}
                onChange={(e) => set('portal_signature', e.target.value)}
                placeholder="leave blank to use device signature"
                style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 12 }}
              />
            </div>

            <div className="field" style={{ maxWidth: 140 }}>
              <label>Timeout (sec)</label>
              <input
                type="number"
                min={3}
                max={60}
                value={form.connection_timeout}
                onChange={(e) => set('connection_timeout', parseInt(e.target.value, 10))}
              />
            </div>
          </>
        )}

        {error   && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">✓ Connected successfully!</div>}

        <div style={{ display: 'flex', gap: 10, paddingTop: 2 }}>
          <button className="btn-primary" onClick={handleConnect} disabled={loading}
            style={{ minWidth: 110 }}>
            {loading
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Connecting…
                </span>
              : 'Connect'}
          </button>
          {status?.connected && (
            <button className="btn-danger" onClick={handleDisconnect}>Disconnect</button>
          )}
        </div>

      </div>

      {status?.connected && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-title">Current Session</div>
          <table className="session-table">
            <tbody>
              {[
                ['Portal',  status.portal],
                ['MAC',     status.mac],
                ['Token',   status.token ? `${status.token.slice(0, 20)}…` : '—'],
                ['Balance', status.profile?.balance ?? '—'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {savedCreds && (savedCreds.portal_signature || Object.keys(savedCreds.tokens).length > 0) && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-title">Stored Credentials</div>
          <table className="session-table">
            <tbody>
              {savedCreds.portal_signature && (
                <tr>
                  <td>Portal Sig</td>
                  <td>{savedCreds.portal_signature}</td>
                </tr>
              )}
              {Object.entries(savedCreds.tokens).map(([key, val]) => (
                <tr key={key}>
                  <td style={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 11 }}>{key}</td>
                  <td>{val?.token ?? String(val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
