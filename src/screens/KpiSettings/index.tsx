import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import type { KpiMetric } from '../../types'

interface EditableTier { id?: number; threshold_pct: number; score: number }
interface BranchRates { jewelry: { b2c: number; b2b: number }; bar: { b2c: number; b2b: number } }
const EMPTY_RATES: BranchRates = { jewelry: { b2c: 0, b2b: 0 }, bar: { b2c: 0, b2b: 0 } }

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
  const [toast, setToast] = useState('')
  // Global month filter — controls all sections
  const [globalYear, setGlobalYear]   = useState(new Date().getFullYear())
  const [globalMonth, setGlobalMonth] = useState(new Date().getMonth() + 1)
  // Edit Defaults mode (admin only) — Jewelry/Bar rates + Qty tiers operate on the standing
  // values every month silently falls back to, instead of this month's specific override.
  // Admin sets up Defaults only; HR submits Monthly KPI only — not a toggle, a fixed split
  // by role. Admin never sees Commission/Monthly Targets; HR never sees the raw Defaults editor.
  const isAdmin = user?.role === 'admin'

  // Per-branch draft cache for rates/tiers — keyed by branch + (Defaults vs this exact
  // month), so switching branch tabs never loses an unsaved edit by re-fetching over it.
  // Previously this was flat single state: switching MM -> IT -> MM re-fetched MM fresh
  // and silently discarded whatever was typed, and Save only ever persisted whichever
  // branch happened to be selected at click time — every other branch's edits were lost
  // before Save was even pressed.
  function draftKey(branchId: number): string {
    return isAdmin ? `def:${branchId}` : `${globalYear}-${globalMonth}:${branchId}`
  }
  const [ratesDrafts, setRatesDrafts] = useState<Record<string, BranchRates>>({})
  const [tiersB2cDrafts, setTiersB2cDrafts] = useState<Record<string, EditableTier[]>>({})
  const [tiersB2bDrafts, setTiersB2bDrafts] = useState<Record<string, EditableTier[]>>({})
  const [monthSubmitted, setMonthSubmitted] = useState(true) // assume fine until checked, avoids a flash of the warning on every load
  // Branch Point Target Defaults — required B2C + B2B per branch, no combined number anymore.
  // Backed by branches.target_b2c_default/target_b2b_default — flat columns, no month concept.
  const [branchTargetB2cDefaults, setBranchTargetB2cDefaults] = useState<Record<number, string>>({})
  const [branchTargetB2bDefaults, setBranchTargetB2bDefaults] = useState<Record<number, string>>({})
  // Monthly branch KPI targets
  const [monthlyTargets, setMonthlyTargets] = useState<Array<{
    id: number; name: string; code: string; kpi_point_target: number
    target_b2c_default: number | null; target_b2b_default: number | null
    monthly_target: number | null; effective_target: number
    target_b2c: number | null; target_b2b: number | null
  }>>([])
  const [targetB2cEdits, setTargetB2cEdits] = useState<Record<number, string>>({})
  const [targetB2bEdits, setTargetB2bEdits] = useState<Record<number, string>>({})
  const [savingTargets, setSavingTargets] = useState(false)
  // Dirty tracking per section
  const [dirtyMult, setDirtyMult]     = useState(false)
  const [dirtyTargets, setDirtyTargets] = useState(false)
  const [dirtyComm, setDirtyComm]     = useState(false)
  const [dirtySupShare, setDirtySupShare] = useState(false)
  const [savingAll, setSavingAll]     = useState(false)
  // Commission Rate Defaults — Admin-only, not month-scoped (see commission.ts's
  // DEFAULTS_YM sentinel). Supervisor share is per staff_type now, not one shared number.
  const [commEdits, setCommEdits] = useState<Record<string, { jewelry: string; bar: string; qty: string }>>({
    b2c: { jewelry: '0', bar: '0', qty: '0' },
    b2b: { jewelry: '0', bar: '0', qty: '0' },
  })
  const [supShareB2cEdit, setSupShareB2cEdit] = useState('30')
  const [supShareB2bEdit, setSupShareB2bEdit] = useState('30')
  // Simulator
  const [simActual, setSimActual] = useState('')
  const [simBranch, setSimBranch] = useState<number | null>(null)
  const [simStaffType, setSimStaffType] = useState<'b2c' | 'b2b'>('b2c')
  const [simResult, setSimResult] = useState<{ score: number; pct: number } | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  // What the currently-selected branch's tab shows — reads from the draft cache, never
  // straight from a fetch, so it reflects whatever was last typed for this branch.
  const currentKey   = selectedBranch !== null ? draftKey(selectedBranch) : null
  const branchRates  = currentKey ? (ratesDrafts[currentKey] ?? EMPTY_RATES) : EMPTY_RATES
  const tiersB2c     = currentKey ? (tiersB2cDrafts[currentKey] ?? []) : []
  const tiersB2b     = currentKey ? (tiersB2bDrafts[currentKey] ?? []) : []

  function setBranchRates(updater: BranchRates | ((prev: BranchRates) => BranchRates)) {
    if (selectedBranch === null) return
    const key = draftKey(selectedBranch)
    setRatesDrafts(prev => {
      const current = prev[key] ?? EMPTY_RATES
      const next = typeof updater === 'function' ? (updater as (p: BranchRates) => BranchRates)(current) : updater
      return { ...prev, [key]: next }
    })
  }

  function setTiersForType(type: 'b2c' | 'b2b', updater: (prev: EditableTier[]) => EditableTier[]) {
    if (selectedBranch === null) return
    const key = draftKey(selectedBranch)
    const setDrafts = type === 'b2c' ? setTiersB2cDrafts : setTiersB2bDrafts
    setDrafts(prev => ({ ...prev, [key]: updater(prev[key] ?? []) }))
  }

  useEffect(() => {
    if (!token) return
    window.api.getKpiMetrics(token).then(setMetrics)
  }, [token])

  // Default to the first branch once the branch list loads — no "Global" option anymore
  useEffect(() => {
    if (selectedBranch === null && branches.length > 0) setSelectedBranch(branches[0].id)
  }, [branches, selectedBranch])

  // Load EVERY branch's jewelry/bar rates + qty tiers for the current scope (Defaults, or
  // this exact month) up front — not just whichever branch tab happens to be open. Loading
  // lazily per-tab-click meant Save All only ever covered branches someone actually clicked
  // into; a branch nobody opened that month silently never got saved, with no indication
  // anything was skipped. Each fetch still only fires once per branch+scope (skipped if
  // already cached), so switching tabs back and forth never re-fetches over an edit.
  useEffect(() => {
    if (!token || branches.length === 0) return
    const toTiers = (r: { tiers: Array<{ id: number; threshold_pct: number; score: number }> }) =>
      r.tiers.length ? r.tiers.map(t => ({ id: t.id, threshold_pct: t.threshold_pct, score: t.score })) : DEFAULT_TIERS
    for (const b of branches) {
      const key = draftKey(b.id)
      if (isAdmin) {
        if (!(key in ratesDrafts)) window.api.getDefaultMetricRates(token, b.id).then((r: BranchRates) => setRatesDrafts(prev => ({ ...prev, [key]: r })))
        if (!(key in tiersB2cDrafts)) window.api.getDefaultQtyTiers(token, b.id, 'b2c').then(r => setTiersB2cDrafts(prev => ({ ...prev, [key]: toTiers(r) })))
        if (!(key in tiersB2bDrafts)) window.api.getDefaultQtyTiers(token, b.id, 'b2b').then(r => setTiersB2bDrafts(prev => ({ ...prev, [key]: toTiers(r) })))
      } else {
        if (!(key in ratesDrafts)) window.api.getBranchMetricRates(token, b.id, globalYear, globalMonth).then((r: BranchRates) => setRatesDrafts(prev => ({ ...prev, [key]: r })))
        if (!(key in tiersB2cDrafts)) window.api.getBranchQtyTiers(token, b.id, globalYear, globalMonth, 'b2c').then(r => setTiersB2cDrafts(prev => ({ ...prev, [key]: toTiers(r) })))
        if (!(key in tiersB2bDrafts)) window.api.getBranchQtyTiers(token, b.id, globalYear, globalMonth, 'b2b').then(r => setTiersB2bDrafts(prev => ({ ...prev, [key]: toTiers(r) })))
      }
    }
  }, [token, branches, globalYear, globalMonth, isAdmin])

  // Seed the Branch Point Target Defaults editor from the current branches list — branches
  // already carries target_b2c_default/target_b2b_default, no extra fetch needed.
  useEffect(() => {
    if (!isAdmin) return
    setBranchTargetB2cDefaults(Object.fromEntries(branches.map(b => [b.id, String(b.target_b2c_default ?? b.kpi_point_target)])))
    setBranchTargetB2bDefaults(Object.fromEntries(branches.map(b => [b.id, String(b.target_b2b_default ?? b.kpi_point_target)])))
  }, [isAdmin, branches])

  // Has HR confirmed this month's KPI setup yet? Purely informational — scoring already
  // works via the existing fallback chain regardless, this just flags an unconfirmed month.
  useEffect(() => {
    if (!token) return
    window.api.isMonthSubmitted(token, globalYear, globalMonth).then(r => setMonthSubmitted(r.submitted))
  }, [token, globalYear, globalMonth])

  // Commission — Admin edits Defaults (not month-scoped); HR records this exact month,
  // same as rates/tiers/targets. Both write the same commission_configs table, just at a
  // different year_month (Admin's is the '000000' sentinel every month falls back to).
  useEffect(() => {
    if (!token) return
    if (isAdmin) {
      window.api.getCommissionDefaults(token).then(d => {
        setCommEdits({
          b2c: { jewelry: String(d.b2c.jewelry), bar: String(d.b2c.bar), qty: String(d.b2c.qty) },
          b2b: { jewelry: String(d.b2b.jewelry), bar: String(d.b2b.bar), qty: String(d.b2b.qty) },
        })
        setSupShareB2cEdit(String(d.supB2cPct))
        setSupShareB2bEdit(String(d.supB2bPct))
      }).catch(console.error)
    } else {
      const yearMonth = `${globalYear}${String(globalMonth).padStart(2, '0')}`
      window.api.getCommissionConfigs(token, yearMonth).then((cfgs: Array<{
        staff_type: string; jewelry_rate_lak: number; bar_rate_lak: number; qty_rate_lak: number
      }>) => {
        const next = {
          b2c: { jewelry: '0', bar: '0', qty: '0' },
          b2b: { jewelry: '0', bar: '0', qty: '0' },
        }
        let supB2c = '30'; let supB2b = '30'
        cfgs.forEach(c => {
          if (c.staff_type === 'supervisor_b2c') supB2c = String(c.jewelry_rate_lak)
          else if (c.staff_type === 'supervisor_b2b') supB2b = String(c.jewelry_rate_lak)
          // Legacy single 'supervisor' row (from before the B2C/B2B split) — apply to both
          // until this month gets its own split values saved.
          else if (c.staff_type === 'supervisor') { supB2c = String(c.jewelry_rate_lak); supB2b = String(c.jewelry_rate_lak) }
          else if (c.staff_type === 'b2c' || c.staff_type === 'b2b') {
            next[c.staff_type] = { jewelry: String(c.jewelry_rate_lak), bar: String(c.bar_rate_lak), qty: String(c.qty_rate_lak) }
          }
        })
        setCommEdits(next)
        setSupShareB2cEdit(supB2c)
        setSupShareB2bEdit(supB2b)
      }).catch(console.error)
    }
  }, [token, isAdmin, globalYear, globalMonth])

  // Load monthly targets whenever global month/year changes
  useEffect(() => {
    if (!token) return
    window.api.getMonthlyBranchTargets(token, globalYear, globalMonth).then(data => {
      setMonthlyTargets(data)
      // B2C/B2B are required every month now — pre-fill from each branch's own default when
      // nothing's been explicitly set yet, instead of leaving blank.
      setTargetB2cEdits(Object.fromEntries(data.map(b => [b.id, String(b.target_b2c ?? b.target_b2c_default ?? b.effective_target)])))
      setTargetB2bEdits(Object.fromEntries(data.map(b => [b.id, String(b.target_b2b ?? b.target_b2b_default ?? b.effective_target)])))
      setDirtyTargets(false)
    })
  }, [token, globalYear, globalMonth])

  async function saveMonthlyTargets() {
    if (!token) return
    setSavingTargets(true)
    const targets = monthlyTargets.map(b => ({
      branchId: b.id,
      // Overall target is no longer editable here — Admin maintains it via Defaults, so it
      // always stays whatever the branch's current default is, every month.
      target: b.effective_target,
      // Required fields now — always resolve to a real number, falling back to this
      // branch's own default rather than null, since "leave blank to inherit" is gone.
      targetB2c: parseFloat(targetB2cEdits[b.id] ?? '') || (b.target_b2c_default ?? b.effective_target),
      targetB2b: parseFloat(targetB2bEdits[b.id] ?? '') || (b.target_b2b_default ?? b.effective_target),
    }))
    await window.api.saveMonthlyBranchTargets(token, globalYear, globalMonth, targets)
    const fresh = await window.api.getMonthlyBranchTargets(token, globalYear, globalMonth)
    setMonthlyTargets(fresh)
    setTargetB2cEdits(Object.fromEntries(fresh.map(b => [b.id, String(b.target_b2c ?? '')])))
    setTargetB2bEdits(Object.fromEntries(fresh.map(b => [b.id, String(b.target_b2b ?? '')])))
    setSavingTargets(false); setDirtyTargets(false)
  }

  // Single entry point — saves everything on this page in one go (HR does this once a month)
  async function saveAllKpiSettings() {
    if (!token) return
    setSavingAll(true)
    try {
      if (isAdmin) {
        // Defaults aren't tied to a month — the standing rates/tiers/targets/commission
        // Admin maintains. All four KPI-setup tables now have a "standing" concept.
        // Saves EVERY branch that has a draft in the cache, not just the one currently
        // selected — switching branch tabs before clicking Save must not lose anything.
        for (const b of branches) {
          const key = draftKey(b.id)
          if (key in ratesDrafts) await window.api.saveDefaultMetricRates(token, b.id, ratesDrafts[key])
          if (key in tiersB2cDrafts) await window.api.saveDefaultQtyTiers(token, b.id, tiersB2cDrafts[key].map(t => ({ thresholdPct: t.threshold_pct, score: t.score })), 'b2c')
          if (key in tiersB2bDrafts) await window.api.saveDefaultQtyTiers(token, b.id, tiersB2bDrafts[key].map(t => ({ thresholdPct: t.threshold_pct, score: t.score })), 'b2b')
        }
        for (const b of branches) {
          const valB2c = parseFloat(branchTargetB2cDefaults[b.id] ?? '')
          const valB2b = parseFloat(branchTargetB2bDefaults[b.id] ?? '')
          if (!isNaN(valB2c) && !isNaN(valB2b) && valB2c > 0 && valB2b > 0
            && (valB2c !== b.target_b2c_default || valB2b !== b.target_b2b_default)) {
            await window.api.saveBranchTargetDefaults(token, b.id, valB2c, valB2b)
          }
        }
        const supB2c = parseFloat(supShareB2cEdit); const supB2b = parseFloat(supShareB2bEdit)
        await window.api.saveCommissionDefaults(token, {
          b2c: { jewelry: parseFloat(commEdits.b2c?.jewelry) || 0, bar: parseFloat(commEdits.b2c?.bar) || 0, qty: parseFloat(commEdits.b2c?.qty) || 0 },
          b2b: { jewelry: parseFloat(commEdits.b2b?.jewelry) || 0, bar: parseFloat(commEdits.b2b?.bar) || 0, qty: parseFloat(commEdits.b2b?.qty) || 0 },
          supB2cPct: !isNaN(supB2c) && supB2c > 0 && supB2c <= 100 ? supB2c : 30,
          supB2bPct: !isNaN(supB2b) && supB2b > 0 && supB2b <= 100 ? supB2b : 30,
        })
        setDirtyMult(false); setDirtyComm(false); setDirtySupShare(false)
        showToast('Defaults saved.')
        return
      }

      // Jewelry/Bar rates + Qty tiers — scoped to this exact month, every branch with a draft
      for (const b of branches) {
        const key = draftKey(b.id)
        if (key in ratesDrafts) await window.api.saveBranchMetricRates(token, b.id, globalYear, globalMonth, ratesDrafts[key])
        if (key in tiersB2cDrafts) await window.api.saveBranchQtyTiers(token, b.id, globalYear, globalMonth, tiersB2cDrafts[key].map(t => ({ thresholdPct: t.threshold_pct, score: t.score })), 'b2c')
        if (key in tiersB2bDrafts) await window.api.saveBranchQtyTiers(token, b.id, globalYear, globalMonth, tiersB2bDrafts[key].map(t => ({ thresholdPct: t.threshold_pct, score: t.score })), 'b2b')
      }

      // Commission rates — B2C, B2B, and per-type supervisor share, scoped to this month
      const ym = `${globalYear}${String(globalMonth).padStart(2, '0')}`
      for (const t of ['b2c', 'b2b'] as const) {
        const e = commEdits[t]; if (!e) continue
        await window.api.saveCommissionConfig(token, { staffType: t, yearMonth: ym, jewelryRateLak: parseFloat(e.jewelry) || 0, barRateLak: parseFloat(e.bar) || 0, qtyRateLak: parseFloat(e.qty) || 0 })
      }
      const supB2c = parseFloat(supShareB2cEdit); const supB2b = parseFloat(supShareB2bEdit)
      if (!isNaN(supB2c) && supB2c > 0 && supB2c <= 100) {
        await window.api.saveCommissionConfig(token, { staffType: 'supervisor_b2c', yearMonth: ym, jewelryRateLak: supB2c, barRateLak: 0, qtyRateLak: 0 })
      }
      if (!isNaN(supB2b) && supB2b > 0 && supB2b <= 100) {
        await window.api.saveCommissionConfig(token, { staffType: 'supervisor_b2b', yearMonth: ym, jewelryRateLak: supB2b, barRateLak: 0, qtyRateLak: 0 })
      }

      // Monthly branch KPI point targets
      await saveMonthlyTargets()

      // Marks this month as confirmed regardless of whether anything actually changed —
      // HR clicking Save All is the explicit "I reviewed this month" signal we need, not
      // just the values themselves (which might be identical to last month / defaults).
      const submitResult = await window.api.markMonthSubmitted(token, globalYear, globalMonth)
      setMonthSubmitted(true)

      setDirtyMult(false); setDirtyComm(false); setDirtySupShare(false); setDirtyTargets(false)
      // submitResult.synced === false means the local save succeeded but the push to
      // Google Sheets failed (network/auth issue) — flag it loudly instead of saying "saved"
      // when other devices/reports reading the Sheet directly won't see this confirmation.
      if (submitResult?.synced === false) {
        showToast(`Saved locally, but NOT synced to Google Sheets: ${submitResult.syncError ?? 'unknown error'}. Click Save All again once connection is restored.`)
      } else {
        showToast(`All KPI settings saved for ${MONTH_NAMES[globalMonth - 1]} ${globalYear}.`)
      }
    } catch (e) {
      showToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setSavingAll(false) }
  }

  // Pulls Admin's defaults into every section's editable boxes for the currently selected
  // month/branch — HR reviews/adjusts, then Save All writes them as this month's real values.
  async function useDefaults() {
    if (!token) return
    // Pull each branch's own B2C/B2B default — set by Admin in Branch Point Target Defaults.
    setTargetB2cEdits(Object.fromEntries(monthlyTargets.map(b => [b.id, String(b.target_b2c_default ?? b.kpi_point_target)])))
    setTargetB2bEdits(Object.fromEntries(monthlyTargets.map(b => [b.id, String(b.target_b2b_default ?? b.kpi_point_target)])))
    setDirtyTargets(true)
    if (selectedBranch !== null) {
      const toTiers = (r: { tiers: Array<{ id: number; threshold_pct: number; score: number }> }) =>
        r.tiers.length ? r.tiers.map(t => ({ id: t.id, threshold_pct: t.threshold_pct, score: t.score })) : DEFAULT_TIERS
      const [rates, tierB2c, tierB2b] = await Promise.all([
        window.api.getDefaultMetricRates(token, selectedBranch),
        window.api.getDefaultQtyTiers(token, selectedBranch, 'b2c'),
        window.api.getDefaultQtyTiers(token, selectedBranch, 'b2b'),
      ])
      setBranchRates(rates)
      setTiersForType('b2c', () => toTiers(tierB2c))
      setTiersForType('b2b', () => toTiers(tierB2b))
      setDirtyMult(true)
    }
  }

  const selectedMetricObj = metrics.find(m => m.id === selectedMetric)
  const isWeightMetric = (selectedMetricObj?.points_per_unit ?? 0) > 0

  function switchMetric(id: number) {
    setSelectedMetric(id)
    setSimResult(null)
  }

  function addTier(type: 'b2c' | 'b2b') {
    setTiersForType(type, prev => [...prev, { threshold_pct: 0, score: 0 }].sort((a, b) => b.threshold_pct - a.threshold_pct))
  }

  function removeTier(type: 'b2c' | 'b2b', i: number) {
    setTiersForType(type, prev => prev.filter((_, idx) => idx !== i))
  }

  function updateTier(type: 'b2c' | 'b2b', i: number, field: 'threshold_pct' | 'score', val: string) {
    setTiersForType(type, prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: parseFloat(val) || 0 }
      return next
    })
  }

  function sortTiers(type: 'b2c' | 'b2b') {
    setTiersForType(type, prev => [...prev].sort((a, b) => b.threshold_pct - a.threshold_pct))
  }

  async function simulate() {
    if (!token) return
    const actual = parseFloat(simActual) || 0
    const result = await window.api.simulateKpiScore(token, selectedMetric, simBranch, actual, actual, simStaffType)
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

      {/* Global month / year selector — meaningless for Admin: Defaults have no month
          concept (standing year_month/effective_to NULL rows, same regardless of what's
          picked here), so this whole card + the Confirmed/Not Confirmed status is HR-only. */}
      {!isAdmin && <GlassCard className="p-4 mb-6 flex flex-wrap items-center gap-4">
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
        {/* "Confirmed" reflects HR's local Save All + the auto-push that fires right after
            it — it does not re-check the Sheet itself (the push is fire-and-forget and
            swallows failures), so the wording says "saved & synced" rather than overclaiming
            a live verification that doesn't happen. */}
        {monthSubmitted ? (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-tertiary uppercase">
            <span className="material-symbols-outlined text-sm">cloud_done</span>
            {MONTH_NAMES[globalMonth - 1]} {globalYear} confirmed — saved & synced to Google Sheets
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-secondary uppercase">
            <span className="material-symbols-outlined text-sm">warning</span>
            Not confirmed — click Save All below to confirm and sync {MONTH_NAMES[globalMonth - 1]} {globalYear}
          </span>
        )}
      </GlassCard>}

      {/* Commission — Admin edits Defaults (Standing, no month concept); HR records this
          exact month, same as rates/tiers/targets. Both roles share this card, the
          load/save effects just point at a different scope underneath. */}
      {(
        <GlassCard elevated className="p-5 mb-6">
          <h4 className="font-headline-md text-on-surface flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-tertiary">payments</span>
            {isAdmin ? 'Commission Rate Defaults' : `Commission Rates — ${MONTH_NAMES[globalMonth - 1]} ${globalYear}`}
            {(dirtyComm || dirtySupShare) && <span className="text-secondary font-bold text-sm">*</span>}
          </h4>
          <p className="text-body-sm text-on-surface-variant mb-4">
            Rep commission = (Jewelry Baht × rate) + (Bar Baht × rate) + (Qty × rate).
            {isAdmin ? ' Applies to any month that\'s never had its own override.' : ' Saved for this month only — use Save All below.'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['b2c', 'b2b'] as const).map(type => (
              <div key={type} className={`rounded-xl p-5 border ${type === 'b2b' ? 'bg-secondary/5 border-secondary/20' : 'bg-primary/5 border-primary/20'}`}>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider inline-block mb-4
                  ${type === 'b2b' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                  {type.toUpperCase()}
                </span>
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
                <label className="text-[10px] text-on-surface-variant uppercase font-bold block mb-1">Supervisor Share (%)</label>
                <input
                  type="number" min="1" max="100" step="1"
                  value={type === 'b2c' ? supShareB2cEdit : supShareB2bEdit}
                  onChange={e => { (type === 'b2c' ? setSupShareB2cEdit : setSupShareB2bEdit)(e.target.value); setDirtySupShare(true) }}
                  className={`w-28 border-b-2 px-2 py-1.5 text-body-sm outline-none font-tabular-nums font-bold bg-white
                    ${type === 'b2b' ? 'border-secondary text-secondary' : 'border-primary text-primary'}`}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-on-surface-variant/60 mt-3 italic">
            Supervisor commission = team's total rep commission × this %, scoped to the supervisor's own team type (B2C team uses B2C share, B2B team uses B2B share).
          </p>
        </GlassCard>
      )}

      {/* Branch Point Target Defaults — required B2C + B2B per branch, no combined number.
          Backed directly by branches.target_b2c_default/target_b2b_default — same numbers
          Monthly Targets' "Use Defaults" pulls from. */}
      {isAdmin && (
        <GlassCard elevated className="p-5 mb-6">
          <h4 className="font-headline-md text-on-surface flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary">flag</span>
            Branch Point Target Defaults
          </h4>
          <p className="text-body-sm text-on-surface-variant mb-4">
            The standing target per branch, required for both B2C and B2B — what every month uses unless overridden, and what "Use Defaults" fills in below.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {branches.map(b => (
              <div key={b.id} className="rounded-xl p-4 bg-surface-container border border-transparent">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{b.code}</div>
                  <p className="font-label-md text-label-md text-on-surface">{b.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-secondary uppercase font-bold block mb-1">B2C Target *</label>
                    <input
                      type="number" min="1" step="100" required
                      value={branchTargetB2cDefaults[b.id] ?? ''}
                      onChange={e => setBranchTargetB2cDefaults(prev => ({ ...prev, [b.id]: e.target.value }))}
                      className="w-full bg-white border-b border-secondary/40 px-1.5 py-1 text-[11px] outline-none font-tabular-nums font-bold text-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-tertiary uppercase font-bold block mb-1">B2B Target *</label>
                    <input
                      type="number" min="1" step="100" required
                      value={branchTargetB2bDefaults[b.id] ?? ''}
                      onChange={e => setBranchTargetB2bDefaults(prev => ({ ...prev, [b.id]: e.target.value }))}
                      className="w-full bg-white border-b border-tertiary/40 px-1.5 py-1 text-[11px] outline-none font-tabular-nums font-bold text-tertiary"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Monthly Branch KPI Point Targets — not part of Defaults, same reason as above */}
      {!isAdmin && <GlassCard elevated className="p-5 mb-6">
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
                <p className="text-[10px] text-on-surface-variant mb-2">
                  Default: <strong>{b.kpi_point_target.toLocaleString()} pts</strong> — set in Defaults, not editable here
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-secondary uppercase font-bold block mb-1">B2C Target *</label>
                    <input type="number" min="1" step="100" required
                      value={targetB2cEdits[b.id] ?? b.effective_target}
                      onChange={e => { setTargetB2cEdits(prev => ({ ...prev, [b.id]: e.target.value })); setDirtyTargets(true) }}
                      className="w-full bg-white border-b border-secondary/40 px-1.5 py-1 text-[11px] outline-none font-tabular-nums text-secondary" />
                  </div>
                  <div>
                    <label className="text-[9px] text-tertiary uppercase font-bold block mb-1">B2B Target *</label>
                    <input type="number" min="1" step="100" required
                      value={targetB2bEdits[b.id] ?? b.effective_target}
                      onChange={e => { setTargetB2bEdits(prev => ({ ...prev, [b.id]: e.target.value })); setDirtyTargets(true) }}
                      className="w-full bg-white border-b border-tertiary/40 px-1.5 py-1 text-[11px] outline-none font-tabular-nums text-tertiary" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-on-surface-variant italic">
          B2C / B2B Target are required every month — default to the overall target above unless this branch genuinely needs them to differ this month
        </p>
      </GlassCard>}

      {/* ── KPI Score Config — branch-scoped, no Global option ── */}
      <GlassCard elevated className="p-5 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h4 className="font-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">tune</span>
              KPI Score Config — {isAdmin ? 'Defaults' : `${MONTH_NAMES[globalMonth - 1]} ${globalYear}`}
              {dirtyMult && <span className="text-secondary font-bold text-sm">*</span>}
            </h4>
            <p className="text-body-sm text-on-surface-variant mt-1">
              {isAdmin
                ? 'Standing values every month falls back to when nothing\'s set for it — what "Use Defaults" pulls in below.'
                : 'Jewelry, Bar, and Qty rates are set per branch — select a branch below.'}
            </p>
          </div>
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

        {/* Qty tiers — split B2C/B2B, two independent tables per branch */}
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-tertiary text-sm">inventory_2</span>
          <span className="font-label-md text-label-md text-tertiary font-bold">Qty Tiers</span>
          <span className="text-[10px] text-on-surface-variant">— {branches.find(b => b.id === selectedBranch)?.name ?? ''}</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {([['b2c', tiersB2c], ['b2b', tiersB2b]] as const).map(([type, tierList]) => (
            <div key={type}>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider inline-block mb-2
                ${type === 'b2b' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                {type.toUpperCase()}
              </span>
              <div className="overflow-x-auto rounded-xl border border-outline-variant/20 mb-3">
                <table className="w-full">
                  <thead>
                    <tr className="bg-surface-container-low/50">
                      <th className="px-3 py-2.5 text-left font-label-md text-label-md text-on-surface-variant uppercase">#</th>
                      <th className="px-3 py-2.5 text-right font-label-md text-label-md text-on-surface-variant uppercase">If Qty ≥</th>
                      <th className="px-3 py-2.5 text-right font-label-md text-label-md text-on-surface-variant uppercase">× </th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {tierList.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-on-surface-variant text-body-sm">No tiers. Click "Add Tier".</td></tr>
                    ) : tierList.map((tier, i) => (
                      <tr key={i} className="hover:bg-primary/[0.02] transition-colors group">
                        <td className="px-3 py-2 font-bold text-on-surface-variant text-body-sm">{i + 1}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-on-surface-variant text-[11px]">≥</span>
                            <input type="number" min="0" step="1" value={tier.threshold_pct} onChange={e => updateTier(type, i, 'threshold_pct', e.target.value)}
                              className="w-20 text-right bg-surface-container border-none rounded px-2 py-1 font-tabular-nums text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                            <span className="text-on-surface-variant text-[11px]">pcs</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-on-surface-variant text-[11px]">×</span>
                            <input type="number" min="0" step="0.5" value={tier.score} onChange={e => updateTier(type, i, 'score', e.target.value)}
                              className="w-20 text-right bg-surface-container border-none rounded px-2 py-1 font-tabular-nums font-bold text-primary text-body-sm outline-none focus:ring-2 focus:ring-primary/20" />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeTier(type, i)} className="opacity-0 group-hover:opacity-100 text-error hover:bg-error-container p-1 rounded transition-all">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => sortTiers(type)} className="text-on-surface-variant border border-outline-variant px-3 py-1.5 rounded-lg text-[11px] hover:bg-surface-container flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">sort</span> Sort
                </button>
                <button onClick={() => addTier(type)} className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-label-md text-[11px] flex items-center gap-1 hover:bg-primary/20 transition-colors">
                  <span className="material-symbols-outlined text-sm">add</span> Add Tier
                </button>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Single Save All button — saves Commission Rates, Sup Share, Monthly Targets, and
          Jewelry/Bar Multipliers together for the selected month. Always visible. */}
      <div className="sticky bottom-6 z-20 flex justify-end mb-4">
        <button onClick={saveAllKpiSettings} disabled={savingAll}
          className="flex items-center gap-3 px-8 py-3 bg-primary text-white rounded-2xl font-label-md text-label-md shadow-2xl shadow-primary/30 hover:opacity-90 disabled:opacity-60 transition-all">
          <span className={`material-symbols-outlined text-sm ${savingAll ? 'animate-spin-slow' : ''}`}>{savingAll ? 'sync' : 'save'}</span>
          {savingAll ? 'Saving…' : isAdmin ? 'Save Defaults' : `Save All — ${MONTH_NAMES[globalMonth - 1]} ${globalYear}`}
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
                <>
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
                  <div>
                    <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Type</label>
                    <select
                      value={simStaffType}
                      onChange={e => setSimStaffType(e.target.value as 'b2c' | 'b2b')}
                      className="bg-surface-container border-b-2 border-primary px-3 py-2 outline-none text-body-sm"
                    >
                      <option value="b2c">B2C</option>
                      <option value="b2b">B2B</option>
                    </select>
                  </div>
                </>
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
