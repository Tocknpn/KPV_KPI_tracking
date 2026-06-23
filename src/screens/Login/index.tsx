import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { getHomeRoute } from '../../config/navigation'
import { ROLE_DEFAULTS } from '../../types'
import kpvIcon from '../../assets/kpv-icon.png'

export default function Login() {
  const navigate = useNavigate()
  const { token, permissions, user, setSession } = useAuthStore()
  const { lastSyncedAt, setLastSyncedAt } = useAppStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  // Database connect/switch — always available, pre-login, on purpose. Lets this device
  // point at a different Google Sheet entirely (e.g. Test database vs Production database)
  // without needing to log in first — switching IS the moment there's no guarantee a login
  // from the new database has ever existed here yet. sheetsConfigured only changes the
  // warning copy (switch vs first-time), it no longer hides the button.
  const [sheetsConfigured, setSheetsConfigured] = useState<boolean | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  // Gate in front of the connect/switch panel — not a real security boundary (anyone with
  // filesystem access to this device could edit the local DB directly anyway), just a
  // deliberate speed bump so an accidental click on the corner button can't immediately
  // open the door to wiping/switching this device's database. Fixed password is intentional
  // here (unlike a login bypass — see ROLE_REDESIGN history) since the threat model is a
  // misclick, not an attacker. Recovery copy lives in INSTALLATION.md.
  const [gateOpen, setGateOpen] = useState(false)
  const [gateInput, setGateInput] = useState('')
  const [gateError, setGateError] = useState('')
  const GATE_PASSWORD = 'KPV@KPV2026'
  const [setupSheetId, setSetupSheetId]   = useState('')
  const [setupJsonPath, setSetupJsonPath] = useState('')
  const [setupBusy, setSetupBusy]     = useState(false)
  const [setupError, setSetupError]   = useState('')
  const [setupSuccess, setSetupSuccess] = useState('')

  useEffect(() => {
    window.api.isSheetsConfigured().then(setSheetsConfigured)
  }, [])

  function handleGateSubmit(e: FormEvent) {
    e.preventDefault()
    if (gateInput === GATE_PASSWORD) {
      setGateOpen(false); setGateInput(''); setGateError('')
      setShowSetup(true)
    } else {
      setGateError('Wrong password.')
    }
  }

  async function handleBrowseJson() {
    const path = await window.api.browseFileBootstrap()
    if (path) setSetupJsonPath(path)
  }

  async function handleBootstrapConnect() {
    if (sheetsConfigured && !confirm('Switch database? This clears all local data on this device first, then pulls fresh from the new Sheet. Anything not yet synced is lost.')) return
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
      // window.confirm() (native blocking dialog) and the file-picker IPC call both leave the
      // app window visually active but not actually receiving keyboard/click input on Windows
      // — Alt-tab was the only workaround. Force the window/document to reclaim focus here.
      window.focus()
    }
  }

  if (token) return <Navigate to={getHomeRoute(permissions.length > 0 ? permissions : (ROLE_DEFAULTS[user?.role ?? 'sales_sup'] ?? []))} replace />

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
      //
      // Skip if main.ts's own startup pull (fires the instant the window opens, before this
      // form is even interactive) already succeeded within the last 2 minutes — that pull
      // does the exact same full table-by-table merge across every config tab + entries,
      // entirely synchronously on the main process thread (sql.js has no async query API).
      // Running it twice back-to-back on every normal launch-then-login was doubling that
      // main-thread CPU burst for zero benefit — same data, seconds apart.
      const startupPullIsFresh = lastSyncedAt && (Date.now() - new Date(lastSyncedAt).getTime()) < 120_000
      if (startupPullIsFresh) {
        setSyncStatus('Up to date.')
      } else {
        setSyncStatus('Connecting to Google Sheets…')
        try {
          const sync = await window.api.pullFromCloud(result.token)
          setSyncStatus(sync.success ? 'Up to date.' : 'Could not sync — using last saved data.')
          if (sync.success) setLastSyncedAt(new Date().toISOString())
        } catch {
          setSyncStatus('Could not sync — using last saved data.')
        }
      }
      await new Promise(r => setTimeout(r, 500)) // let the final status actually be readable

      setSession(result.token, result.user, result.permissions ?? [])
      // Land on the first menu item this role actually has, instead of a hardcoded route —
      // accountant_officer/accountant_manager/hr_support don't have 'dashboard' at all, so
      // hardcoding it there silently rendered a page absent from their own sidebar.
      const perms = result.permissions?.length ? result.permissions : (ROLE_DEFAULTS[result.user.role] ?? [])
      navigate(getHomeRoute(perms))
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
          style={{ background: 'linear-gradient(135deg, #990000 0%, #c62828 100%)' }}>
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
      className="min-h-screen flex items-center justify-center font-sans relative"
      style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%)' }}
    >
      {/* Database connect/switch — small, always available, corner of the screen */}
      <button
        onClick={() => { if (showSetup) { setShowSetup(false) } else { setGateOpen(v => !v); setGateInput(''); setGateError('') } }}
        title="Connect / switch database"
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/60 hover:bg-white text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors shadow-sm"
      >
        <span className="material-symbols-outlined text-[18px]">dns</span>
      </button>

      {gateOpen && (
        <div className="absolute top-16 right-4 w-64 bg-white rounded-2xl shadow-glass-elevated border border-white/80 px-5 py-4 z-10">
          <form onSubmit={handleGateSubmit} className="space-y-2">
            <p className="font-bold text-[12px] text-on-surface">Enter password to continue</p>
            <input
              type="password"
              autoFocus
              value={gateInput}
              onChange={e => setGateInput(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-body-sm outline-none"
            />
            {gateError && <p className="text-[11px] text-error">{gateError}</p>}
            <button
              type="submit"
              className="w-full bg-primary text-white py-2 rounded-lg font-label-md text-label-md hover:opacity-90"
            >
              Unlock
            </button>
          </form>
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg mb-4">
            <img src={kpvIcon} alt="KPV" className="w-full h-full object-cover" />
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

        {showSetup && (
          <div className="bg-white rounded-2xl shadow-glass-elevated border border-white/80 px-6 py-5 mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-body-sm text-on-surface">{sheetsConfigured ? 'Switch Database' : 'Connect This Device'}</p>
              <button onClick={() => setShowSetup(false)} className="text-on-surface-variant hover:text-error">
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Paste the Google Sheet ID and the service account JSON key path for the database you want this device on (e.g. Test or Production).
              On success this pulls all accounts/data from that database down, so you can log in with its real credentials right after.
            </p>
            {sheetsConfigured && (
              <div className="flex items-center gap-2 bg-secondary-container/20 border border-secondary/20 text-on-surface-variant px-3 py-2 rounded-lg text-[11px]">
                <span className="material-symbols-outlined text-sm text-secondary">warning</span>
                This device is already connected to a database. Switching clears its local data first — anything not yet synced will be lost.
              </div>
            )}
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
              {setupBusy ? 'Connecting…' : sheetsConfigured ? 'Switch Database & Sync' : 'Test Connection & Sync'}
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
