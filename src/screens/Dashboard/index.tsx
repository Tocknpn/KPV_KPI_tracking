import { useEffect, useState } from 'react'
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

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Dashboard() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchId, selectedYear, selectedMonth, setSelectedBranch } = useAppStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Determine effective branch
  const effectiveBranchId = user?.role === 'supervisor'
    ? (user.branchId ?? 1)
    : (selectedBranchId ?? branches[0]?.id ?? 1)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getDashboardStats(token, effectiveBranchId, selectedYear, selectedMonth)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, effectiveBranchId, selectedYear, selectedMonth])

  const pctJewelry = stats && stats.targets.target_jewelry > 0
    ? (stats.mtd.total_jewelry / stats.targets.target_jewelry) * 100 : 0
  const pctBar = stats && stats.targets.target_bar > 0
    ? (stats.mtd.total_bar / stats.targets.target_bar) * 100 : 0
  const pctQty = stats && stats.targets.target_qty > 0
    ? (stats.mtd.total_qty / stats.targets.target_qty) * 100 : 0

  return (
    <AppShell title="SalesTrack Pro">
      {/* Page header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Dashboard Overview</h2>
          <p className="text-on-surface-variant text-body-md">
            {MONTH_NAMES[(selectedMonth - 1)]} {selectedYear} — {
              branches.find(b => b.id === effectiveBranchId)?.name ?? 'All Branches'
            }
          </p>
        </div>
        {/* Branch selector for admin/executive */}
        {user?.role !== 'supervisor' && branches.length > 0 && (
          <div className="flex gap-2">
            {branches.map(b => (
              <button
                key={b.id}
                onClick={() => setSelectedBranch(b.id)}
                className={`px-4 py-1.5 rounded-lg font-label-md text-label-md transition-all ${
                  effectiveBranchId === b.id
                    ? 'bg-primary text-white shadow-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {b.code}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin-slow text-4xl">sync</span>
        </div>
      ) : (
        <>
          {/* ── KPI Hero Cards ── */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-card-gap mb-8">
            <KpiCard
              label="Jewelry Weight (MTD)"
              value={fmt(stats?.mtd.total_jewelry ?? 0)}
              unit="g"
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>}
              iconBg="bg-primary-container"
              accentColor="bg-primary"
              barWidth={`${Math.min(pctJewelry, 100)}%`}
            />
            <KpiCard
              label="Bar Weight (MTD)"
              value={fmt(stats?.mtd.total_bar ?? 0)}
              unit="g"
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>}
              iconBg="bg-secondary-container"
              accentColor="bg-secondary"
              barWidth={`${Math.min(pctBar, 100)}%`}
            />
            <KpiCard
              label="Quantity (MTD)"
              value={String(stats?.mtd.total_qty ?? 0)}
              unit="pcs"
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>inventory_2</span>}
              iconBg="bg-tertiary-container"
              accentColor="bg-tertiary"
              barWidth={`${Math.min(pctQty, 100)}%`}
            />
          </section>

          {/* ── MTD Progress + Top Performers ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-card-gap">
            {/* Radial Gauges */}
            <GlassCard className="lg:col-span-5 p-8">
              <div className="flex items-center justify-between mb-8">
                <h4 className="font-headline-md text-headline-md font-bold text-on-surface">Month to Date % Hit</h4>
                <span className="px-3 py-1 bg-surface-container-high rounded-full font-label-md text-label-md text-primary">
                  {MONTH_NAMES[(selectedMonth - 1)]} {selectedYear}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-around gap-8">
                <RadialGauge pct={pctJewelry} label="Jewelry" color="#004f96" />
                <RadialGauge pct={pctBar}     label="Bar Weight" gold />
                <RadialGauge pct={pctQty}     label="Quantity" color="#17575c" />
              </div>
              {/* KPI Scores */}
              <div className="mt-8 grid grid-cols-3 gap-4 pt-6 border-t border-outline-variant/20">
                {[
                  { label: 'Jewelry Score', score: stats?.kpiScoreJewelry ?? 0, color: 'text-primary' },
                  { label: 'Bar Score',     score: stats?.kpiScoreBar ?? 0,     color: 'text-secondary' },
                  { label: 'Qty Score',     score: stats?.kpiScoreQty ?? 0,     color: 'text-tertiary' },
                ].map(k => (
                  <div key={k.label} className="text-center">
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-1">{k.label}</p>
                    <p className={`font-headline-md text-headline-md font-bold ${k.color} tabular-nums`}>{k.score}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Top Performers Table */}
            <GlassCard className="lg:col-span-7 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-white/20 flex items-center justify-between">
                <h4 className="font-headline-md text-headline-md font-bold text-on-surface">Top 5 Performers</h4>
                <a href="/reports" className="text-primary font-label-md text-label-md hover:underline">
                  View All →
                </a>
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
                    {(stats?.topPerformers ?? []).map((p, i) => {
                      const totalWeight = p.total_jewelry + p.total_bar
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
                    {!stats?.topPerformers?.length && (
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
