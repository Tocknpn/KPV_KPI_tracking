import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

export default function Login() {
  const navigate = useNavigate()
  const { token, setSession } = useAuthStore()
  const { setLastSyncedAt } = useAppStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // First-time-on-this-device connection setup — only relevant before Sheets has ever been
  // configured locally. Once it has, this link disappears; further changes need an
  // authenticated admin via Settings (bootstrapConnect refuses to run otherwise anyway).
  const [sheetsConfigured, setSheetsConfigured] = useState<boolean | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [setupSheetId, setSetupSheetId]   = useState('')
  const [setupJsonPath, setSetupJsonPath] = useState('')
  const [setupBusy, setSetupBusy]     = useState(false)
  const [setupError, setSetupError]   = useState('')
  const [setupSuccess, setSetupSuccess] = useState('')

  useEffect(() => {
    window.api.isSheetsConfigured().then(setSheetsConfigured)
  }, [])

  async function handleBrowseJson() {
    const path = await window.api.browseFileBootstrap()
    if (path) setSetupJsonPath(path)
  }

  async function handleBootstrapConnect() {
    setSetupBusy(true); setSetupError(''); setSetupSuccess('')
    try {
      const res = await window.api.bootstrapConnect(setupSheetId.trim(), setupJsonPath.trim())
      if (res.success) {
        setSetupSuccess(res.message ?? 'Connected.')
        setSheetsConfigured(true)
      } else {
        setSetupError(res.error ?? 'Connection failed.')
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : String(e))
    } finally {
      setSetupBusy(false)
    }
  }

  if (token) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await window.api.login(username, password)
      if (!result.success) {
        setError(result.error ?? 'Invalid username or password')
        setLoading(false)
        return
      }

      // Pull the latest data from Google Sheets before letting the user into the app, so a
      // device that's been offline (or where someone else made changes elsewhere) doesn't
      // show stale numbers. Never blocks login on failure — e.g. no internet, or Sheets not
      // configured on this device yet — it just proceeds with whatever's already local.
      setSyncStatus('Connecting to Google Sheets…')
      try {
        const sync = await window.api.pullFromCloud(result.token)
        setSyncStatus(sync.success ? 'Up to date.' : 'Could not sync — using last saved data.')
        if (sync.success) setLastSyncedAt(new Date().toISOString())
      } catch {
        setSyncStatus('Could not sync — using last saved data.')
      }
      await new Promise(r => setTimeout(r, 500)) // let the final status actually be readable

      setSession(result.token, result.user, result.permissions ?? [])
      const landingPage = result.user.role === 'hr' ? '/kpi-settings' : '/dashboard'
      navigate(landingPage)
    } catch {
      setError('Connection error. Please restart the app.')
      setLoading(false)
      setSyncStatus(null)
    }
  }

  if (syncStatus) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
          style={{ background: 'linear-gradient(135deg, #004f96 0%, #0067c0 100%)' }}>
          <span className="material-symbols-outlined animate-spin text-white text-3xl" style={{ animationDuration: '1s' }}>sync</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-on-surface font-bold text-lg">SalesTrack Pro</p>
          <p className="text-on-surface-variant text-sm">{syncStatus}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center font-sans"
      style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%)' }}
    >
      {/* Card */}
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4"
            style={{ background: 'linear-gradient(135deg, #004f96 0%, #0067c0 100%)' }}
          >
            <span
              className="material-symbols-outlined text-white text-3xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              diamond
            </span>
          </div>
          <h1 className="text-[22px] font-bold text-on-surface tracking-tight">Welcome Back</h1>
          <p className="text-on-surface-variant text-body-sm mt-1 text-center">
            Sign in to access your branch dashboard
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-glass-elevated border border-white/80 px-8 py-7">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Username */}
            <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-3 focus-within:border-primary transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">person</span>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="Enter your username"
                className="flex-1 bg-transparent outline-none text-body-md text-on-surface placeholder:text-on-surface-variant/50"
              />
            </div>

            {/* Password */}
            <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-3 focus-within:border-primary transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">lock</span>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="flex-1 bg-transparent outline-none text-body-md text-on-surface placeholder:text-on-surface-variant/50"
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                tabIndex={-1}
                className="text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPwd ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-error-container text-on-error-container px-3 py-2.5 rounded-lg text-body-sm">
                <span className="material-symbols-outlined text-sm">error</span>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3 rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-primary disabled:opacity-60 mt-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin-slow">sync</span>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* First-time device setup */}
        {sheetsConfigured === false && !showSetup && (
          <button
            onClick={() => setShowSetup(true)}
            className="w-full text-center text-[12px] text-primary hover:underline mt-4"
          >
            First time on this device? Connect to Google Sheets
          </button>
        )}

        {showSetup && (
          <div className="bg-white rounded-2xl shadow-glass-elevated border border-white/80 px-6 py-5 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-body-sm text-on-surface">Connect This Device</p>
              <button onClick={() => setShowSetup(false)} className="text-on-surface-variant hover:text-error">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Paste the Google Sheet ID and the service account JSON key path — same for every device.
              On success this also pulls all current accounts/data down, so you can log in with your real credentials right after.
            </p>
            <input
              value={setupSheetId} onChange={e => setSetupSheetId(e.target.value)}
              placeholder="Google Sheet ID"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-body-sm outline-none"
            />
            <div className="flex gap-2">
              <input
                value={setupJsonPath} onChange={e => setSetupJsonPath(e.target.value)}
                placeholder="Path to service account .json"
                className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-body-sm outline-none"
              />
              <button onClick={handleBrowseJson} type="button"
                className="px-3 rounded-lg border border-outline-variant text-on-surface-variant text-body-sm hover:bg-surface-container">
                Browse
              </button>
            </div>
            {setupError && (
              <div className="flex items-center gap-2 bg-error-container text-on-error-container px-3 py-2 rounded-lg text-[11px]">
                <span className="material-symbols-outlined text-sm">error</span>{setupError}
              </div>
            )}
            {setupSuccess && (
              <div className="flex items-center gap-2 bg-tertiary-fixed/30 px-3 py-2 rounded-lg text-[11px]">
                <span className="material-symbols-outlined text-sm text-tertiary">cloud_done</span>{setupSuccess}
              </div>
            )}
            <button
              onClick={handleBootstrapConnect}
              disabled={setupBusy || !setupSheetId.trim() || !setupJsonPath.trim()}
              className="w-full bg-secondary text-white py-2.5 rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-sm ${setupBusy ? 'animate-spin-slow' : ''}`}>
                {setupBusy ? 'sync' : 'cloud_sync'}
              </span>
              {setupBusy ? 'Connecting…' : 'Test Connection & Sync'}
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-on-surface-variant/40 mt-6">
          v{__APP_VERSION__} &nbsp;·&nbsp; SalesTrack Pro &nbsp;·&nbsp; KPV Gold & Jewelry
        </p>
      </div>
    </div>
  )
}
