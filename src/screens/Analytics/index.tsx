import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

interface DailyPoint { entry_date: string; jewelry: number; bar: number; qty: number }
interface BranchContrib { id: number; name: string; code: string; total_weight: number; total_qty: number }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Analytics() {
  const { token } = useAuthStore()
  const { selectedYear, selectedMonth, setSelectedPeriod } = useAppStore()
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [contrib, setContrib] = useState<BranchContrib[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getBranchAnalytics(token, selectedYear, selectedMonth)
      .then(data => { setDaily(data.dailyTotals); setContrib(data.branchContrib) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, selectedYear, selectedMonth])

  const totalWeight = contrib.reduce((s, b) => s + b.total_weight, 0)

  return (
    <AppShell title="Branch Performance Analytics" allowedRoles={['admin','executive']}>
      <div className="flex justify-between items-end mb-8">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Analytics</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">Branch Performance</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Branch Performance Analytics</h2>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={selectedMonth}
            onChange={e => setSelectedPeriod(selectedYear, Number(e.target.value))}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={selectedYear}
            onChange={e => setSelectedPeriod(Number(e.target.value), selectedMonth)}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm text-on-surface w-24 outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-card-gap">
          {/* Branch % Contribution */}
          <GlassCard className="col-span-12 lg:col-span-3 p-6">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-4">Branch % Contribution</p>
            <div className="space-y-4">
              {contrib.map((b, i) => {
                const pct = totalWeight > 0 ? (b.total_weight / totalWeight) * 100 : 0
                const opacity = ['bg-primary', 'bg-primary/70', 'bg-primary/50', 'bg-primary/30'][i] || 'bg-primary/20'
                return (
                  <div key={b.id} className="space-y-1">
                    <div className="flex justify-between text-body-sm">
                      <span className="font-medium">{b.name}</span>
                      <span className="font-bold">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                      <div className={`h-full ${opacity} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </GlassCard>

          {/* Selling Trends Chart */}
          <GlassCard className="col-span-12 lg:col-span-9 p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface">Selling Trends</h3>
                <p className="text-body-sm text-on-surface-variant">Daily weight totals across all branches</p>
              </div>
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-primary" /><span>Jewelry</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-secondary-container" /><span>Bar</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <XAxis dataKey="entry_date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(8)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()} g`} />
                  <Legend />
                  <Bar dataKey="jewelry" name="Jewelry (g)" fill="#004f96" radius={[2,2,0,0]} />
                  <Bar dataKey="bar"     name="Bar (g)"     fill="#fed65b" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Branch Comparison Table */}
          <GlassCard className="col-span-12 overflow-hidden">
            <div className="p-6 pb-2">
              <h3 className="font-headline-md text-headline-md text-on-surface">Branch Comparison Matrix</h3>
              <p className="text-body-sm text-on-surface-variant">Volume, weight, and contribution metrics</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    {['Branch','Total Weight (g)','Jewelry (g)','Bar (g)','Quantity','% of Total Weight'].map(h => (
                      <th key={h} className="px-6 py-4 font-label-md text-label-md text-on-surface-variant uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-highest">
                  {contrib.map(b => {
                    const pct = totalWeight > 0 ? (b.total_weight / totalWeight) * 100 : 0
                    return (
                      <tr key={b.id} className="hover:bg-surface-container-high/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {b.code}
                            </div>
                            <span className="font-medium">{b.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-tabular-nums font-bold">{b.total_weight.toLocaleString()}</td>
                        <td className="px-6 py-4 font-tabular-nums text-primary">—</td>
                        <td className="px-6 py-4 font-tabular-nums text-secondary">—</td>
                        <td className="px-6 py-4 font-tabular-nums">{b.total_qty.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden max-w-[120px]">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="font-bold text-body-sm">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}
    </AppShell>
  )
}
