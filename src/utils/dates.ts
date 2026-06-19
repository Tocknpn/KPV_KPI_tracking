export function getDefaultDateRange(year: number, month: number): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateFrom = `${year}-${pad(month)}-01`
  const dateTo = isCurrentMonth
    ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    : `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`
  return { dateFrom, dateTo }
}

export function dayOfMonthFrom(dateTo: string): number {
  return new Date(dateTo + 'T00:00:00').getDate()
}

// Laos/company timezone — every absolute timestamp shown in the app (audit log, upload
// history, sync status) is forced to this zone instead of whatever timezone the device's
// OS happens to be set to, so two devices in different locations show the same wall-clock
// time for the same event. No DST in this zone, so this is safe year-round.
const APP_TIMEZONE = 'Asia/Vientiane'

export function fmtDateTime(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-GB', { timeZone: APP_TIMEZONE, ...opts }) }
  catch { return iso }
}
