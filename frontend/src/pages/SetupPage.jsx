import { useState } from 'react'
import { connect, disconnect } from '../stalkerApi'

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
  connection_timeout: 10,
}

export default function SetupPage({ onConnect, status }) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [advanced, setAdvanced] = useState(false)

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
    <div style={{ maxWidth: 580, margin: '32px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Portal Setup</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 13 }}>
        Configure your Stalker Middleware portal connection.
      </p>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div className="field">
          <label>Portal URL</label>
          <input
            id="portal"
            placeholder="http://your-portal.example.com/"
            value={form.portal}
            onChange={(e) => set('portal', e.target.value)}
          />
        </div>

        <div className="field">
          <label>MAC Address</label>
          <input
            id="mac"
            placeholder="00:1A:79:XX:XX:XX"
            value={form.mac}
            onChange={(e) => set('mac', e.target.value)}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Timezone</label>
            <input
              id="timezone"
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
            />
          </div>
          <div className="field">
            <label>Language</label>
            <input
              id="lang"
              value={form.lang}
              maxLength={5}
              onChange={(e) => set('lang', e.target.value)}
            />
          </div>
        </div>

        <button
          className="btn-secondary"
          style={{ alignSelf: 'flex-start', padding: '5px 12px', fontSize: 12 }}
          onClick={() => setAdvanced((a) => !a)}
        >
          {advanced ? '▲ Hide advanced' : '▼ Advanced options'}
        </button>

        {advanced && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Login (optional)</label>
                <input id="login" value={form.login} onChange={(e) => set('login', e.target.value)} />
              </div>
              <div className="field">
                <label>Password (optional)</label>
                <input id="password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Token (if known)</label>
              <input id="token" value={form.token} onChange={(e) => set('token', e.target.value)} />
            </div>

            <div className="field">
              <label>Serial Number</label>
              <input id="serial" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Device ID</label>
                <input id="device_id" value={form.device_id} onChange={(e) => set('device_id', e.target.value)} />
              </div>
              <div className="field">
                <label>Device ID2</label>
                <input id="device_id2" value={form.device_id2} onChange={(e) => set('device_id2', e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Signature</label>
              <input id="signature" value={form.signature} onChange={(e) => set('signature', e.target.value)} />
            </div>

            <div className="field" style={{ maxWidth: 160 }}>
              <label>Timeout (sec)</label>
              <input
                id="timeout"
                type="number"
                min={3}
                max={60}
                value={form.connection_timeout}
                onChange={(e) => set('connection_timeout', parseInt(e.target.value, 10))}
              />
            </div>
          </>
        )}

        {error && <div className="error-banner">{error}</div>}

        {success && (
          <div style={{ background: 'rgba(61,214,140,0.1)', color: 'var(--success)',
            border: '1px solid rgba(61,214,140,0.25)', borderRadius: 'var(--radius-sm)',
            padding: '10px 14px', fontSize: 13 }}>
            ✓ Connected successfully!
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? 'Connecting…' : 'Connect'}
          </button>
          {status?.connected && (
            <button className="btn-danger" onClick={handleDisconnect}>Disconnect</button>
          )}
        </div>

      </div>

      {status?.connected && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-title">Current Session</div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <tbody>
              {[
                ['Portal', status.portal],
                ['MAC', status.mac],
                ['Token', status.token ? `${status.token.slice(0, 16)}…` : '—'],
                ['Balance', status.profile?.balance ?? '—'],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)', width: 100 }}>{k}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
