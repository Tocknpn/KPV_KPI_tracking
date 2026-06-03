import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

const FEATURES = [
  { icon: 'leaderboard',    label: 'KPI Score Tracking',   desc: 'Real-time points per salesperson' },
  { icon: 'store',          label: '4 Branch Coverage',    desc: 'VC · IT · VT · MM' },
  { icon: 'trending_up',    label: 'Monthly Targets',      desc: 'Per-branch point targets & projections' },
  { icon: 'bar_chart',      label: 'Executive Analytics',  desc: 'Company-wide KPI overview' },
]

export default function Login() {
  const navigate = useNavigate()
  const { token, setSession } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  if (token) return <Navigate to="/dashboard" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await window.api.login(username, password)
      if (result.success) {
        setSession(result.token, result.user)
        navigate('/dashboard')
      } else {
        setError(result.error ?? 'Login failed')
      }
    } catch {
      setError('Connection error. Please restart the app.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex font-sans overflow-hidden">

      {/* ── LEFT: Branded cover panel ───────────────────────────── */}
      <div className="hidden lg:flex lg:w-[58%] relative flex-col justify-between p-12 overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #00254d 0%, #003a75 45%, #004f96 100%)',
        }}
      >
        {/* Decorative gold circles */}
        <div className="absolute top-[-80px] right-[-80px] w-[360px] h-[360px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #fed65b 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-60px] left-[-60px] w-[280px] h-[280px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #fed65b 0%, transparent 70%)' }} />
        <div className="absolute top-[40%] left-[60%] w-[180px] h-[180px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #fed65b 0%, transparent 70%)' }} />

        {/* Top: Logo + Name */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, #fed65b, #f59e0b)' }}>
              <span className="material-symbols-outlined text-3xl text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                diamond
              </span>
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl tracking-tight leading-tight">SalesTrack Pro</h1>
              <p className="text-blue-200 text-sm">KPV Gold & Jewelry</p>
            </div>
          </div>

          <h2 className="text-white text-4xl font-bold leading-tight mb-3">
            Sales KPI<br />
            <span style={{ color: '#fed65b' }}>Performance</span><br />
            System
          </h2>
          <p className="text-blue-200 text-base leading-relaxed max-w-sm">
            Track, score, and compare sales performance across all branches — in real time.
          </p>
        </div>

        {/* Middle: Feature highlights */}
        <div className="relative z-10 space-y-4 my-10">
          {FEATURES.map(f => (
            <div key={f.label} className="flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)' }}>
                <span className="material-symbols-outlined text-lg" style={{ color: '#fed65b', fontVariationSettings: "'FILL' 1" }}>
                  {f.icon}
                </span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">{f.label}</p>
                <p className="text-blue-300 text-xs">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom: KPI formula hint + version */}
        <div className="relative z-10">
          <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1.5">KPI Score Formula</p>
            <p className="text-white text-sm font-mono">
              (Jewelry × 15) + (Bar × 7.5) + (Qty × Tier)
            </p>
            <p className="text-blue-300 text-xs mt-1">
              KPI % = Total Score ÷ Branch Target × 100
            </p>
          </div>
          <p className="text-blue-400 text-xs">
            v{__APP_VERSION__} &nbsp;·&nbsp; Offline-first desktop app &nbsp;·&nbsp; © KPV
          </p>
        </div>
      </div>

      {/* ── RIGHT: Login form ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-mica relative">
        {/* Soft background blobs */}
        <div className="fixed top-[-10%] right-[-5%] w-[400px] h-[400px] bg-primary/5 blur-[120px] rounded-full -z-10" />
        <div className="fixed bottom-[-5%] left-[5%] w-[300px] h-[300px] bg-secondary/5 blur-[100px] rounded-full -z-10" />

        <div className="w-full max-w-sm">
          {/* Mobile brand (shows only on small screens) */}
          <div className="lg:hidden text-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white mx-auto mb-3 shadow-primary">
              <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
            </div>
            <h1 className="font-bold text-xl text-on-surface">SalesTrack Pro</h1>
            <p className="text-on-surface-variant text-sm">KPV Gold & Jewelry</p>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">Welcome back</h2>
            <p className="text-on-surface-variant text-body-sm mt-1">Sign in to access your branch dashboard</p>
          </div>

          {/* Form card */}
          <div className="bg-white/70 backdrop-blur-[40px] border border-white/50 border-t-white/90 border-l-white/90 rounded-2xl shadow-glass-elevated p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label className="block font-label-md text-label-md text-primary mb-1.5">Username</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">person</span>
                  <input
                    type="text"
                    autoFocus
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    className="w-full bg-surface-container-low border-b-2 border-primary/30 focus:border-primary pl-9 pr-3 py-2 text-on-surface text-body-md outline-none transition-colors"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block font-label-md text-label-md text-primary mb-1.5">Password</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">lock</span>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full bg-surface-container-low border-b-2 border-primary/30 focus:border-primary pl-9 pr-10 py-2 text-on-surface text-body-md outline-none transition-colors"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                    tabIndex={-1}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {showPwd ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 bg-error-container text-on-error-container px-4 py-3 rounded-lg text-body-sm">
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
                  <>
                    <span className="material-symbols-outlined text-sm">login</span>
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Role hint */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              { role: 'Admin',    hint: 'Full access',      color: 'text-error' },
              { role: 'Supervisor', hint: 'Branch only',    color: 'text-secondary' },
              { role: 'Executive', hint: 'Read only',       color: 'text-primary' },
            ].map(r => (
              <div key={r.role} className="bg-white/40 backdrop-blur-sm rounded-lg px-2 py-2 border border-white/30">
                <p className={`text-[10px] font-bold uppercase ${r.color}`}>{r.role}</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">{r.hint}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-[11px] text-on-surface-variant/50 mt-5">
            v{__APP_VERSION__} &nbsp;·&nbsp; SalesTrack Pro
          </p>
        </div>
      </div>
    </div>
  )
}
