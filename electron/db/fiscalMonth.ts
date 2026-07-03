// Fiscal-month cycle: "month" M runs from the 26th of calendar month M-1 through the 25th
// of calendar month M (e.g. "Jul 2026" = 2026-06-26 .. 2026-07-25), replacing the old
// calendar 1st-to-last-day definition everywhere. year_month keys (YYYYMM strings /
// (year, month) integer pairs) are unchanged — only what date range they map to changes.
//
// Mirrored in src/utils/dates.ts for the renderer (separate TS project/build, no shared
// module path between electron/ and src/) — keep both in sync by hand.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

// Fiscal month (year, month) -> real calendar date range it spans.
export function fiscalRangeForLabel(year: number, month: number): { dateFrom: string; dateTo: string } {
  const from = new Date(year, month - 2, 26) // JS Date normalizes month under/overflow (e.g. month=1 -> prior Dec)
  const to = new Date(year, month - 1, 25)
  return {
    dateFrom: `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`,
    dateTo: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
  }
}

// Raw YYYY-MM-DD -> which fiscal (year, month) it belongs to. Day >= 26 rolls into next
// calendar month's fiscal label (e.g. 2026-06-26 -> fiscal Jul 2026).
export function fiscalMonthOf(dateStr: string): { year: number; month: number } {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (d >= 26) {
    const next = new Date(y, m, 1) // m is already next-month's 0-based index here
    return { year: next.getFullYear(), month: next.getMonth() + 1 }
  }
  return { year: y, month: m }
}

// Display helper: "26 Jun – 25 Jul"
export function fiscalRangeLabel(year: number, month: number): string {
  const { dateFrom, dateTo } = fiscalRangeForLabel(year, month)
  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    return `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]}`
  }
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`
}

// Days elapsed (inclusive of dateFrom, clamped to asOfDate) vs. total days in the fiscal
// period — replaces the scattered new Date(y, m, 0).getDate() / new Date(dateTo).getDate()
// calendar EOM-projection duplicates.
export function fiscalProgress(year: number, month: number, asOfDate: string): { daysElapsed: number; daysTotal: number } {
  const { dateFrom, dateTo } = fiscalRangeForLabel(year, month)
  const msPerDay = 86400000
  const daysTotal = Math.round((new Date(dateTo + 'T00:00:00').getTime() - new Date(dateFrom + 'T00:00:00').getTime()) / msPerDay) + 1
  const clamped = asOfDate < dateFrom ? dateFrom : asOfDate > dateTo ? dateTo : asOfDate
  const daysElapsed = Math.round((new Date(clamped + 'T00:00:00').getTime() - new Date(dateFrom + 'T00:00:00').getTime()) / msPerDay) + 1
  return { daysElapsed, daysTotal }
}

// SQL CASE expression computing the fiscal YYYYMM bucket for an entry_date column, for use
// in multi-month GROUP BY queries where a JS helper can't drive the bucketing (a JS function
// can't run per-row inside SQL). '+1 month' clamps an overflowing day to the target month's
// last day, but since only %Y%m is extracted, that clamping never affects the bucket.
export const FISCAL_YM_SQL_EXPR = (col: string) => `
  CASE WHEN CAST(strftime('%d', ${col}) AS INTEGER) >= 26
       THEN strftime('%Y%m', ${col}, '+1 month')
       ELSE strftime('%Y%m', ${col})
  END
`
