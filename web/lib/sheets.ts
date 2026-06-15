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
}

export type QtyTierRow = {
  branch_code: string
  threshold: number
  multiplier: number
  tier_order: number
}

export type MonthlyTargetRow = {
  branch_code: string
  year: number
  month: number
  kpi_point_target: number
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
      .map(r => ({
        code:              r[0] ?? '',
        name:              r[1] ?? '',
        kpi_point_target:  parseFloat(r[2] ?? '0') || 0,
      }))
      .filter(r => r.code)
  },
  ['sheets-branches'],
  { revalidate: 300, tags: ['config'] }
)

export const getSettings = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const rows = await readTabRaw('Settings')
    return Object.fromEntries(rows.filter(r => r[0]).map(r => [r[0], r[1] ?? '']))
  },
  ['sheets-settings'],
  { revalidate: 300, tags: ['config'] }
)

export const getQtyTiers = unstable_cache(
  async (): Promise<QtyTierRow[]> => {
    const rows = await readTabRaw('QtyTiers')
    return rows
      .map(r => ({
        branch_code: r[0] ?? '',
        threshold:   parseFloat(r[1] ?? '0') || 0,
        multiplier:  parseFloat(r[2] ?? '0') || 0,
        tier_order:  parseInt(r[3]  ?? '0') || 0,
      }))
      .filter(r => r.branch_code)
  },
  ['sheets-qty-tiers'],
  { revalidate: 300, tags: ['config'] }
)

export const getMonthlyTargets = unstable_cache(
  async (): Promise<MonthlyTargetRow[]> => {
    const rows = await readTabRaw('MonthlyBranchTargets')
    return rows
      .map(r => ({
        branch_code:      r[0] ?? '',
        year:             parseInt(r[1] ?? '0') || 0,
        month:            parseInt(r[2] ?? '0') || 0,
        kpi_point_target: parseFloat(r[3] ?? '0') || 0,
      }))
      .filter(r => r.branch_code && r.year && r.month)
  },
  ['sheets-monthly-targets'],
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
