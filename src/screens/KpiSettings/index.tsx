import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import type { KpiMetric, KpiTierConfig, KpiTier } from '../../types'

interface EditableTier { id?: number; threshold_pct: number; score: number }

export default function KpiSettings() {
  const { token, branches } = useAuthStore()
  const [metrics, setMetrics] = useState<KpiMetric[]>([])
  const [configs, setConfigs] = useState<KpiTierConfig[]>([])
  const [selectedMetric, setSelectedMetric] = useState<number>(1)
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null) // null = global
  const [tiers, setTiers] = useState<EditableTier[]>([])
  const [configLabel, setConfigLabel] = useState('Default Config')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0])
  const [effectiveTo, setEffectiveTo] = useState('')
  const [editingConfigId, setEditingConfigId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState('')
  // Simulator
  const [simActual, setSimActual] = useState('')
  const [simTarget, setSimTarget] = useState('')
  const [simResult, setSimResult] = useState<{ score: number; pct: number } | null>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    if (!token) return
    window.api.getKpiMetrics(token).then(setMetrics)
    window.api.getKpiConfigs(token).then(setConfigs)
  }, [token])

  // Filter configs for selected metric + branch
  const filteredConfigs = configs.filter(c =>
    c.metric_id === selectedMetric &&
    (selectedBranch === null ? c.branch_id === null : c.branch_id === selectedBranch)
  )

  function loadConfig(cfg: KpiTierConfig) {
    setEditingConfigId(cfg.id)
    setConfigLabel(cfg.label)
    setEffectiveFrom(cfg.effective_from)
    setEffectiveTo(cfg.effective_to ?? '')
    window.api.getKpiTiers(token!, cfg.id).then((ts: KpiTier[]) => {
      setTiers(ts.map(t => ({ id: t.id, threshold_pct: t.threshold_pct, score: t.score })))
    })
  }

  function newConfig() {
    setEditingConfigId(null)
    setConfigLabel('New Config')
    setEffectiveFrom(new Date().toISOString().split('T')[0])
    setEffectiveTo('')
    setTiers([
      { threshold_pct: 100, score: 100 },
      { threshold_pct: 80,  score: 80  },
      { threshold_pct: 60,  score: 60  },
      { threshold_pct: 40,  score: 40  },
      { threshold_pct: 20,  score: 20  },
      { threshold_pct: 0,   score: 0   },
    ])
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

  async function saveConfig() {
    if (!token || tiers.length === 0) return
    setIsSaving(true)
    const sortedTiers = [...tiers]
      .sort((a, b) => b.threshold_pct - a.threshold_pct)
      .map((t, i) => ({ ...t, tierOrder: i + 1 }))

    const cfgPayload = {
      id: editingConfigId ?? undefined,
      metricId: selectedMetric,
      branchId: selectedBranch,
      label: configLabel,
      effectiveFrom, effectiveTo: effectiveTo || null, isActive: 1,
    }
    const res = await window.api.saveKpiConfig(token, cfgPayload, sortedTiers)
    if (res.success) {
      showToast('KPI config saved successfully.')
      const updated = await window.api.getKpiConfigs(token)
      setConfigs(updated)
      setEditingConfigId(res.id)
    }
    setIsSaving(false)
  }

  async function deleteConfig(id: number) {
    if (!token) return
    if (!confirm('Delete this KPI config and all its tiers?')) return
    await window.api.deleteKpiConfig(token, id)
    const updated = await window.api.getKpiConfigs(token)
    setConfigs(updated)
    showToast('Config deleted.')
    newConfig()
  }

  async function simulate() {
    if (!token) return
    const actual = parseFloat(simActual) || 0
    const target = parseFloat(simTarget) || 1
    const result = await window.api.simulateKpiScore(token, selectedMetric, selectedBranch, actual, target)
    setSimResult(result)
  }

  const selectedMetricObj = metrics.find(m => m.id === selectedMetric)

  return (
    <AppShell title="KPI Settings" allowedRoles={['admin']}>
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
          <p className="text-on-surface-variant text-body-md mt-1">Configure tier tables per KPI metric and per branch.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-error-container/30 rounded-xl">
          <span className="material-symbols-outlined text-error text-sm">admin_panel_settings</span>
          <span className="font-label-md text-label-md text-error">Admin Only</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-card-gap">
        {/* Left: Config Selector */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* KPI Metric Selector */}
          <GlassCard className="p-5">
            <h4 className="font-label-md text-label-md text-on-surface-variant uppercase mb-3">KPI Metric</h4>
            <div className="space-y-1">
              {metrics.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMetric(m.id); setEditingConfigId(null); setTiers([]) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors font-label-md text-label-md ${selectedMetric === m.id ? 'bg-primary/10 text-primary font-bold border-l-4 border-primary' : 'text-on-surface-variant hover:bg-surface-variant/30'}`}
                >
                  <span className="material-symbols-outlined text-sm">
                    {m.id === 1 ? 'diamond' : m.id === 2 ? 'payments' : 'inventory_2'}
                  </span>
                  {m.name}
                  <span className="ml-auto text-[10px] text-on-surface-variant">({m.unit})</span>
                </button>
              ))}
            </div>
          </GlassCard>

          {/* Branch Scope */}
          <GlassCard className="p-5">
            <h4 className="font-label-md text-label-md text-on-surface-variant uppercase mb-3">Scope / Branch</h4>
            <div className="space-y-1">
              <button
                onClick={() => setSelectedBranch(null)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-left text-body-sm transition-colors ${selectedBranch === null ? 'bg-primary/10 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant/30'}`}
              >
                <span className="material-symbols-outlined text-sm">public</span>
                Global (All Branches)
              </button>
              {branches.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBranch(b.id)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-left text-body-sm transition-colors ${selectedBranch === b.id ? 'bg-primary/10 text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-variant/30'}`}
                >
                  <span className="material-symbols-outlined text-sm">store</span>
                  {b.name}
                </button>
              ))}
            </div>
          </GlassCard>

          {/* Existing Configs */}
          <GlassCard className="p-5">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-label-md text-label-md text-on-surface-variant uppercase">Saved Configs</h4>
              <button onClick={newConfig} className="text-primary font-label-md text-label-md flex items-center gap-1 hover:underline">
                <span className="material-symbols-outlined text-sm">add</span> New
              </button>
            </div>
            <div className="space-y-1">
              {filteredConfigs.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant text-center py-3">No configs for this scope.</p>
              ) : filteredConfigs.map(cfg => (
                <div
                  key={cfg.id}
                  onClick={() => loadConfig(cfg)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${editingConfigId === cfg.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-surface-variant/30'}`}
                >
                  <div>
                    <p className="font-label-md text-label-md text-on-surface">{cfg.label}</p>
                    <p className="text-[10px] text-on-surface-variant">From {cfg.effective_from}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {cfg.is_active ? (
                      <span className="w-2 h-2 rounded-full bg-tertiary" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-outline-variant" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Right: Tier Editor */}
        <div className="col-span-12 lg:col-span-8 space-y-4">
          {/* Config Metadata */}
          <GlassCard elevated className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">Config Label</label>
                <input
                  type="text"
                  value={configLabel}
                  onChange={e => setConfigLabel(e.target.value)}
                  className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none"
                />
              </div>
              <div>
                <label className="font-label-md text-label-md block mb-1 text-primary">Effective From</label>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={e => setEffectiveFrom(e.target.value)}
                  className="w-full bg-surface-container-low border-b-2 border-primary px-3 py-2 text-body-sm outline-none"
                />
              </div>
              <div>
                <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Effective To (optional)</label>
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={e => setEffectiveTo(e.target.value)}
                  className="w-full bg-surface-container-low border-b-2 border-outline-variant px-3 py-2 text-body-sm outline-none"
                  placeholder="Leave blank = no end"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-body-sm text-on-surface-variant bg-surface-container rounded-lg p-3">
              <span className="material-symbols-outlined text-sm text-primary">info</span>
              Editing <strong className="text-primary">{selectedMetricObj?.name ?? '—'}</strong> for{' '}
              <strong className="text-primary">{selectedBranch === null ? 'All Branches (Global)' : branches.find(b => b.id === selectedBranch)?.name}</strong>
            </div>
          </GlassCard>

          {/* Tier Table Editor */}
          <GlassCard elevated className="overflow-hidden">
            <div className="p-5 border-b border-outline-variant/10 flex justify-between items-center">
              <h4 className="font-headline-md text-headline-md text-on-surface">Tier Table</h4>
              <div className="flex gap-2">
                <button onClick={sortTiers} className="text-on-surface-variant flex items-center gap-1 text-body-sm hover:text-primary">
                  <span className="material-symbols-outlined text-sm">sort</span> Sort
                </button>
                <button onClick={addTier} className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-label-md text-label-md flex items-center gap-1 hover:bg-primary/20 transition-colors">
                  <span className="material-symbols-outlined text-sm">add</span> Add Tier
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container-low/50">
                    <th className="px-5 py-3 text-left font-label-md text-label-md text-on-surface-variant uppercase">#</th>
                    <th className="px-5 py-3 text-left font-label-md text-label-md text-on-surface-variant uppercase">Condition</th>
                    <th className="px-5 py-3 text-right font-label-md text-label-md text-on-surface-variant uppercase">If (actual/target) ≥ X%</th>
                    <th className="px-5 py-3 text-right font-label-md text-label-md text-on-surface-variant uppercase">Award Score</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {tiers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-on-surface-variant text-body-sm">
                        No tiers yet. Click "Add Tier" or select a saved config to edit.
                      </td>
                    </tr>
                  ) : tiers.map((tier, i) => (
                    <tr key={i} className="hover:bg-primary/[0.02] transition-colors group">
                      <td className="px-5 py-3 font-bold text-on-surface-variant text-body-sm">{i + 1}</td>
                      <td className="px-5 py-3 text-body-sm text-on-surface-variant">
                        {i === tiers.length - 1 && tier.threshold_pct === 0
                          ? 'Otherwise (fallback)'
                          : `Tier ${i + 1}`}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-on-surface-variant text-body-sm">≥</span>
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            step="1"
                            value={tier.threshold_pct}
                            onChange={e => updateTier(i, 'threshold_pct', e.target.value)}
                            className="w-20 text-right bg-surface-container border-none rounded px-2 py-1 font-tabular-nums text-body-sm outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <span className="text-on-surface-variant text-body-sm">%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={tier.score}
                            onChange={e => updateTier(i, 'score', e.target.value)}
                            className="w-24 text-right bg-surface-container border-none rounded px-2 py-1 font-tabular-nums font-bold text-primary text-body-sm outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <span className="text-on-surface-variant text-body-sm">pts</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => removeTier(i)}
                          className="opacity-0 group-hover:opacity-100 text-error hover:bg-error-container p-1 rounded transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-outline-variant/10 flex justify-between">
              <div className="flex gap-2">
                <button
                  onClick={saveConfig}
                  disabled={isSaving || tiers.length === 0}
                  className="bg-primary text-white px-6 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-primary"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {isSaving ? 'Saving...' : editingConfigId ? 'Update Config' : 'Create Config'}
                </button>
                {editingConfigId && (
                  <button
                    onClick={() => deleteConfig(editingConfigId)}
                    className="text-error border border-error/30 px-4 py-2 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:bg-error-container/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Delete
                  </button>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Score Simulator */}
          <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-secondary">calculate</span>
              <h4 className="font-headline-md text-headline-md text-on-surface !text-lg">Score Simulator</h4>
            </div>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Test what score a rep would get with these tier settings.
            </p>
            <div className="flex gap-4 items-end">
              <div>
                <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Actual ({selectedMetricObj?.unit})</label>
                <input
                  type="number" value={simActual} onChange={e => setSimActual(e.target.value)}
                  className="bg-surface-container border-b-2 border-primary px-3 py-2 w-32 outline-none font-tabular-nums"
                  placeholder="e.g. 800"
                />
              </div>
              <div>
                <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Target ({selectedMetricObj?.unit})</label>
                <input
                  type="number" value={simTarget} onChange={e => setSimTarget(e.target.value)}
                  className="bg-surface-container border-b-2 border-primary px-3 py-2 w-32 outline-none font-tabular-nums"
                  placeholder="e.g. 1000"
                />
              </div>
              <button
                onClick={simulate}
                className="bg-secondary text-white px-5 py-2.5 rounded-lg font-label-md text-label-md flex items-center gap-2 hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">play_arrow</span>
                Simulate
              </button>
              {simResult && (
                <div className="ml-4 bg-primary/10 px-5 py-2.5 rounded-lg">
                  <p className="text-[10px] text-primary uppercase font-bold">Result</p>
                  <p className="font-display-xl text-[28px] text-primary tabular-nums">{simResult.score}<span className="text-label-md ml-1">pts</span></p>
                  <p className="text-[10px] text-on-surface-variant">{simResult.pct.toFixed(1)}% of target</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  )
}
