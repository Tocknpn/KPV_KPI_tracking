import { IpcMain } from 'electron'
import nodemailer from 'nodemailer'
import cron from 'node-cron'
import { getDb } from '../db/connection'
import { prepare } from '../db/query'
import { requireAuth } from './auth'

interface EmailCfg {
  recipients: string; frequency: string; dispatch_time: string
  smtp_host: string; smtp_port: number; smtp_user: string; smtp_pass: string
  from_address: string; enabled: number
}

function getCfg(): EmailCfg | undefined {
  return prepare(getDb(), `SELECT * FROM email_config WHERE id=1`).get() as EmailCfg | undefined
}

function buildTransport(cfg: EmailCfg) {
  return nodemailer.createTransport({ host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_port === 465, auth: { user: cfg.smtp_user, pass: cfg.smtp_pass } })
}

function buildSubjectAndHtml(): { subject: string; html: string } {
  const db  = getDb()
  const now = new Date()
  const d1  = new Date(now); d1.setDate(d1.getDate() - 1)
  const d1Str   = d1.toISOString().slice(0, 10)
  const d1Label = d1.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const year = now.getFullYear(); const month = now.getMonth() + 1
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const mtd = prepare(db, `
    SELECT COALESCE(SUM(jewelry_weight_g),0) AS jewelry, COALESCE(SUM(bar_weight_g),0) AS bar, COALESCE(SUM(quantity),0) AS qty
    FROM daily_entries
    WHERE CAST(strftime('%Y',entry_date) AS INTEGER)=? AND CAST(strftime('%m',entry_date) AS INTEGER)=?
  `).get(year, month) as { jewelry: number; bar: number; qty: number }

  const d1Branch = prepare(db, `
    SELECT b.name AS branch, COALESCE(SUM(de.jewelry_weight_g),0) AS jewelry, COALESCE(SUM(de.bar_weight_g),0) AS bar, COALESCE(SUM(de.quantity),0) AS qty
    FROM branches b LEFT JOIN daily_entries de ON de.branch_id=b.id AND de.entry_date=?
    GROUP BY b.id ORDER BY b.id
  `).all(d1Str) as Array<{ branch: string; jewelry: number; bar: number; qty: number }>

  const missingBranches = d1Branch.filter(r => r.jewelry === 0 && r.bar === 0 && r.qty === 0)
  const allMissing = missingBranches.length > 0 && missingBranches.length === d1Branch.length

  const top5 = prepare(db, `
    SELECT s.full_name, b.name AS branch, COALESCE(SUM(de.jewelry_weight_g),0)+COALESCE(SUM(de.bar_weight_g),0) AS total_weight
    FROM daily_entries de
    JOIN salesmen s ON s.id=de.salesman_id
    JOIN branches b ON b.id=de.branch_id
    WHERE de.entry_date=?
    GROUP BY de.salesman_id ORDER BY total_weight DESC LIMIT 5
  `).all(d1Str) as Array<{ full_name: string; branch: string; total_weight: number }>

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

  const branchRows = d1Branch.map((r, i) => {
    const missing = r.jewelry === 0 && r.bar === 0 && r.qty === 0
    return `<tr style="background:${i % 2 === 0 ? '#f8f9ff' : 'white'}">
      <td style="padding:8px 16px;border-bottom:1px solid #e5eeff">${r.branch}</td>
      <td style="padding:8px 16px;border-bottom:1px solid #e5eeff;text-align:right">${fmt(r.jewelry)}g</td>
      <td style="padding:8px 16px;border-bottom:1px solid #e5eeff;text-align:right">${fmt(r.bar)}g</td>
      <td style="padding:8px 16px;border-bottom:1px solid #e5eeff;text-align:right">${fmt(r.qty)}</td>
      <td style="padding:8px 16px;border-bottom:1px solid #e5eeff;text-align:center">${missing ? '<span style="color:#d32f2f;font-weight:bold">⚠ No Data</span>' : '<span style="color:#388e3c">✓</span>'}</td>
    </tr>`
  }).join('')

  const top5Rows = top5.length > 0
    ? top5.map((r, i) => `<tr><td style="padding:6px 12px;font-weight:bold;color:#004f96">#${i+1} ${r.full_name}</td><td style="padding:6px 12px;color:#666">${r.branch}</td><td style="padding:6px 12px;text-align:right;font-weight:bold">${fmt(r.total_weight)}g</td></tr>`).join('')
    : '<tr><td colspan="3" style="padding:12px;color:#888">No entries for this date.</td></tr>'

  const missingWarning = missingBranches.length > 0
    ? `<div style="margin:20px 0;padding:14px 18px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px"><strong style="color:#856404">⚠ Missing Data</strong><p style="margin:4px 0 0;color:#856404">${missingBranches.map(b => b.branch).join(', ')} reported no entries for ${d1Label}.</p></div>`
    : ''

  const subject = `${allMissing ? '⚠ [KPV] NO DATA — ' : '[KPV] Daily Sales — '}${d1Label}`

  const html = `<div style="font-family:'Segoe UI',Inter,sans-serif;background:#f0f4ff;padding:32px;max-width:700px;margin:0 auto">
  <div style="background:#004f96;padding:20px 28px;border-radius:12px 12px 0 0">
    <h1 style="color:white;margin:0;font-size:20px">SalesTrack Pro</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px">Daily Sales Report — ${d1Label}</p>
  </div>
  <div style="background:white;padding:24px 28px;border-radius:0 0 12px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <h2 style="color:#004f96;font-size:16px;margin:0 0 12px">MTD Summary — ${monthLabel}</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="background:#e8eeff"><td style="padding:12px 16px;font-weight:bold">Jewelry</td><td style="padding:12px 16px;font-weight:bold">Bar</td><td style="padding:12px 16px;font-weight:bold">Qty</td></tr>
      <tr><td style="padding:12px 16px;font-size:22px;font-weight:bold;color:#004f96">${fmt(mtd.jewelry)}g</td><td style="padding:12px 16px;font-size:22px;font-weight:bold;color:#00695c">${fmt(mtd.bar)}g</td><td style="padding:12px 16px;font-size:22px;font-weight:bold;color:#5e35b1">${fmt(mtd.qty)}</td></tr>
    </table>
    ${missingWarning}
    <h2 style="color:#004f96;font-size:16px;margin:0 0 12px">Branch Performance — ${d1Label}</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#004f96;color:white"><th style="padding:10px 16px;text-align:left">Branch</th><th style="padding:10px 16px;text-align:right">Jewelry (g)</th><th style="padding:10px 16px;text-align:right">Bar (g)</th><th style="padding:10px 16px;text-align:right">Qty</th><th style="padding:10px 16px;text-align:center">Status</th></tr></thead>
      <tbody>${branchRows}</tbody>
    </table>
    <h2 style="color:#004f96;font-size:16px;margin:0 0 12px">Top 5 Reps — ${d1Label}</h2>
    <table style="width:100%;border-collapse:collapse"><tbody>${top5Rows}</tbody></table>
    <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5eeff;color:#999;font-size:11px">Sent automatically by SalesTrack Pro · ${now.toLocaleString('en-GB')}</p>
  </div>
</div>`

  return { subject, html }
}

let scheduledJob: cron.ScheduledTask | null = null

function scheduleEmail(): void {
  if (scheduledJob) { scheduledJob.destroy(); scheduledJob = null }
  const cfg = getCfg()
  if (!cfg?.enabled) return
  const [hour, minute] = cfg.dispatch_time.split(':').map(Number)
  const cronMap: Record<string, string> = { daily: `${minute} ${hour} * * *`, weekly: `${minute} ${hour} * * 1`, monthly: `${minute} ${hour} 1 * *` }
  const expr = cronMap[cfg.frequency]
  if (!expr) return
  scheduledJob = cron.schedule(expr, async () => {
    const latest = getCfg(); if (!latest?.enabled) return
    const recipients = JSON.parse(latest.recipients) as string[]
    if (!recipients.length) return
    try {
      const { subject, html } = buildSubjectAndHtml()
      await buildTransport(latest).sendMail({ from: latest.from_address, to: recipients.join(', '), subject, html })
    } catch (e) { console.error('[Email]', e) }
  })
}

export function startEmailScheduler(): void { scheduleEmail() }

export function registerEmailHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('email:getConfig', async (_e, token: string) => {
    requireAuth(token)
    const cfg = getCfg()
    if (!cfg) return null
    return { ...cfg, recipients: JSON.parse(cfg.recipients), metrics: ['jewelry','bar','quantity'] }
  })

  ipcMain.handle('email:saveConfig', async (_e, token: string, config: {
    recipients: string[]; frequency: string; dispatch_time: string
    smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string
    fromAddress: string; metrics: string[]; enabled: boolean
  }) => {
    requireAuth(token)
    prepare(getDb(), `UPDATE email_config SET recipients=?,frequency=?,dispatch_time=?,smtp_host=?,smtp_port=?,smtp_user=?,smtp_pass=?,from_address=?,enabled=? WHERE id=1`)
      .run(JSON.stringify(config.recipients), config.frequency, config.dispatch_time, config.smtpHost, config.smtpPort, config.smtpUser, config.smtpPass, config.fromAddress, config.enabled ? 1 : 0)
    scheduleEmail()
    return { success: true }
  })

  ipcMain.handle('email:sendTest', async (_e, token: string) => {
    requireAuth(token)
    const cfg = getCfg(); if (!cfg) return { success: false, error: 'Email not configured.' }
    try {
      const recipients = JSON.parse(cfg.recipients) as string[]
      if (!recipients.length) return { success: false, error: 'No recipients.' }
      const { subject, html } = buildSubjectAndHtml()
      await buildTransport(cfg).sendMail({ from: cfg.from_address, to: recipients.join(', '), subject: `[TEST] ${subject}`, html })
      return { success: true }
    } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
  })
}
