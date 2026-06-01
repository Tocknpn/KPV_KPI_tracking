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

function buildHtml(): string {
  const today = new Date(); const year = today.getFullYear(); const month = today.getMonth() + 1
  const rows = prepare(getDb(), `
    SELECT b.name AS branch, COALESCE(SUM(de.jewelry_weight_g),0) AS jewelry, COALESCE(SUM(de.bar_weight_g),0) AS bar, COALESCE(SUM(de.quantity),0) AS qty
    FROM branches b LEFT JOIN daily_entries de ON de.branch_id=b.id AND CAST(strftime('%Y',de.entry_date) AS INTEGER)=? AND CAST(strftime('%m',de.entry_date) AS INTEGER)=?
    GROUP BY b.id ORDER BY b.id
  `).all(year, month) as Array<{ branch: string; jewelry: number; bar: number; qty: number }>
  const tableRows = rows.map(r => `<tr><td style="padding:8px 16px;border-bottom:1px solid #e5eeff">${r.branch}</td><td style="padding:8px 16px;border-bottom:1px solid #e5eeff;text-align:right">${r.jewelry.toLocaleString()}g</td><td style="padding:8px 16px;border-bottom:1px solid #e5eeff;text-align:right">${r.bar.toLocaleString()}g</td><td style="padding:8px 16px;border-bottom:1px solid #e5eeff;text-align:right">${r.qty.toLocaleString()}</td></tr>`).join('')
  return `<div style="font-family:Inter,sans-serif;background:#f8f9ff;padding:32px"><h1 style="color:#004f96">SalesTrack Pro</h1><p style="color:#414752">Performance Report — ${today.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</p><table style="width:100%;border-collapse:collapse;background:white;margin-top:24px"><thead><tr style="background:#004f96;color:white"><th style="padding:12px 16px;text-align:left">Branch</th><th style="padding:12px 16px;text-align:right">Jewelry (g)</th><th style="padding:12px 16px;text-align:right">Bar (g)</th><th style="padding:12px 16px;text-align:right">Qty</th></tr></thead><tbody>${tableRows}</tbody></table></div>`
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
      await buildTransport(latest).sendMail({ from: latest.from_address, to: recipients.join(', '), subject: `SalesTrack Pro — Report ${new Date().toLocaleDateString()}`, html: buildHtml() })
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
      await buildTransport(cfg).sendMail({ from: cfg.from_address, to: recipients.join(', '), subject: 'SalesTrack Pro — Test Email', html: buildHtml() })
      return { success: true }
    } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
  })
}
