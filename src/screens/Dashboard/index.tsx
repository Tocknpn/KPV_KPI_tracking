import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../../components/layout/AppShell'
import { KpiCard } from '../../components/ui/KpiCard'
import { RadialGauge } from '../../components/ui/RadialGauge'
import { ArcGauge } from '../../components/ui/ArcGauge'
import { GlassCard } from '../../components/ui/GlassCard'
import { KpiSubmissionBanner } from '../../components/ui/KpiSubmissionBanner'
import { useAuthStore } from '../../store/auth.store'
import { useAppStore } from '../../store/app.store'
import { useLanguage } from '../../i18n/LanguageContext'
import { getDefaultDateRange } from '../../utils/dates'
import type { DashboardStats } from '../../types'
import type { TranslationKey } from '../../i18n/translations'

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
  const { t } = useLanguage()
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
    ? t('dash_all_branches')
    : selectedIds.length === 1
    ? branches.find(b => b.id === selectedIds[0])?.name ?? `1 ${t('dash_branch_singular')}`
    : `${selectedIds.length} ${t('dash_branches_suffix')}`

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
            <span className="font-label-md text-label-md">{t('dash_all_branches')}</span>
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

// ── Month picker dropdown ─────────────────────────────────────────────────
interface MonthDropdownProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}

function MonthDropdown({ year, month, onChange }: MonthDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  // Build last 24 months (newest first)
  const options: Array<{ y: number; m: number; label: string }> = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({
      y: d.getFullYear(),
      m: d.getMonth() + 1,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors border border-white/20 shadow-sm"
      >
        <span className="material-symbols-outlined text-sm text-primary">calendar_month</span>
        {MONTH_NAMES[month - 1]} {year}
        <span className="material-symbols-outlined text-sm text-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-44 py-1 max-h-64 overflow-y-auto">
          {options.map(o => (
            <button
              key={`${o.y}-${o.m}`}
              onClick={() => { onChange(o.y, o.m); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 font-label-md text-label-md hover:bg-primary/5 transition-colors ${
                o.y === year && o.m === month ? 'text-primary font-bold' : 'text-on-surface'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Column config for sortable Top 10 table ──────────────────────────────
const PERF_COLS: Array<{ labelKey: TranslationKey; key: string }> = [
  { labelKey: 'dash_col_sales_member', key: 'full_name'        },
  { labelKey: 'dash_col_position',     key: 'position'         },
  { labelKey: 'dash_col_jewelry_baht', key: 'total_jewelry'    },
  { labelKey: 'dash_col_bar_baht',     key: 'total_bar'        },
  { labelKey: 'dash_col_qty',          key: 'total_qty'        },
  { labelKey: 'dash_col_actual_pts',   key: 'kpi_total_score'  },
  { labelKey: 'dash_col_pct_kpi',      key: 'kpi_pct'          },
]

// ── Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { token, user, branches } = useAuthStore()
  const { selectedBranchIds, setSelectedBranchIds, lastSyncedAt } = useAppStore()
  const { t } = useLanguage()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortCol, setSortCol] = useState<string>('kpi_total_score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: string) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(key); setSortDir('desc') }
  }

  // ── Local date state (independent from global app store) ──
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const initRange = getDefaultDateRange(now.getFullYear(), now.getMonth() + 1)
  const [dateFrom, setDateFrom] = useState(initRange.dateFrom)
  const [dateTo, setDateTo]     = useState(initRange.dateTo)

  function handleMonthChange(y: number, m: number) {
    setYear(y)
    setMonth(m)
    const { dateFrom: df, dateTo: dt } = getDefaultDateRange(y, m)
    setDateFrom(df)
    setDateTo(dt)
  }

  // Max allowed dateTo: today for current month, last day of month otherwise
  const maxDateAllowed = getDefaultDateRange(year, month).dateTo

  const effectiveBranchIds: number[] = user?.role === 'sales_sup'
    ? [user.branchId ?? 1]
    : selectedBranchIds

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.api.getDashboardStats(token, effectiveBranchIds, year, month, dateFrom, dateTo)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [token, JSON.stringify(effectiveBranchIds), year, month, dateFrom, dateTo, lastSyncedAt])

  const s = stats

  const sortedPerformers = [...(s?.topPerformers ?? [])].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sortCol]
    const bv = (b as Record<string, unknown>)[sortCol]
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })

  const target      = s?.kpiPointTarget ?? 0
  const pctJewelry  = target > 0 ? Math.min((s?.kpiScoreJewelry ?? 0) / target * 100, 999) : 0
  const pctBar      = target > 0 ? Math.min((s?.kpiScoreBar     ?? 0) / target * 100, 999) : 0
  const pctQty      = target > 0 ? Math.min((s?.kpiScoreQty     ?? 0) / target * 100, 999) : 0
  const kpiPct      = s?.kpiPct ?? 0

  const scopeLabel = (() => {
    if (user?.role === 'sales_sup') return branches.find(b => b.id === user.branchId)?.name ?? t('dash_my_branch')
    if (effectiveBranchIds.length === 0) return t('dash_all_branches')
    if (effectiveBranchIds.length === 1) return branches.find(b => b.id === effectiveBranchIds[0])?.name ?? `1 ${t('dash_branch_singular')}`
    return `${effectiveBranchIds.length} ${t('dash_branches_suffix')}`
  })()

  // Date range label for subtitle
  const rangeLabel = dateFrom === `${year}-${String(month).padStart(2,'0')}-01` && dateTo === maxDateAllowed
    ? null
    : `${dateFrom} → ${dateTo}`

  return (
    <AppShell title="KPV Sale Tracking">
      <KpiSubmissionBanner year={year} month={month} />
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">{t('dash_overview')}</h2>
          <p className="text-on-surface-variant text-body-md">
            {MONTH_NAMES[month - 1]} {year} — {scopeLabel}
            {rangeLabel && <span className="ml-2 text-[11px] font-mono bg-surface-container px-1.5 py-0.5 rounded">{rangeLabel}</span>}
          </p>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch selector */}
          {user?.role !== 'sales_sup' && branches.length > 0 && (
            <BranchDropdown
              branches={branches}
              selectedIds={selectedBranchIds}
              onChange={setSelectedBranchIds}
            />
          )}

          {/* Month picker */}
          <MonthDropdown year={year} month={month} onChange={handleMonthChange} />

          {/* Date range */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container border border-white/20 shadow-sm">
            <span className="material-symbols-outlined text-sm text-primary">date_range</span>
            <input
              type="date"
              value={dateFrom}
              min={`${year}-${String(month).padStart(2,'0')}-01`}
              max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              className="text-label-md font-label-md bg-transparent border-none outline-none text-on-surface w-32"
            />
            <span className="text-on-surface-variant text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={maxDateAllowed}
              onChange={e => setDateTo(e.target.value)}
              className="text-label-md font-label-md bg-transparent border-none outline-none text-on-surface w-32"
            />
          </div>
        </div>
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
              label={t('dash_jewelry_mtd')}
              value={fmt(s?.mtd.total_jewelry ?? 0)}
              unit={t('dash_unit_baht')}
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>}
              iconBg="bg-primary-container"
              accentColor="bg-primary"
              barWidth={`${Math.min(pctJewelry, 100)}%`}
            />
            <KpiCard
              label={t('dash_bar_mtd')}
              value={fmt(s?.mtd.total_bar ?? 0)}
              unit={t('dash_unit_baht')}
              delta={null}
              icon={<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>}
              iconBg="bg-secondary-container"
              accentColor="bg-secondary"
              barWidth={`${Math.min(pctBar, 100)}%`}
            />
            <KpiCard
              label={t('dash_qty_mtd')}
              value={String(s?.mtd.total_qty ?? 0)}
              unit={t('dash_unit_pcs')}
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
                <h4 className="font-headline-md text-headline-md font-bold text-on-surface">{t('dash_kpi_score')}</h4>
                <span className="px-3 py-1 bg-surface-container-high rounded-full font-label-md text-label-md text-primary">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
              </div>

              {/* Total KPI — arc gauge */}
              <div className="flex flex-col items-center mb-2">
                <ArcGauge pct={Math.min(kpiPct, 100)} size={160} />
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mt-1">
                  {t('dash_total_kpi')}
                </p>
                <div className="text-center mt-2">
                  <p className="font-display-xl text-2xl font-bold text-primary tabular-nums">
                    {fmtPts(s?.kpiTotalScore ?? 0)} {t('dash_pts')}
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    {t('dash_of_target')} {fmtPts(target)} {t('dash_target')}
                    {target > 0 && (
                      <span className="ml-1 font-bold text-primary">{fmt(kpiPct, 1)}%</span>
                    )}
                  </p>
                </div>
              </div>

              {/* 3 metric contribution gauges — %Contrib inside, actual pts below name */}
              <div className="flex justify-around gap-4 mt-6 pt-5 border-t border-outline-variant/20">
                <RadialGauge
                  pct={Math.min(pctJewelry, 100)}
                  label={t('dash_jewelry')}
                  color="#990000"
                  subLabel={`${fmtPts(s?.kpiScoreJewelry ?? 0)} ${t('dash_pts')}`}
                />
                <RadialGauge
                  pct={Math.min(pctBar, 100)}
                  label={t('dash_bar')}
                  gold
                  subLabel={`${fmtPts(s?.kpiScoreBar ?? 0)} ${t('dash_pts')}`}
                />
                <RadialGauge
                  pct={Math.min(pctQty, 100)}
                  label={t('dash_qty')}
                  color="#17575c"
                  subLabel={`${fmtPts(s?.kpiScoreQty ?? 0)} ${t('dash_pts')}`}
                />
              </div>
            </GlassCard>

            {/* Top 10 Performers Table */}
            <GlassCard className="lg:col-span-7 overflow-hidden flex flex-col">
              <div className="p-6 border-b border-white/20 flex items-center justify-between">
                <h4 className="font-headline-md text-headline-md font-bold text-on-surface">{t('dash_top10_performers')}</h4>
                <Link to="/reports" className="text-primary font-label-md text-label-md hover:underline">
                  {t('dash_view_all')}
                </Link>
              </div>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container/30">
                      {PERF_COLS.map(col => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="px-5 py-4 font-label-md text-label-md text-on-surface-variant uppercase cursor-pointer select-none hover:text-primary transition-colors"
                        >
                          <span className="inline-flex items-center gap-1">
                            {t(col.labelKey)}
                            {sortCol === col.key
                              ? <span className="material-symbols-outlined text-[14px] text-primary">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                              : <span className="material-symbols-outlined text-[14px] opacity-25">unfold_more</span>
                            }
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {sortedPerformers.map((p) => (
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
                        <td className="px-5 py-3 text-body-sm text-on-surface-variant">{t('dash_sales_rep')}</td>
                        <td className="px-5 py-3 font-tabular-nums text-tabular-nums">{fmt(p.total_jewelry)}</td>
                        <td className="px-5 py-3 font-tabular-nums text-tabular-nums">{fmt(p.total_bar)}</td>
                        <td className="px-5 py-3 font-tabular-nums text-tabular-nums">{p.total_qty}</td>
                        <td className="px-5 py-3 font-tabular-nums text-tabular-nums font-semibold text-primary">
                          {fmtPts(p.kpi_total_score)}
                        </td>
                        <td className="px-5 py-3 font-tabular-nums text-tabular-nums">
                          {fmt(p.kpi_pct, 1)}%
                        </td>
                      </tr>
                    ))}
                    {!s?.topPerformers?.length && (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-on-surface-variant text-body-sm">
                          {t('dash_no_entries')}
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
