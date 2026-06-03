import { useEffect, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip as PieTip, Legend as PieLegend,
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'

interface DailyPoint { entry_date: string; jewelry: number; bar: number; qty: number }
interface BranchContrib { id: number; name: string; code: string; total_weight: number; total_qty: number }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PIE_COLORS = ['#004f96', '#0d7c8f', '#1e9962', '#b07800']

// Group daily data by Sun–Sat weeks; label = "Sun date"
function groupByWeek(daily: DailyPoint[]) {
  const map = new Map<string, { week: string; jewelry: number; bar: number }>()
  for (const d of daily) {
    const date = new Date(d.entry_date + 'T00:00:00')
    const sunday = new Date(date)
    sunday.setDate(date.getDate() - date.getDay())
    const label = `${String(sunday.getMonth() + 1).padStart(2,'0')}/${String(sunday.getDate()).padStart(2,'0')}`
    if (!map.has(label)) map.set(label, { week: label, jewelry: 0, bar: 0 })
    const w = map.get(label)!
    w.jewelry += d.jewelry
    w.bar     += d.bar
  }
  return [...map.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([,v]) => v)
}

export default function Analytics() {
  const { token } = useAuthStore()
  const { selectedYear, selectedMonth, setSelectedPeriod } = useAppStore()
  const [daily, setDaily]   = useState<DailyPoint[]>([])
  const [contrib, setContrib] = useState<BranchContrib[]>([])
  const [loading, setLoading] = useState(true)
  const [trendView, setTrendView] = useState<'day' | 'week'>('day')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getBranchAnalytics(token, selectedYear, selectedMonth)
      .then(data => { setDaily(data.dailyTotals as DailyPoint[]); setContrib(data.branchContrib as BranchContrib[]) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, selectedYear, selectedMonth])

  const totalWeight = contrib.reduce((s, b) => s + b.total_weight, 0)

  // Pie data
  const pieData = contrib.map(b => ({
    name: b.name,
    value: parseFloat((totalWeight > 0 ? (b.total_weight / totalWeight) * 100 : 0).toFixed(1)),
  }))

  // Trend data
  const trendData = trendView === 'day'
    ? daily.map(d => ({ ...d, label: d.entry_date.slice(8) }))
    : groupByWeek(daily).map(w => ({ ...w, label: `W:${w.week}` }))

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
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none"
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={selectedYear}
            onChange={e => setSelectedPeriod(Number(e.target.value), selectedMonth)}
            className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm w-24 outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-card-gap">

          {/* ── Pie Chart: Branch % Contribution ── */}
          <GlassCard className="col-span-12 lg:col-span-4 p-6 flex flex-col">
            <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-4">Branch % Contribution</p>
            <div className="flex-1 min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    outerRadius={90}
                    innerRadius={52}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${value}%`}
                    labelLine={false}
                  >
                    {pieData.map((_e, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <PieTip formatter={(v: number) => `${v}%`} />
                  <PieLegend
                    iconType="circle"
                    iconSize={10}
                    formatter={(value) => (
                      <span className="text-[11px] text-on-surface">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Mini table below pie */}
            <div className="mt-3 space-y-2 border-t border-outline-variant/10 pt-3">
              {contrib.map((b, i) => {
                const pct = totalWeight > 0 ? (b.total_weight / totalWeight) * 100 : 0
                return (
                  <div key={b.id} className="flex justify-between text-body-sm items-center">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-on-surface-variant">{b.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold">{pct.toFixed(1)}%</span>
                      <span className="text-[10px] text-on-surface-variant ml-1">({b.total_weight.toLocaleString()}g)</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </GlassCard>

          {/* ── Line Chart: Selling Trends ── */}
          <GlassCard className="col-span-12 lg:col-span-8 p-6 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface">Selling Trends</h3>
                <p className="text-body-sm text-on-surface-variant">
                  {trendView === 'day' ? 'Daily' : 'Weekly (Sun–Sat)'} weight totals across all branches
                </p>
              </div>
              {/* Day / Week toggle */}
              <div className="flex gap-1 bg-surface-container rounded-xl p-1">
                {(['day', 'week'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setTrendView(v)}
                    className={`px-4 py-1.5 rounded-lg font-label-md text-label-md transition-all capitalize ${trendView === v ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}
                  >
                    {v === 'day' ? 'By Day' : 'By Week'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(1)}k`} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v.toLocaleString()} g`, name]}
                    contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #e0e0e0' }}
                  />
                  <Legend iconType="circle" iconSize={8} />
                  <Line
                    type="monotone"
                    dataKey="jewelry"
                    name="Jewelry (g)"
                    stroke="#004f96"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#004f96' }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bar"
                    name="Bar (g)"
                    stroke="#b07800"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#b07800' }}
                    activeDot={{ r: 5 }}
                    strokeDasharray="5 3"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* ── Branch Comparison Table ── */}
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
                  {contrib.map((b, i) => {
                    const pct = totalWeight > 0 ? (b.total_weight / totalWeight) * 100 : 0
                    return (
                      <tr key={b.id} className="hover:bg-surface-container-high/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}>
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
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
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
