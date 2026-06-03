import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { KpiCard } from '../../components/ui/KpiCard'
import { RadialGauge } from '../../components/ui/RadialGauge'
import { GlassCard } from '../../components/ui/GlassCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import type { DashboardStats } from '../../types'

function fmt(n: number, decimals = 1) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtPts(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Multi-select branch dropdown ──────────────────────────────────────────
interface BranchDropdownProps {
  branches: Array<{ id: number; name: string; code: string }>
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

function BranchDropdown({ branches, selectedIds, onChange }: BranchDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const isAll = selectedIds.length === 0
  const label = isAll
    ? 'All Branches'
    : selectedIds.length === 1
    ? branches.find(b => b.id === selectedIds[0])?.name ?? '1 Branch'
    : `${selectedIds.length} Branches`

  function toggleBranch(id: number) {
    if (isAll) { onChange([id]); return }
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    onChange(next.length === branches.length ? [] : next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors border border-white/20 shadow-sm"
      >
        <span className="material-symbols-outlined text-sm text-primary">corporate_fare</span>
        {label}
        <span className="material-symbols-outlined text-sm text-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-52 py-1">
          <label className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer">
            <input type="checkbox" checked={isAll} onChange={() => onChange([])} className="accent-primary rounded" />
            <span className="font-label-md text-label-md">All Branches</span>
          </label>
          <div className="border-t border-black/5 my-1" />
          {branches.map(b => (
            <label key={b.id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-primary/5 cursor-pointer">
              <input
                type="checkbox"
                checked={!isAll && selectedIds.includes(b.id)}
                onChange={() => toggleBranch(b.id)}
                className="accent-primary rounded"
              />
              <span className="font-label-md text-label-md">{b.name}</span>
              <span className="ml-auto text-[10px] text-on-surface-variant font-mono">{b.code}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchIds, selectedYear, selectedMonth, setSelectedBranchIds } = useAppStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  const effectiveBranchIds: number[] = user?.role === 'supervisor'
    ? [user.branchId ?? 1]
    : selectedBranchIds

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getDashboardStats(token, effectiveBranchIds, selectedYear, selectedMonth)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, JSON.stringify(effectiveBranchIds), selectedYear, selectedMonth])

  const s = stats

  // KPI point contribution as % of total point target
  const target = s?.kpiPointTarget ?? 0
  const pctJewelry = target > 0 ? Math.min((s?.kpiScoreJewelry ?? 0) / target * 100, 999) : 0
  const pctBar     = target > 0 ? Math.min((s?.kpiScoreBar     ?? 0) / target * 100, 999) : 0
  const pctQty     = target > 0 ? Math.min((s?.kpiScoreQty     ?? 0) / target * 100, 999) : 0
  const kpiPct     = s?.kpiPct ?? 0

  const scopeLabel = (() => {
    if (user?.role === 'supervisor') return branches.find(b => b.id === user.branchId)?.name ?? 'My Branch'
    if (effectiveBranchIds.length === 0) return 'All Branches'
    if (effectiveBranchIds.length === 1) return branches.find(b => b.id === effectiveBranchIds[0])?.name ?? '1 Branch'
    return `${effectiveBranchIds.length} Branches`
  })()

  return (
    <AppShell title="SalesTrack Pro">
      {/* Page header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Dashboard Overview</h2>
          <p className="text-on-surface-variant text-body-md">
            {MONTH_NAMES[(selectedMonth - 1)]} {selectedYear} — {scopeLabel}
          </p>
        </div>
        {user?.role !== 'supervisor' && branches.length > 0 && (
          <BranchDropdown
            branches={branches}
            selectedIds={selectedBranchIds}
            onChange={setSelectedBranchIds}
          />
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
        </div>
      ) : (
        <>
          {/* ── KPI Hero Cards — raw actuals ── */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-card-gap mb-8">
            <KpiCard
              label="Jewelry Weight (MTD)"
              value={fmt(s?.mtd.total_jewelry ?? 0)}
              unit="g"
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>}
              iconBg="bg-primary-container"
              accentColor="bg-primary"
              barWidth={`${Math.min(pctJewelry, 100)}%`}
            />
            <KpiCard
              label="Bar Weight (MTD)"
              value={fmt(s?.mtd.total_bar ?? 0)}
              unit="g"
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>}
              iconBg="bg-secondary-container"
              accentColor="bg-secondary"
              barWidth={`${Math.min(pctBar, 100)}%`}
            />
            <KpiCard
              label="Quantity (MTD)"
              value={String(s?.mtd.total_qty ?? 0)}
              unit="pcs"
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>inventory_2</span>}
              iconBg="bg-tertiary-container"
              accentColor="bg-tertiary"
              barWidth={`${Math.min(pctQty, 100)}%`}
            />
          </section>

          {/* ── KPI Score Panel + Top Performers ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-card-gap">
            {/* KPI Point Score */}
            <GlassCard className="lg:col-span-5 p-8">
              <div className="flex items-center justify-between mb-6">
                <h4 className="font-headline-md text-headline-md font-bold text-on-surface">KPI Score</h4>
                <span className="px-3 py-1 bg-surface-container-high rounded-full font-label-md text-label-md text-primary">
                  {MONTH_NAMES[(selectedMonth - 1)]} {selectedYear}
                </span>
              </div>

              {/* Total KPI% — big central gauge */}
              <div className="flex flex-col items-center mb-6">
                <RadialGauge pct={Math.min(kpiPct, 100)} label="Total KPI" color="#004f96" size={120} />
                <div className="text-center mt-3">
                  <p className="font-display-xl text-2xl font-bold text-primary tabular-nums">
                    {fmtPts(s?.kpiTotalScore ?? 0)} pts
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    of {fmtPts(target)} target
                    {target > 0 && (
                      <span className="ml-1 font-bold text-primary">{fmt(kpiPct, 1)}%</span>
                    )}
                  </p>
                </div>
              </div>

              {/* 3 metric contribution gauges */}
              <div className="flex justify-around gap-4 mb-6">
                <RadialGauge pct={Math.min(pctJewelry, 100)} label="Jewelry" color="#004f96" />
                <RadialGauge pct={Math.min(pctBar, 100)}     label="Bar"     gold />
                <RadialGauge pct={Math.min(pctQty, 100)}     label="Qty"     color="#17575c" />
              </div>

              {/* Score breakdown */}
              <div className="grid grid-cols-3 gap-3 pt-5 border-t border-outline-variant/20">
                {[
                  { label: 'Jewelry', score: s?.kpiScoreJewelry ?? 0, pct: pctJewelry, color: 'text-primary' },
                  { label: 'Bar',     score: s?.kpiScoreBar     ?? 0, pct: pctBar,     color: 'text-secondary' },
                  { label: 'Qty',     score: s?.kpiScoreQty     ?? 0, pct: pctQty,     color: 'text-tertiary' },
                ].map(k => (
                  <div key={k.label} className="text-center">
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
                    <p className={`font-headline-md font-bold ${k.color} tabular-nums`}>
                      {fmtPts(k.score)}
                    </p>
                    <p className="text-[10px] text-on-surface-variant">{fmt(k.pct, 1)}%</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Top Performers Table */}
            <GlassCard className="lg:col-span-7 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-white/20 flex items-center justify-between">
                <h4 className="font-headline-md text-headline-md font-bold text-on-surface">Top 5 Performers</h4>
                <Link to="/reports" className="text-primary font-label-md text-label-md hover:underline">
                  View All →
                </Link>
              </div>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container/30">
                      {['Sales Member','Position','Jewelry (g)','Bar (g)','Qty','Status'].map(h => (
                        <th key={h} className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(s?.topPerformers ?? []).map((p, i) => {
                      const tier = i === 0 ? 'gold' : i <= 2 ? 'warning' : 'neutral'
                      const tierLabel = i === 0 ? 'Gold Tier' : i <= 2 ? 'Silver Tier' : 'Standard'
                      return (
                        <tr key={p.id} className="hover:bg-surface-variant/20 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold uppercase">
                                {p.full_name.slice(0, 1)}
                              </div>
                              <div>
                                <p className="font-body-md font-semibold text-body-md">{p.full_name}</p>
                                {p.nickname && <p className="text-[10px] text-on-surface-variant">{p.nickname}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-body-sm text-on-surface-variant">{p.position}</td>
                          <td className="px-5 py-3 font-tabular-nums text-tabular-nums">{fmt(p.total_jewelry)}</td>
                          <td className="px-5 py-3 font-tabular-nums text-tabular-nums">{fmt(p.total_bar)}</td>
                          <td className="px-5 py-3 font-tabular-nums text-tabular-nums">{p.total_qty}</td>
                          <td className="px-5 py-3">
                            <StatusBadge label={tierLabel} variant={tier as 'gold' | 'warning' | 'neutral'} />
                          </td>
                        </tr>
                      )
                    })}
                    {!s?.topPerformers?.length && (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant text-body-sm">
                          No entries for this period yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </>
      )}
    </AppShell>
  )
}
