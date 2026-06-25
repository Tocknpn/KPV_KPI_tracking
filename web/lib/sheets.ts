import { google } from 'googleapis'
import { unstable_cache } from 'next/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

export type EntryRow = {
  entry_date: string
  branch_code: string
  rep_code: string
  full_name: string
  jewelry_weight_g: number
  bar_weight_g: number
  quantity: number
}

export type BranchRow = {
  code: string
  name: string
  kpi_point_target: number
  target_b2c_default: number
  target_b2b_default: number
}

// metric: 'jewelry' | 'bar' | 'qty' — staff_type: 'b2c' | 'b2b' — year_month null = standing
export type KpiRateRow = {
  metric: 'jewelry' | 'bar' | 'qty'
  branch_code: string // 'Global' or a branch code
  staff_type: 'b2c' | 'b2b'
  year_month: string | null // YYYYMM
  points_per_unit: number
}

export type QtyTierRow = {
  branch_code: string // 'Global' or a branch code
  staff_type: 'b2c' | 'b2b' | null // null = ALL (legacy, shared)
  effective_from: string | null // YYYY-MM-DD, null when "standing"
  effective_to: string | null
  threshold: number
  score: number
  tier_order: number
}

export type MonthlyTargetRow = {
  branch_code: string
  year: number
  month: number
  kpi_point_target: number
  target_b2c: number | null
  target_b2b: number | null
}

export type RosterRow = {
  year_month: string // YYYYMM
  rep_code: string
  branch_code: string
  staff_type: 'b2c' | 'b2b'
  active: boolean
}

export type UserRow = {
  username: string
  full_name: string
  role: string
  branch_code: string
  supervisor_name: string
  active: string
  password_hash: string
}

// ── Month label helpers — must mirror electron/ipc/sheets.ts readableYearMonth /
// parseReadableYearMonth exactly, since that's the format actually written to the Sheet. ──

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function parseReadableYearMonth(label: string | undefined): string | null {
  const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec((label ?? '').trim())
  if (!m) return null
  const idx = MONTH_NAMES.findIndex(n => n.toLowerCase() === m[1].toLowerCase())
  if (idx === -1) return null
  return `${m[2]}${String(idx + 1).padStart(2, '0')}`
}

// ── Sheets client ─────────────────────────────────────────────────────────────

function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  return google.sheets({ version: 'v4', auth })
}

async function readTabRaw(tab: string): Promise<string[][]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
    range: `${tab}!A:Z`,
  })
  const rows = res.data.values as string[][] | null | undefined
  return rows && rows.length > 1 ? rows.slice(1) : []
}

// ── Cached readers (5-minute TTL) ─────────────────────────────────────────────

export const getEntries = unstable_cache(
  async (): Promise<EntryRow[]> => {
    const rows = await readTabRaw('Entries')
    return rows
      .map(r => ({
        entry_date:      r[0] ?? '',
        branch_code:     r[1] ?? '',
        rep_code:        r[2] ?? '',
        full_name:       r[3] ?? '',
        jewelry_weight_g: parseFloat(r[4] ?? '0') || 0,
        bar_weight_g:    parseFloat(r[5] ?? '0') || 0,
        quantity:        parseFloat(r[6] ?? '0') || 0,
      }))
      .filter(r => r.entry_date && r.rep_code)
  },
  ['sheets-entries'],
  { revalidate: 300, tags: ['entries'] }
)

export const getBranches = unstable_cache(
  async (): Promise<BranchRow[]> => {
    const rows = await readTabRaw('Branches')
    return rows
      .map(r => {
        const target = parseFloat(r[2] ?? '0') || 0
        const b2c = parseFloat(r[3] ?? '')
        const b2b = parseFloat(r[4] ?? '')
        return {
          code:                r[0] ?? '',
          name:                r[1] ?? '',
          kpi_point_target:    target,
          target_b2c_default:  isNaN(b2c) ? target : b2c,
          target_b2b_default:  isNaN(b2b) ? target : b2b,
        }
      })
      .filter(r => r.code)
  },
  ['sheets-branches'],
  { revalidate: 300, tags: ['config'] }
)

// KPIRates tab columns: Metric, Branch, Staff Type, Applies To, Points per Unit
// — must mirror pushKpiRates in electron/ipc/sheets.ts exactly.
export const getKpiRates = unstable_cache(
  async (): Promise<KpiRateRow[]> => {
    const rows = await readTabRaw('KPIRates')
    const METRICS: Record<string, 'jewelry' | 'bar' | 'qty'> = { jewelry: 'jewelry', bar: 'bar', qty: 'qty' }
    return rows
      .map(r => {
        const metric = METRICS[(r[0] ?? '').toLowerCase()]
        const staffType = (r[2] ?? '').toLowerCase() === 'b2b' ? 'b2b' : 'b2c'
        const appliesTo = r[3] ?? ''
        const yearMonth = appliesTo.toLowerCase().startsWith('standing') ? null : parseReadableYearMonth(appliesTo)
        return {
          metric,
          branch_code:     r[1] ?? '',
          staff_type:      staffType as 'b2c' | 'b2b',
          year_month:      yearMonth,
          points_per_unit: parseFloat(r[4] ?? '0') || 0,
        }
      })
      .filter((r): r is KpiRateRow => !!r.metric && !!r.branch_code)
  },
  ['sheets-kpi-rates'],
  { revalidate: 300, tags: ['config'] }
)

// QtyTiers tab columns: Branch, Staff Type, Applies To, "If Qty Is" (e.g. "≥ 900 pcs"),
// "Score Multiplier" (e.g. "× 5"), Tier Order — must mirror pushQtyTiers exactly.
export const getQtyTiers = unstable_cache(
  async (): Promise<QtyTierRow[]> => {
    const rows = await readTabRaw('QtyTiers')
    return rows
      .map(r => {
        const branchCode = r[0] ?? ''
        const staffTypeLabel = (r[1] ?? '').toUpperCase()
        const appliesTo = r[2] ?? ''
        const threshold = parseFloat((r[3] ?? '').replace(/[^0-9.]/g, ''))
        const score = parseFloat((r[4] ?? '').replace(/[^0-9.]/g, ''))
        const isStanding = appliesTo.toLowerCase().startsWith('standing')
        const range = isStanding ? null : /^(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})$/.exec(appliesTo)
        return {
          branch_code:    branchCode,
          staff_type:     staffTypeLabel === 'ALL' ? null : (staffTypeLabel === 'B2B' ? 'b2b' : 'b2c'),
          effective_from: isStanding ? null : range?.[1] ?? null,
          effective_to:   isStanding ? null : range?.[2] ?? null,
          threshold,
          score,
          tier_order:     parseInt(r[5] ?? '0') || 0,
        } as QtyTierRow
      })
      .filter(r => r.branch_code && !isNaN(r.threshold) && !isNaN(r.score))
  },
  ['sheets-qty-tiers'],
  { revalidate: 300, tags: ['config'] }
)

// MonthlyBranchTargets tab columns: Branch, Month, Target (pts/person), B2C Target Override,
// B2B Target Override — must mirror pushMonthlyBranchTargets exactly.
export const getMonthlyTargets = unstable_cache(
  async (): Promise<MonthlyTargetRow[]> => {
    const rows = await readTabRaw('MonthlyBranchTargets')
    return rows
      .map(r => {
        const ym = parseReadableYearMonth(r[1])
        const b2c = parseFloat(r[3] ?? '')
        const b2b = parseFloat(r[4] ?? '')
        return ym
          ? {
              branch_code:      r[0] ?? '',
              year:             parseInt(ym.slice(0, 4), 10),
              month:            parseInt(ym.slice(4), 10),
              kpi_point_target: parseFloat(r[2] ?? '0') || 0,
              target_b2c:       isNaN(b2c) ? null : b2c,
              target_b2b:       isNaN(b2b) ? null : b2b,
            }
          : null
      })
      .filter((r): r is MonthlyTargetRow => !!r && !!r.branch_code)
  },
  ['sheets-monthly-targets'],
  { revalidate: 300, tags: ['config'] }
)

// Roster tab columns: Month, rep_code, full_name, nickname, branch_code, supervisor_name,
// staff_type, active, supervisor_code — must mirror pushRoster exactly. Only the columns
// needed to resolve each rep's branch/staff_type/headcount as-of a given month are kept.
export const getRoster = unstable_cache(
  async (): Promise<RosterRow[]> => {
    const rows = await readTabRaw('Roster')
    return rows
      .map(r => {
        const ym = parseReadableYearMonth(r[0])
        return ym
          ? {
              year_month:  ym,
              rep_code:    r[1] ?? '',
              branch_code: r[4] ?? '',
              staff_type:  (r[6] ?? '').toLowerCase() === 'b2b' ? 'b2b' : 'b2c',
              active:      (r[7] ?? '1') !== '0',
            }
          : null
      })
      .filter((r): r is RosterRow => !!r && !!r.rep_code && !!r.branch_code)
  },
  ['sheets-roster'],
  { revalidate: 300, tags: ['config'] }
)

export const getUsers = unstable_cache(
  async (): Promise<UserRow[]> => {
    const rows = await readTabRaw('Users')
    return rows
      .map(r => ({
        username:        r[0] ?? '',
        full_name:       r[1] ?? '',
        role:            r[2] ?? '',
        branch_code:     r[3] ?? '',
        supervisor_name: r[4] ?? '',
        active:          r[5] ?? '0',
        password_hash:   r[6] ?? '',
      }))
      .filter(r => r.username)
  },
  ['sheets-users'],
  { revalidate: 300, tags: ['users'] }
)
