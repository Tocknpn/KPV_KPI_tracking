import { useEffect, useState } from 'react'
import { AppShell } from '../../components/layout/AppShell'
import { GlassCard } from '../../components/ui/GlassCard'
import { useAuthStore } from '../../store/auth.store'
import type { SyncLog, EmailConfig } from '../../types'

const DEFAULT_EMAIL: EmailConfig = {
  id: 1, recipients: [], frequency: 'daily', dispatch_time: '08:00',
  smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '',
  from_address: '', metrics: ['jewelry','bar','quantity'], enabled: 0,
}

export default function Settings() {
  const { token } = useAuthStore()
  const [seeding, setSeeding]       = useState(false)
  const [showKpiRef, setShowKpiRef] = useState(false)
  const [sheetsId, setSheetsId] = useState('')
  const [saPath, setSaPath] = useState('')
  const [lastSync, setLastSync] = useState('')
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [email, setEmail] = useState<EmailConfig>(DEFAULT_EMAIL)
  const [recipientInput, setRecipientInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  useEffect(() => {
    if (!token) return
    window.api.getSheetsConfig(token).then(cfg => {
      setSheetsId(cfg.sheetsId)
      setSaPath(cfg.serviceAccountPath)
      setLastSync(cfg.lastSyncedAt)
    })
    window.api.getSyncLogs(token).then(setSyncLogs)
    window.api.getEmailConfig(token).then(setEmail)
  }, [token])

  async function saveSheets() {
    if (!token) return
    setIsSaving(true)
    await window.api.saveSheetsConfig(token, { sheetsId, serviceAccountPath: saPath })
    showToast('Google Sheets config saved.')
    setIsSaving(false)
  }

  async function forceSync() {
    if (!token) return
    setIsSyncing(true)
    const res = await window.api.syncToCloud(token)
    if (res.success) showToast(res.message ?? `Pushed ${res.count} records to Sheets.`)
    else showToast(`Sync failed: ${res.error}`)
    window.api.getSyncLogs(token).then(setSyncLogs)
    setIsSyncing(false)
  }

  async function pullFromCloud() {
    if (!token) return
    setIsSyncing(true)
    const res = await window.api.pullFromCloud(token)
    if (res.success) showToast(res.message ?? `Pulled ${res.count} entries from Sheets.`)
    else showToast(`Pull failed: ${res.error}`)
    window.api.getSyncLogs(token).then(setSyncLogs)
    setIsSyncing(false)
  }

  async function saveEmail() {
    if (!token) return
    setIsSaving(true)
    await window.api.saveEmailConfig(token, {
      recipients: email.recipients, frequency: email.frequency,
      dispatch_time: email.dispatch_time, smtpHost: email.smtp_host,
      smtpPort: email.smtp_port, smtpUser: email.smtp_user, smtpPass: email.smtp_pass,
      fromAddress: email.from_address, metrics: email.metrics, enabled: !!email.enabled,
    })
    showToast('Email config saved.')
    setIsSaving(false)
  }

  async function sendTest() {
    if (!token) return
    setIsTesting(true)
    const res = await window.api.sendTestEmail(token)
    showToast(res.success ? 'Test email sent successfully.' : `Failed: ${res.error}`)
    setIsTesting(false)
  }

  function addRecipient() {
    if (!recipientInput.includes('@')) return
    setEmail(prev => ({ ...prev, recipients: [...prev.recipients, recipientInput.trim()] }))
    setRecipientInput('')
  }

  function removeRecipient(i: number) {
    setEmail(prev => ({ ...prev, recipients: prev.recipients.filter((_, idx) => idx !== i) }))
  }

  return (
    <AppShell title="SalesTrack Pro">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-lg animate-slide-in font-body-sm">
          {toast}
        </div>
      )}

      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface">App Configuration</h2>
          <p className="text-on-surface-variant text-body-md mt-1">Manage sync endpoints, email automation, and local storage.</p>
        </div>
        <button
          onClick={() => { saveSheets(); saveEmail() }}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 rounded-full bg-primary text-white font-label-md shadow-primary hover:opacity-90 disabled:opacity-60 transition-all"
        >
          <span className="material-symbols-outlined text-sm">save</span>
          Save All Changes
        </button>
      </div>

      {/* Test Data Panel — deterministic KPI verification data */}
      <GlassCard className="mb-6 p-6 border-l-4 border-secondary">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-secondary text-2xl">science</span>
            <div>
              <h4 className="font-headline-md text-on-surface !text-base">Test Data Loader</h4>
              <p className="text-body-sm text-on-surface-variant mt-0.5">
                10 salesmen per branch · fixed values on day 1 of current month · hand-verifiable KPI scores.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowKpiRef(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-secondary border border-secondary/30 rounded-lg font-label-md text-label-md hover:bg-secondary/5 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">calculate</span>
              {showKpiRef ? 'Hide' : 'KPI Reference'}
            </button>
            <button
              onClick={async () => {
                if (!token) return
                if (!confirm('DELETE all current salesmen/targets/entries and reload test data?')) return
                setSeeding(true)
                const res = await window.api.seedTestData(token)
                showToast(res.success ? `✓ ${res.message}` : `Error: ${res.error}`)
                setSeeding(false)
              }}
              disabled={seeding}
              className="flex items-center gap-2 px-5 py-2 bg-secondary text-white rounded-lg font-label-md text-label-md hover:opacity-90 transition-all disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-sm ${seeding ? 'animate-spin-slow' : ''}`}>
                {seeding ? 'sync' : 'play_arrow'}
              </span>
              {seeding ? 'Loading...' : 'Load Test Data'}
            </button>
          </div>
        </div>

        {/* KPI reference table — collapsible */}
        {showKpiRef && (
          <div className="mt-5 border-t border-outline-variant/20 pt-4">

            {/* Formula strip */}
            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
              {[
                { label: 'Jewelry Score', formula: 'actual_g × 15',       color: 'bg-primary/8 text-primary' },
                { label: 'Bar Score',     formula: 'actual_g × 7.5',      color: 'bg-secondary/10 text-secondary' },
                { label: 'Qty Score',     formula: 'actual_pcs × tier ×', color: 'bg-tertiary/10 text-tertiary' },
              ].map(f => (
                <div key={f.label} className={`rounded-lg px-3 py-2 ${f.color}`}>
                  <p className="text-[10px] uppercase font-bold tracking-wider mb-0.5">{f.label}</p>
                  <p className="font-mono text-xs">{f.formula}</p>
                </div>
              ))}
            </div>

            {/* Qty tier table */}
            <div className="mb-4 grid grid-cols-2 gap-3">
              {[
                {
                  branch: 'Morning Market (MM)',
                  tiers: '≥900→×6.5  ≥700→×6  ≥500→×5  ≥350→×4  ≥200→×3  ≥100→×2.5  ≥50→×2  ≥1→×1.5',
                  target: '8,000 pts',
                },
                {
                  branch: 'VC / IT / VT',
                  tiers: '≥900→×5  ≥700→×4.5  ≥500→×4  ≥350→×3.5  ≥200→×3  ≥100→×2.5  ≥50→×2  ≥1→×1.5',
                  target: 'VC 5,500 · IT 6,000 · VT 7,000',
                },
              ].map(r => (
                <div key={r.branch} className="bg-surface-container rounded-lg px-3 py-2">
                  <p className="font-bold text-[11px] text-on-surface mb-1">{r.branch} — target {r.target}</p>
                  <p className="font-mono text-[10px] text-on-surface-variant">{r.tiers}</p>
                </div>
              ))}
            </div>

            {/* Expected scores table */}
            <p className="font-label-md text-label-md text-on-surface-variant uppercase mb-2">
              Expected KPI % — all entries on day 1 of current month
            </p>
            <div className="overflow-x-auto rounded-lg border border-outline-variant/20">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-surface-container">
                  <tr>
                    {['Salesman','J (g)','B (g)','Qty','J-pts','B-pts','Q-pts','Total','VC %','IT %','VT %','MM %'].map(h => (
                      <th key={h} className="px-3 py-2 font-bold text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {[
                    ['T-Zero',       0,   0,    0,    0,    0,      0,       0, '0.0',   '0.0',  '0.0',  '0.0'],
                    ['T-Jewelry300', 300, 0,    0,  4500,    0,      0,    4500, '81.8', '75.0', '64.3', '56.3'],
                    ['T-Bar400',     0,   400,  0,    0,  3000,     0,    3000, '54.5', '50.0', '42.9', '37.5'],
                    ['T-Qty50',      0,   0,   50,    0,    0,    100,     100,  '1.8',  '1.7',  '1.4',  '1.3'],
                    ['T-Qty150',     0,   0,  150,    0,    0,    375,     375,  '6.8',  '6.3',  '5.4',  '4.7'],
                    ['T-Qty350',     0,   0,  350,    0,    0,   1225,    1225, '22.3', '20.4', '17.5', '15.3'],
                    ['T-Mix-Half', 100, 150,   50, 1500, 1125,    100,    2725, '49.5', '45.4', '38.9', '34.1'],
                    ['T-Mix-Full', 200, 300,  100, 3000, 2250,    250,    5500,'100.0', '91.7', '78.6', '68.8'],
                    ['T-Mix-Over', 300, 450,  200, 4500, 3375,    600,    8475,'154.1','141.3','121.1','105.9'],
                    ['T-Mix-Exceed',400,600,  350, 6000, 4500,   1225,   11725,'213.2','195.4','167.5','146.6'],
                  ].map((row, i) => {
                    const isKeyRow = row[0] === 'T-Mix-Full'
                    return (
                      <tr key={i} className={isKeyRow ? 'bg-primary/5 font-bold' : 'hover:bg-surface-container/40'}>
                        <td className={`px-3 py-1.5 font-mono ${isKeyRow ? 'text-primary' : 'text-on-surface'}`}>{row[0]}</td>
                        {([1,2,3] as const).map(ci => (
                          <td key={ci} className="px-3 py-1.5 text-on-surface-variant tabular-nums">{row[ci]}</td>
                        ))}
                        {([4,5,6] as const).map(ci => (
                          <td key={ci} className="px-3 py-1.5 tabular-nums font-semibold text-on-surface">{Number(row[ci]).toLocaleString()}</td>
                        ))}
                        <td className="px-3 py-1.5 tabular-nums font-bold text-on-surface">{Number(row[7]).toLocaleString()}</td>
                        {([8,9,10,11] as const).map(ci => (
                          <td key={ci} className={`px-3 py-1.5 tabular-nums ${isKeyRow ? 'text-primary' : 'text-on-surface'}`}>
                            {row[ci]}%
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-on-surface-variant/60 mt-2 italic">
              KPI % = Total Score ÷ Branch Target × 100 &nbsp;·&nbsp;
              T-Mix-Full hits exactly 100% for VC (5,500 ÷ 5,500) &nbsp;·&nbsp;
              Each salesman created per branch, suffix [B1/B2/B3/B4]
            </p>
          </div>
        )}
      </GlassCard>

      <div className="grid grid-cols-12 gap-card-gap">
        {/* Email Settings */}
        <GlassCard elevated className="col-span-12 lg:col-span-8 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-secondary-container/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary text-2xl">mail</span>
            </div>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Email Report Settings</h3>
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Automated Dispatch</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="font-label-md text-label-md text-on-surface-variant">Enabled</span>
              <button
                onClick={() => setEmail(prev => ({ ...prev, enabled: prev.enabled ? 0 : 1 }))}
                className={`w-12 h-6 rounded-full transition-colors relative ${email.enabled ? 'bg-primary' : 'bg-surface-container-highest'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${email.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          <div className="space-y-6">
            {/* Recipients */}
            <div>
              <label className="font-label-md text-label-md block mb-2 text-primary">Recipients</label>
              <div className="flex flex-wrap gap-2 p-3 bg-surface-container rounded border border-outline-variant/30 min-h-[52px]">
                {email.recipients.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-1 rounded-full text-sm">
                    {r}
                    <button onClick={() => removeRecipient(i)} className="material-symbols-outlined text-xs hover:opacity-70">close</button>
                  </span>
                ))}
                <input
                  type="email"
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRecipient()}
                  placeholder="Add email and press Enter..."
                  className="flex-1 min-w-[200px] bg-transparent border-none focus:ring-0 text-sm py-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Frequency */}
              <div>
                <label className="font-label-md text-label-md block mb-2 text-primary">Schedule Frequency</label>
                <div className="flex bg-surface-container rounded p-1 border border-outline-variant/20">
                  {['daily','weekly','monthly'].map(f => (
                    <button
                      key={f}
                      onClick={() => setEmail(prev => ({ ...prev, frequency: f }))}
                      className={`flex-1 py-2 rounded font-label-md text-label-md capitalize transition-all ${email.frequency === f ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:bg-white/50'}`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {/* Time */}
              <div>
                <label className="font-label-md text-label-md block mb-2 text-primary">Dispatch Time</label>
                <input
                  type="time"
                  value={email.dispatch_time}
                  onChange={e => setEmail(prev => ({ ...prev, dispatch_time: e.target.value }))}
                  className="w-full bg-surface-container border-b-2 border-primary border-t-0 border-l-0 border-r-0 text-headline-md font-tabular-nums px-4 py-1.5 outline-none"
                />
              </div>
            </div>
            {/* SMTP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'SMTP Host', field: 'smtp_host', type: 'text', placeholder: 'smtp.gmail.com' },
                { label: 'SMTP Port', field: 'smtp_port', type: 'number', placeholder: '587' },
                { label: 'SMTP User', field: 'smtp_user', type: 'text', placeholder: 'your@email.com' },
                { label: 'SMTP Password', field: 'smtp_pass', type: 'password', placeholder: '••••••••' },
                { label: 'From Address', field: 'from_address', type: 'email', placeholder: 'reports@company.com' },
              ].map(f => (
                <div key={f.field}>
                  <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">{f.label}</label>
                  <input
                    type={f.type}
                    value={(email as Record<string, unknown>)[f.field] as string}
                    onChange={e => setEmail(prev => ({ ...prev, [f.field]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-surface-container-low border-b-2 border-outline-variant focus:border-primary border-t-0 border-l-0 border-r-0 px-3 py-2 text-body-sm outline-none transition-colors"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={sendTest}
              disabled={isTesting}
              className="text-sm font-bold text-tertiary flex items-center gap-1 hover:underline disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">send</span>
              {isTesting ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>
        </GlassCard>

        {/* Right side cards */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-card-gap">
          {/* Google Sheets Sync */}
          <GlassCard elevated className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-tertiary-container/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-tertiary">table_chart</span>
              </div>
              <h3 className="font-headline-md text-on-surface !text-lg">Google Sheets Sync</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Spreadsheet ID</label>
                <input
                  type="text"
                  value={sheetsId}
                  onChange={e => setSheetsId(e.target.value)}
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  className="w-full bg-surface-container-low border-b-2 border-tertiary border-t-0 border-l-0 border-r-0 px-3 py-2 text-sm outline-none"
                />
                <p className="text-[10px] text-on-surface-variant mt-1">Found in the Google Sheets URL</p>
              </div>
              <div>
                <label className="font-label-md text-label-md block mb-1 text-on-surface-variant">Service Account JSON Path</label>
                <input
                  type="text"
                  value={saPath}
                  onChange={e => setSaPath(e.target.value)}
                  placeholder="C:\credentials\service-account.json"
                  className="w-full bg-surface-container-low border-b-2 border-tertiary border-t-0 border-l-0 border-r-0 px-3 py-2 text-sm outline-none"
                />
              </div>
              {lastSync && (
                <div className="bg-surface-container rounded-lg p-3 text-body-sm">
                  <p className="text-on-surface-variant text-xs mb-1">Last successful sync</p>
                  <p className="font-tabular-nums text-on-surface">{new Date(lastSync).toLocaleString()}</p>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={saveSheets}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-surface-container text-on-surface-variant border border-outline-variant/30 rounded font-label-md text-label-md hover:bg-surface-container-high transition-colors"
                >
                  Save Config
                </button>
                <button
                  onClick={forceSync}
                  disabled={isSyncing}
                  className="flex-1 py-2 bg-tertiary text-white rounded font-label-md text-label-md flex items-center justify-center gap-1 hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin-slow' : ''}`}>cloud_upload</span>
                  {isSyncing ? 'Working...' : 'Push to Sheets'}
                </button>
                <button
                  onClick={pullFromCloud}
                  disabled={isSyncing}
                  className="flex-1 py-2 bg-primary text-white rounded font-label-md text-label-md flex items-center justify-center gap-1 hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin-slow' : ''}`}>cloud_download</span>
                  {isSyncing ? 'Working...' : 'Pull Entries'}
                </button>
              </div>
              <p className="text-[10px] text-on-surface-variant/60 italic">
                Push → sends unsynced entries to Sheets &nbsp;·&nbsp;
                Pull → imports all Sheets entries into local DB (for admin PC aggregation)
              </p>
            </div>
          </GlassCard>

          {/* Sync Logs */}
          <GlassCard className="p-5">
            <h4 className="font-label-md text-label-md text-on-surface-variant uppercase mb-3">Recent Sync Log</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              {syncLogs.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant text-center py-4">No sync history yet.</p>
              ) : syncLogs.map(log => (
                <div key={log.id} className="flex justify-between items-center py-2 border-b border-outline-variant/10 last:border-0">
                  <div>
                    <span className={`text-[10px] font-bold uppercase mr-2 ${log.status === 'success' ? 'text-tertiary' : 'text-error'}`}>
                      {log.status}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">{log.direction}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-on-surface tabular-nums">{log.records_count} records</p>
                    <p className="text-[9px] text-on-surface-variant">{new Date(log.synced_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </AppShell>
  )
}
