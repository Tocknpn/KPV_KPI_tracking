import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

export default function Login() {
  const navigate = useNavigate()
  const { token, setSession } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

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
        setError(result.error ?? 'Invalid username or password')
      }
    } catch {
      setError('Connection error. Please restart the app.')
    } finally {
      setLoading(false)
    }
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

        {/* Footer */}
        <p className="text-center text-[11px] text-on-surface-variant/40 mt-6">
          v{__APP_VERSION__} &nbsp;·&nbsp; SalesTrack Pro &nbsp;·&nbsp; KPV Gold & Jewelry
        </p>
      </div>
    </div>
  )
}
