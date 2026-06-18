import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Soft-warn signal only — numbers on screen are still computed normally via the existing
// rate/tier fallback chain (kpi:isMonthSubmitted has no effect on scoring). This just tells
// HR/Admin "nobody explicitly confirmed this month's KPI setup yet," since a forgotten month
// otherwise looks identical to one that was reviewed and genuinely unchanged.
export function KpiSubmissionBanner({ year, month }: { year: number; month: number }) {
  const { token, user } = useAuthStore()
  const [submitted, setSubmitted] = useState(true)

  useEffect(() => {
    if (!token) return
    window.api.isMonthSubmitted(token, year, month).then(r => setSubmitted(r.submitted))
  }, [token, year, month])

  if (submitted) return null
  const canFix = user?.role === 'admin' || user?.role === 'hr'

  return (
    <div className="flex items-center gap-3 bg-secondary-container/30 border border-secondary/30 text-on-surface px-4 py-3 rounded-xl mb-5">
      <span className="material-symbols-outlined text-secondary">warning</span>
      <p className="text-body-sm flex-1">
        <strong>{MONTH_NAMES[month - 1]} {year}</strong> KPI Settings haven't been confirmed yet.
        Numbers below use the last known rates/targets — {canFix ? 'go to KPI Settings to confirm this month.' : 'ask Admin/HR to confirm this month.'}
      </p>
    </div>
  )
}
