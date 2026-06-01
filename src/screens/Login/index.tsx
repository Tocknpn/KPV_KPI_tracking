import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

export default function Login() {
  const navigate = useNavigate()
  const { token, setSession } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
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
    <div className="min-h-screen bg-mica flex items-center justify-center font-sans">
      {/* Background blobs */}
      <div className="fixed top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full -z-10" />
      <div className="fixed bottom-[-5%] left-[5%] w-[400px] h-[400px] bg-secondary/5 blur-[100px] rounded-full -z-10" />

      <div className="w-full max-w-md px-4">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white mx-auto mb-4 shadow-primary">
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              leaderboard
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold">SalesTrack Pro</h1>
          <p className="text-on-surface-variant text-body-sm mt-1">Gold & Jewelry Performance System</p>
        </div>

        {/* Card */}
        <div className="bg-white/70 backdrop-blur-[40px] border border-white/50 border-t-white/90 border-l-white/90 rounded-2xl shadow-glass-elevated p-8">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-label-md text-label-md text-primary mb-1.5">Username</label>
              <input
                type="text"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="w-full bg-surface-container-low border-b-2 border-t-0 border-l-0 border-r-0 border-primary/30 focus:border-primary px-3 py-2 text-on-surface text-body-md outline-none transition-colors"
                placeholder="Enter your username"
              />
            </div>
            <div>
              <label className="block font-label-md text-label-md text-primary mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-surface-container-low border-b-2 border-t-0 border-l-0 border-r-0 border-primary/30 focus:border-primary px-3 py-2 text-on-surface text-body-md outline-none transition-colors"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-error-container text-on-error-container px-4 py-3 rounded-lg text-body-sm">
                <span className="material-symbols-outlined text-sm">error</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3 rounded-lg font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-primary disabled:opacity-60 mt-2"
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

          <div className="mt-6 pt-4 border-t border-outline-variant/20 flex justify-between items-center">
            <p className="text-[11px] text-on-surface-variant/50">
              Default: admin / admin1234
            </p>
            <p className="text-[11px] text-on-surface-variant/40 font-tabular-nums">
              v{__APP_VERSION__}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
