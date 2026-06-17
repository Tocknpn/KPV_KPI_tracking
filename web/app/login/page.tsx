import { loginAction } from '@/app/actions'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center font-sans"
      style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%)' }}>
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg mb-4"
            style={{ background: 'linear-gradient(135deg, #004f96 0%, #0067c0 100%)' }}>
            <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              diamond
            </span>
          </div>
          <h1 className="text-[22px] font-bold text-on-surface tracking-tight">KPV KPI Tracker</h1>
          <p className="text-on-surface-variant text-body-sm mt-1 text-center">Sign in to view reports</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-glass-elevated border border-white/80 px-8 py-7">
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-error-container text-on-error-container px-3 py-2.5 rounded-lg text-body-sm">
              {decodeURIComponent(error)}
            </div>
          )}

          <form action={loginAction} className="space-y-4">
            <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-3 focus-within:border-primary transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">person</span>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Enter your username"
                className="flex-1 bg-transparent outline-none text-body-md text-on-surface placeholder:text-on-surface-variant/50"
              />
            </div>

            <div className="flex items-center gap-3 border-b border-outline-variant/40 pb-3 focus-within:border-primary transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">lock</span>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                className="flex-1 bg-transparent outline-none text-body-md text-on-surface placeholder:text-on-surface-variant/50"
              />
            </div>

            <button type="submit"
              className="w-full bg-primary text-white py-3 rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-primary mt-2">
              Sign In
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-on-surface-variant/60 mt-6">
          Use the same credentials as the desktop app.
          <br />Branch Manager and above only.
        </p>
      </div>
    </div>
  )
}
