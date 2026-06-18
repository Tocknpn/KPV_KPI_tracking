import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import type { KpiMetric } from '../../types'

interface EditableTier { id?: number; threshold_pct: number; score: number }
interface BranchRates { jewelry: { b2c: number; b2b: number }; bar: { b2c: number; b2b: number } }

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DEFAULT_TIERS: EditableTier[] = [
  { threshold_pct: 900, score: 5   }, { threshold_pct: 700, score: 4.5 },
  { threshold_pct: 500, score: 4   }, { threshold_pct: 350, score: 3.5 },
  { threshold_pct: 200, score: 3   }, { threshold_pct: 100, score: 2.5 },
  { threshold_pct: 50,  score: 2   }, { threshold_pct: 1,   score: 1.5 },
]

export default function KpiSettings() {
  const { token, user, branches } = useAuthStore()
  const [metrics, setMetrics] = useState<KpiMetric[]>([])
  const [selectedMetric, setSelectedMetric] = useState<number>(3)
  // KPI Score Config is branch-scoped only — no Global option
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null)
  const [tiers, setTiers] = useState<EditableTier[]>([])
  const [branchRates, setBranchRates] = useState<BranchRates>({ jewelry: { b2c: 0, b2b: 0 }, bar: { b2c: 0, b2b: 0 } })
  const [toast, setToast] = useState('')
  // Global month filter — controls all sections
  const [globalYear, setGlobalYear]   = useState(new Date().getFullYear())
  const [globalMonth, setGlobalMonth] = useState(new Date().getMonth() + 1)
  // Edit Defaults mode (admin only) — Jewelry/Bar rates + Qty tiers operate on the standing
  // values every month silently falls back to, instead of this month's specific override.
  const [editingDefaults, setEditingDefaults] = useState(false)
  const [monthSubmitted, setMonthSubmitted] = useState(true) // assume fine until checked, avoids a flash of the warning on every load
  // Monthly branch KPI targets
  const [monthlyTargets, setMonthlyTargets] = useState<Array<{
    id: number; name: string; code: string; kpi_point_target: number
    monthly_target: number | null; effective_target: number
    target_b2c: number | null; target_b2b: number | null
  }>>([])
  const [targetEdits, setTargetEdits]     = useState<Record<number, string>>({})
  const [targetB2cEdits, setTargetB2cEdits] = useState<Record<number, string>>({})
  const [targetB2bEdits, setTargetB2bEdits] = useState<Record<number, string>>({})
  const [savingTargets, setSavingTargets] = useState(false)
  // Dirty tracking per section
  const [dirtyMult, setDirtyMult]     = useState(false)
  const [dirtyTargets, setDirtyTargets] = useState(false)
  const [dirtyComm, setDirtyComm]     = useState(false)
  const [dirtySupShare, setDirtySupShare] = useState(false)
  const [savingAll, setSavingAll]     = useState(false)
  // Commission rates
  const [commEdits, setCommEdits] = useState<Record<string, { jewelry: string; bar: string; qty: string }>>({
    b2c: { jewelry: '0', bar: '0', qty: '0' },
    b2b: { jewelry: '0', bar: '0', qty: '0' },
  })
  // Supervisor commission share
  const [supShareEdit, setSupShareEdit]   = useState('30')
  // Simulator
  const [simActual, setSimActual] = useState('')
  const [simBranch, setSimBranch] = useState<number | null>(null)
  const [simResult, setSimResult] = useState<{ score: number; pct: number } | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    if (!token) return
    window.api.getKpiMetrics(token).then(setMetrics)
  }, [token])

  // Default to the first branch once the branch list loads — no "Global" option anymore
  useEffect(() => {
    if (selectedBranch === null && branches.length > 0) setSelectedBranch(branches[0].id)
  }, [branches, selectedBranch])

  // Load this branch's jewelry/bar rates + qty tiers AS OF the selected month — editing and
  // saving here only ever affects that month, never rewrites earlier months' scoring. In
  // Edit Defaults mode, load/save the standing values instead (year_month/effective_to NULL
  // — the same rows every month already falls back to when nothing's set for it).
  useEffect(() => {
    if (!token || selectedBranch === null) return
    if (editingDefaults) {
      window.api.getDefaultMetricRates(token, selectedBranch).then((r: BranchRates) => { setBranchRates(r); setDirtyMult(false) })
      window.api.getDefaultQtyTiers(token, selectedBranch).then((r: { configId: number | null; tiers: Array<{ id: number; threshold_pct: number; score: number }> }) => {
        setTiers(r.tiers.length ? r.tiers.map(t => ({ id: t.id, threshold_pct: t.threshold_pct, score: t.score })) : DEFAULT_TIERS)
      })
    } else {
      window.api.getBranchMetricRates(token, selectedBranch, globalYear, globalMonth).then((r: BranchRates) => { setBranchRates(r); setDirtyMult(false) })
      window.api.getBranchQtyTiers(token, selectedBranch, globalYear, globalMonth).then((r: { configId: number | null; tiers: Array<{ id: number; threshold_pct: number; score: number }> }) => {
        setTiers(r.tiers.length ? r.tiers.map(t => ({ id: t.id, threshold_pct: t.threshold_pct, score: t.score })) : DEFAULT_TIERS)
      })
    }
  }, [token, selectedBranch, globalYear, globalMonth, editingDefaults])

  // Has HR confirmed this month's KPI setup yet? Purely informational — scoring already
  // works via the existing fallback chain regardless, this just flags an unconfirmed month.
  useEffect(() => {
    if (!token) return
    window.api.isMonthSubmitted(token, globalYear, globalMonth).then(r => setMonthSubmitted(r.submitted))
  }, [token, globalYear, globalMonth])

  // Load commission configs when global month/year changes
  useEffect(() => {
    if (!token) return
    const yearMonth = `${globalYear}${String(globalMonth).padStart(2, '0')}`
    window.api.getCommissionConfigs(token, yearMonth).then((cfgs: Array<{
      staff_type: string; jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number
    }>) => {
      const next: Record<string, { jewelry: string; bar: string; qty: string }> = {
        b2c: { jewelry: '0', bar: '0', qty: '0' },
        b2b: { jewelry: '0', bar: '0', qty: '0' },
      }
      cfgs.forEach(c => {
        if (c.staff_type === 'supervisor') {
          setSupShareEdit(String(c.jewelry_rate_lak))
        } else {
          next[c.staff_type] = {
            jewelry: String(c.jewelry_rate_lak),
            bar:     String(c.bar_rate_lak),
            qty:     String(c.qty_rate_lak),
          }
        }
      })
      setCommEdits(next)
    }).catch(console.error)
  }, [token, globalYear, globalMonth])

  // Load monthly targets whenever global month/year changes
  useEffect(() => {
    if (!token) return
    window.api.getMonthlyBranchTargets(token, globalYear, globalMonth).then(data => {
      setMonthlyTargets(data)
      setTargetEdits(Object.fromEntries(data.map(b => [b.id, String(b.effective_target)])))
      setTargetB2cEdits(Object.fromEntries(data.map(b => [b.id, String(b.target_b2c ?? '')])))
      setTargetB2bEdits(Object.fromEntries(data.map(b => [b.id, String(b.target_b2b ?? '')])))
      setDirtyTargets(false)
    })
  }, [token, globalYear, globalMonth])

  async function saveMonthlyTargets() {
    if (!token) return
    setSavingTargets(true)
    const targets = monthlyTargets.map(b => ({
      branchId: b.id,
      target: parseFloat(targetEdits[b.id] ?? '') || b.effective_target,
      targetB2c: targetB2cEdits[b.id] ? parseFloat(targetB2cEdits[b.id]) || null : null,
      targetB2b: targetB2bEdits[b.id] ? parseFloat(targetB2bEdits[b.id]) || null : null,
    }))
    await window.api.saveMonthlyBranchTargets(token, globalYear, globalMonth, targets)
    const fresh = await window.api.getMonthlyBranchTargets(token, globalYear, globalMonth)
    setMonthlyTargets(fresh)
    setTargetEdits(Object.fromEntries(fresh.map(b => [b.id, String(b.effective_target)])))
    setTargetB2cEdits(Object.fromEntries(fresh.map(b => [b.id, String(b.target_b2c ?? '')])))
    setTargetB2bEdits(Object.fromEntries(fresh.map(b => [b.id, String(b.target_b2b ?? '')])))
    setSavingTargets(false); setDirtyTargets(false)
  }

  // Single entry point — saves everything on this page in one go (HR does this once a month)
  async function saveAllKpiSettings() {
    if (!token) return
    setSavingAll(true)
    try {
      if (editingDefaults) {
        // Defaults aren't tied to a month — just the standing rates/tiers Admin maintains.
        if (selectedBranch !== null) {
          await window.api.saveDefaultMetricRates(token, selectedBranch, branchRates)
          await window.api.saveDefaultQtyTiers(token, selectedBranch, tiers.map(t => ({ thresholdPct: t.threshold_pct, score: t.score })))
        }
        setDirtyMult(false)
        showToast('Defaults saved.')
        return
      }

      const ym = `${globalYear}${String(globalMonth).padStart(2, '0')}`

      // Jewelry/Bar rates + Qty tiers for the selected branch — scoped to this exact month
      if (selectedBranch !== null) {
        await window.api.saveBranchMetricRates(token, selectedBranch, globalYear, globalMonth, branchRates)
        await window.api.saveBranchQtyTiers(token, selectedBranch, globalYear, globalMonth, tiers.map(t => ({ thresholdPct: t.threshold_pct, score: t.score })))
      }

      // Commission rates — B2C, B2B, and supervisor share
      for (const t of ['b2c', 'b2b'] as const) {
        const e = commEdits[t]; if (!e) continue
        await window.api.saveCommissionConfig(token, { staffType: t, yearMonth: ym, jewelryRateLak: parseFloat(e.jewelry) || 0, barRateLak: parseFloat(e.bar) || 0, qtyRateLak: parseFloat(e.qty) || 0 })
      }
      const supPct = parseFloat(supShareEdit)
      if (!isNaN(supPct) && supPct > 0 && supPct <= 100) {
        await window.api.saveCommissionConfig(token, { staffType: 'supervisor', yearMonth: ym, jewelryRateLak: supPct, barRateLak: 0, qtyRateLak: 0 })
      }

      // Monthly branch KPI point targets
      await saveMonthlyTargets()

      // Marks this month as confirmed regardless of whether anything actually changed —
      // HR clicking Save All is the explicit "I reviewed this month" signal we need, not
      // just the values themselves (which might be identical to last month / defaults).
      await window.api.markMonthSubmitted(token, globalYear, globalMonth)
      setMonthSubmitted(true)

      setDirtyMult(false); setDirtyComm(false); setDirtySupShare(false); setDirtyTargets(false)
      showToast(`All KPI settings saved for ${MONTH_NAMES[globalMonth - 1]} ${globalYear}.`)
    } finally { setSavingAll(false) }
  }

  // Pulls Admin's defaults into every section's editable boxes for the currently selected
  // month/branch — HR reviews/adjusts, then Save All writes them as this month's real values.
  async function useDefaults() {
    if (!token) return
    setTargetEdits(Object.fromEntries(monthlyTargets.map(b => [b.id, String(b.kpi_point_target)])))
    setDirtyTargets(true)
    if (selectedBranch !== null) {
      const [rates, tierResult] = await Promise.all([
        window.api.getDefaultMetricRates(token, selectedBranch),
        window.api.getDefaultQtyTiers(token, selectedBranch),
      ])
      setBranchRates(rates)
      setTiers(tierResult.tiers.length ? tierResult.tiers.map((t: { id: number; threshold_pct: number; score: number }) => ({ id: t.id, threshold_pct: t.threshold_pct, score: t.score })) : DEFAULT_TIERS)
      setDirtyMult(true)
    }
  }

  const selectedMetricObj = metrics.find(m => m.id === selectedMetric)
  const isWeightMetric = (selectedMetricObj?.points_per_unit ?? 0) > 0

  function switchMetric(id: number) {
    setSelectedMetric(id)
    setSimResult(null)
  }

  function addTier() {
    setTiers(prev => [...prev, { threshold_pct: 0, score: 0 }].sort((a, b) => b.threshold_pct - a.threshold_pct))
  }

  function removeTier(i: number) {
    setTiers(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateTier(i: number, field: 'threshold_pct' | 'score', val: string) {
    setTiers(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: parseFloat(val) || 0 }
      return next
    })
  }

  function sortTiers() {
    setTiers(prev => [...prev].sort((a, b) => b.threshold_pct - a.threshold_pct))
  }

  async function simulate() {
    if (!token) return
    const actual = parseFloat(simActual) || 0
    const result = await window.api.simulateKpiScore(token, selectedMetric, simBranch, actual, actual)
    setSimResult(result)
  }

  return (
    <AppShell title="KPI Settings" allowedRoles={['admin','hr']}>
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in font-body-sm">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <nav className="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
            <span>Admin</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">KPI Settings</span>
          </nav>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">KPI Scoring Configuration</h2>
          <p className="text-on-surface-variant text-body-md mt-1">Configure scoring per KPI metric and branch.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-error-container/30 rounded-xl">
          <span className="material-symbols-outlined text-error text-sm">admin_panel_settings</span>
          <span className="font-label-md text-label-md text-error">Admin Only</span>
        </div>
      </div>

      {/* Formula info banner */}
      <GlassCard className="p-4 mb-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-primary text-sm mt-0.5">info</span>
        <div className="text-body-sm text-on-surface-variant space-y-0.5">
          <p><strong className="text-primary">Jewelry Score</strong> = Actual Weight (g) × Points/g multiplier</p>
          <p><strong className="text-secondary">Bar Score</strong> = Actual Weight (g) × Points/g multiplier</p>
          <p><strong className="text-tertiary">Qty Score</strong> = Actual Qty × Tier Multiplier (absolute qty threshold per branch)</p>
          <p className="pt-1 border-t border-black/5 mt-1">
            <strong className="text-on-surface">Total KPI %</strong> = (Jewelry Score + Bar Score + Qty Score) ÷ <em>Branch Point Target</em> × 100
          </p>
        </div>
      </GlassCard>

      {/* Global month / year selector */}
      <GlassCard className="p-4 mb-6 flex flex-wrap items-center gap-4">
        <span className="material-symbols-outlined text-primary text-sm">calendar_month</span>
        <span className="font-label-md text-label-md text-on-surface">Viewing month:</span>
        <select
          value={globalMonth}
          onChange={e => setGlobalMonth(Number(e.target.value))}
          className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none font-bold text-primary"
        >
          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input
          type="number" value={globalYear}
          onChange={e => setGlobalYear(Number(e.target.value))}
          className="bg-surface-container border-none rounded-lg px-3 py-2 text-body-sm outline-none w-24 font-bold text-primary"
        />
        <span className="text-body-sm text-on-surface-variant ml-1">— all sections below reflect this month</span>
        {monthSubmitted ? (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-tertiary uppercase">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            Confirmed
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-secondary uppercase">
            <span className="material-symbols-outlined text-sm">warning</span>
            Not confirmed — click Save All below
          </span>
        )}
      </GlassCard>

      {/* Commission Rates Config — not part of Defaults, hidden while editing them so Save
          All's scope (rates+tiers only, in that mode) isn't ambiguous */}
      {!editingDefaults && <GlassCard elevated className="p-5 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h4 className="font-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary">payments</span>
              Commission Rates (LAK) — {MONTH_NAMES[globalMonth - 1]} {globalYear}
              {(dirtyComm || dirtySupShare) && <span className="text-secondary font-bold text-sm">*</span>}
            </h4>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Rep commission = (Jewelry Baht × rate) + (Bar Baht × rate) + (Qty × rate). Synced to Google Sheets CommissionConfig tab. Shows 0 if no config saved for this month.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['b2c', 'b2b'] as const).map(type => (
            <div key={type} className={`rounded-xl p-5 border ${type === 'b2b' ? 'bg-secondary/5 border-secondary/20' : 'bg-primary/5 border-primary/20'}`}>
              <div className="flex items-center gap-2 mb-4">
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider
                  ${type === 'b2b' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                  {type.toUpperCase()}
                </span>
                <span className="text-on-surface-variant text-body-sm">{MONTH_NAMES[globalMonth - 1]} {globalYear}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { key: 'jewelry' as const, label: 'Jewelry (₭/Baht)' },
                  { key: 'bar'     as const, label: 'Bar (₭/Baht)' },
                  { key: 'qty'     as const, label: 'Qty (₭/pc)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">{label}</label>
                    <input
                      type="number" min="0" step="100"
                      value={commEdits[type]?.[key] ?? ''}
                      onChange={e => { setCommEdits(prev => ({ ...prev, [type]: { ...prev[type], [key]: e.target.value } })); setDirtyComm(true) }}
                      className={`w-full border-b-2 px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold bg-white
                        ${type === 'b2b' ? 'border-secondary text-secondary' : 'border-primary text-primary'}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Supervisor Commission Share */}
        <div className="mt-6 rounded-xl p-5 border bg-secondary/5 border-secondary/20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-secondary text-sm">supervisor_account</span>
                <span className="font-label-md text-label-md text-secondary font-bold">Supervisor Commission Share</span>
                <span className="text-on-surface-variant text-body-sm">{MONTH_NAMES[globalMonth - 1]} {globalYear}</span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Supervisor commission = team's total rep commission × this %. Stored per month. Default 30% if not set.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Share (%)</label>
                <input
                  type="number" min="1" max="100" step="1"
                  value={supShareEdit}
                  onChange={e => { setSupShareEdit(e.target.value); setDirtySupShare(true) }}
                  className="w-28 border-b-2 border-secondary px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold text-secondary bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      </GlassCard>}

      {/* Monthly Branch KPI Point Targets — not part of Defaults, same reason as above */}
      {!editingDefaults && <GlassCard elevated className="p-5 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h4 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">Monthly KPI Point Targets — {MONTH_NAMES[globalMonth - 1]} {globalYear}{dirtyTargets && <span className="text-secondary font-bold text-sm">*</span>}</h4>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              KPI % = (Total Score ÷ Branch Target) × 100 &nbsp;·&nbsp; Targets saved per month
            </p>
          </div>
          <button
            onClick={useDefaults}
            className="text-on-surface-variant border border-outline-variant px-3 py-2 rounded-lg text-body-sm hover:bg-surface-container transition-colors flex items-center gap-1"
            title="Copy branch defaults to this month"
          >
            <span className="material-symbols-outlined text-sm">content_copy</span>
            Use Defaults
          </button>
        </div>

        {/* Per-branch target inputs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {monthlyTargets.map(b => {
            const hasOverride = b.monthly_target !== null
            return (
              <div key={b.id} className={`rounded-xl p-4 border ${hasOverride ? 'bg-primary/5 border-primary/20' : 'bg-surface-container border-transparent'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    {b.code}
                  </div>
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">{b.name}</p>
                    {hasOverride && (
                      <p className="text-[9px] text-primary font-bold uppercase">Monthly override</p>
                    )}
                  </div>
                </div>
                <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">
                  Target (pts/person)
                </label>
                <input
                  type="number" min="100" step="100"
                  value={targetEdits[b.id] ?? b.effective_target}
                  onChange={e => {
                    setTargetEdits(prev => ({ ...prev, [b.id]: e.target.value }))
                    setDirtyTargets(true)
                  }}
                  className="w-full bg-white border-b-2 border-primary px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold text-primary"
                />
                <p className="text-[10px] text-on-surface-variant mt-1.5">
                  Default: <strong>{b.kpi_point_target.toLocaleString()} pts</strong>
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-outline-variant/20">
                  <div>
                    <label className="text-[9px] text-secondary uppercase font-bold block mb-1">B2C Target</label>
                    <input type="number" min="0" step="100"
                      value={targetB2cEdits[b.id] ?? ''}
                      onChange={e => { setTargetB2cEdits(prev => ({ ...prev, [b.id]: e.target.value })); setDirtyTargets(true) }}
                      placeholder="Same as overall"
                      className="w-full bg-white border-b border-secondary/40 px-1.5 py-1 text-[11px] outline-none font-tabular-nums text-secondary" />
                  </div>
                  <div>
                    <label className="text-[9px] text-tertiary uppercase font-bold block mb-1">B2B Target</label>
                    <input type="number" min="0" step="100"
                      value={targetB2bEdits[b.id] ?? ''}
                      onChange={e => { setTargetB2bEdits(prev => ({ ...prev, [b.id]: e.target.value })); setDirtyTargets(true) }}
                      placeholder="Same as overall"
                      className="w-full bg-white border-b border-tertiary/40 px-1.5 py-1 text-[11px] outline-none font-tabular-nums text-tertiary" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-on-surface-variant italic">
          Branches without a monthly override use their default target
        </p>
      </GlassCard>}

      {/* ── KPI Score Config — branch-scoped, no Global option ── */}
      <GlassCard elevated className="p-5 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h4 className="font-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">tune</span>
              KPI Score Config — {editingDefaults ? 'Defaults' : `${MONTH_NAMES[globalMonth - 1]} ${globalYear}`}
              {dirtyMult && <span className="text-secondary font-bold text-sm">*</span>}
            </h4>
            <p className="text-body-sm text-on-surface-variant mt-1">
              {editingDefaults
                ? 'Standing values every month falls back to when nothing\'s set for it — what "Use Defaults" pulls in below.'
                : 'Jewelry, Bar, and Qty rates are set per branch — select a branch below.'}
            </p>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={() => setEditingDefaults(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase transition-colors ${editingDefaults ? 'bg-primary text-white' : 'text-on-surface-variant border border-outline-variant hover:bg-surface-container'}`}
            >
              <span className="material-symbols-outlined text-sm">{editingDefaults ? 'close' : 'tune'}</span>
              {editingDefaults ? 'Exit Defaults Editor' : 'Edit Defaults'}
            </button>
          )}
        </div>

        {/* Branch tabs */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-[11px] text-on-surface-variant uppercase font-bold">Branch:</span>
          {branches.map(b => (
            <button key={b.id} onClick={() => setSelectedBranch(b.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-label-md transition-colors ${selectedBranch === b.id ? 'bg-primary text-white font-bold' : 'text-on-surface-variant hover:bg-surface-container'}`}>
              {b.code}
            </button>
          ))}
        </div>

        {/* Jewelry + Bar, B2C/B2B, for the selected branch */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl p-4 bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-sm">diamond</span>
              <span className="font-label-md text-label-md text-primary font-bold">Jewelry — pts / g</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-secondary uppercase font-bold block mb-1">B2C</label>
                <input type="number" min="0" step="0.5" value={branchRates.jewelry.b2c}
                  onChange={e => { setBranchRates(prev => ({ ...prev, jewelry: { ...prev.jewelry, b2c: parseFloat(e.target.value) || 0 } })); setDirtyMult(true) }}
                  className="w-full border-b-2 border-secondary px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold text-secondary bg-white" />
              </div>
              <div>
                <label className="text-[10px] text-tertiary uppercase font-bold block mb-1">B2B</label>
                <input type="number" min="0" step="0.5" value={branchRates.jewelry.b2b}
                  onChange={e => { setBranchRates(prev => ({ ...prev, jewelry: { ...prev.jewelry, b2b: parseFloat(e.target.value) || 0 } })); setDirtyMult(true) }}
                  className="w-full border-b-2 border-tertiary px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold text-tertiary bg-white" />
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4 bg-secondary/5 border border-secondary/20">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-secondary text-sm">payments</span>
              <span className="font-label-md text-label-md text-secondary font-bold">Bar — pts / g</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-secondary uppercase font-bold block mb-1">B2C</label>
                <input type="number" min="0" step="0.5" value={branchRates.bar.b2c}
                  onChange={e => { setBranchRates(prev => ({ ...prev, bar: { ...prev.bar, b2c: parseFloat(e.target.value) || 0 } })); setDirtyMult(true) }}
                  className="w-full border-b-2 border-secondary px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold text-secondary bg-white" />
              </div>
              <div>
                <label className="text-[10px] text-tertiary uppercase font-bold block mb-1">B2B</label>
                <input type="number" min="0" step="0.5" value={branchRates.bar.b2b}
                  onChange={e => { setBranchRates(prev => ({ ...prev, bar: { ...prev.bar, b2b: parseFloat(e.target.value) || 0 } })); setDirtyMult(true) }}
                  className="w-full border-b-2 border-tertiary px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold text-tertiary bg-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Qty tiers — inline, no profile picker, one set per branch */}
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-tertiary text-sm">inventory_2</span>
          <span className="font-label-md text-label-md text-tertiary font-bold">Qty Tiers</span>
          <span className="text-[10px] text-on-surface-variant">— {branches.find(b => b.id === selectedBranch)?.name ?? ''}</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-outline-variant/20 mb-3">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-5 py-3 text-left font-label-md text-label-md text-on-surface-variant uppercase">#</th>
                <th className="px-5 py-3 text-right font-label-md text-label-md text-on-surface-variant uppercase">If Qty ≥</th>
                <th className="px-5 py-3 text-right font-label-md text-label-md text-on-surface-variant uppercase">Multiplier (×)</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {tiers.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-on-surface-variant text-body-sm">No tiers. Click "Add Tier".</td></tr>
              ) : tiers.map((tier, i) => (
                <tr key={i} className="hover:bg-primary/[0.02] transition-colors group">
                  <td className="px-5 py-2.5 font-bold text-on-surface-variant text-body-sm">{i + 1}</td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-on-surface-variant text-body-sm">≥</span>
                      <input type="number" min="0" step="1" value={tier.threshold_pct} onChange={e => updateTier(i, 'threshold_pct', e.target.value)}
                        className="w-24 text-right bg-surface-container border-none rounded px-2 py-1 font-tabular-nums text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                      <span className="text-on-surface-variant text-body-sm">pcs</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-on-surface-variant text-body-sm">×</span>
                      <input type="number" min="0" step="0.5" value={tier.score} onChange={e => updateTier(i, 'score', e.target.value)}
                        className="w-24 text-right bg-surface-container border-none rounded px-2 py-1 font-tabular-nums font-bold text-primary text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => removeTier(i)} className="opacity-0 group-hover:opacity-100 text-error hover:bg-error-container p-1 rounded transition-all">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={sortTiers} className="text-on-surface-variant border border-outline-variant px-3 py-2 rounded-lg text-body-sm hover:bg-surface-container flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">sort</span> Sort
          </button>
          <button onClick={addTier} className="bg-primary/10 text-primary px-3 py-2 rounded-lg font-label-md text-label-md flex items-center gap-1 hover:bg-primary/20 transition-colors">
            <span className="material-symbols-outlined text-sm">add</span> Add Tier
          </button>
        </div>
      </GlassCard>

      {/* Single Save All button — saves Commission Rates, Sup Share, Monthly Targets, and
          Jewelry/Bar Multipliers together for the selected month. Always visible. */}
      <div className="sticky bottom-6 z-20 flex justify-end mb-4">
        <button onClick={saveAllKpiSettings} disabled={savingAll}
          className="flex items-center gap-3 px-8 py-3 bg-primary text-white rounded-2xl font-label-md text-label-md shadow-2xl shadow-primary/30 hover:opacity-90 disabled:opacity-60 transition-all">
          <span className={`material-symbols-outlined text-sm ${savingAll ? 'animate-spin-slow' : ''}`}>{savingAll ? 'sync' : 'save'}</span>
          {savingAll ? 'Saving…' : editingDefaults ? 'Save Defaults' : `Save All — ${MONTH_NAMES[globalMonth - 1]} ${globalYear}`}
        </button>
      </div>

      {/* Score Simulator */}
      <GlassCard className="p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-secondary">calculate</span>
              <h4 className="font-headline-md text-headline-md text-on-surface !text-lg">Score Simulator</h4>
            </div>
            <div className="flex bg-surface-container rounded-lg p-0.5 w-fit mb-4">
              {metrics.map(m => (
                <button key={m.id} onClick={() => switchMetric(m.id)}
                  className={`px-3 py-1.5 rounded-md font-label-md text-[11px] transition-all ${selectedMetric === m.id ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:text-primary'}`}>
                  {m.name}
                </button>
              ))}
            </div>
            <p className="text-body-sm text-on-surface-variant mb-4">
              {isWeightMetric
                ? `Enter actual weight to preview: weight × ${selectedMetricObj?.points_per_unit} pts`
                : 'Enter actual qty to preview score from current tier table.'}
            </p>
            <div className="flex gap-4 items-end flex-wrap">
              <div>
                <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">
                  Actual ({selectedMetricObj?.unit})
                </label>
                <input
                  type="number" value={simActual} onChange={e => setSimActual(e.target.value)}
                  className="bg-surface-container border-b-2 border-primary px-3 py-2 w-32 outline-none font-tabular-nums"
                  placeholder="e.g. 500"
                />
              </div>
              {!isWeightMetric && (
                <div>
                  <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Branch</label>
                  <select
                    value={simBranch ?? ''}
                    onChange={e => setSimBranch(e.target.value ? Number(e.target.value) : null)}
                    className="bg-surface-container border-b-2 border-primary px-3 py-2 outline-none text-body-sm"
                  >
                    <option value="">Global</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <button
                onClick={simulate}
                className="bg-secondary text-white px-5 py-2.5 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">play_arrow</span>
                Simulate
              </button>
              {simResult && (
                <div className="ml-4 bg-primary/10 px-5 py-2.5 rounded-xl">
                  <p className="text-[10px] text-primary uppercase font-bold">Result</p>
                  <p className="font-display-xl text-[28px] text-primary tabular-nums">
                    {simResult.score.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                    <span className="text-label-md ml-1">pts</span>
                  </p>
                  {!isWeightMetric && (
                    <p className="text-[10px] text-on-surface-variant">{simResult.pct.toFixed(1)}% of target</p>
                  )}
                </div>
              )}
            </div>
      </GlassCard>
    </AppShell>
  )
}
