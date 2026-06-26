import * as XLSX from 'xlsx'
import type { ParseResult } from './csv'

// ── Read XLSX file as ParseResult (same shape as CSV parser output) ────────
export function parseXLSX(buffer: ArrayBuffer): ParseResult {
  const errors: string[] = []
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return { headers: [], rows: [], rawRows: [], errors: ['File has no sheets.'] }

    const sheet = workbook.Sheets[sheetName]
    const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    if (raw.length < 2) return { headers: [], rows: [], rawRows: [], errors: ['File is empty or has no data rows.'] }

    const headerRow = raw[0] as string[]
    const headers = headerRow.map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'))

    const rows: Record<string, string>[] = []
    const rawRows: string[][] = []
    for (let i = 1; i < raw.length; i++) {
      const rowArr = raw[i] as unknown[]
      const isEmpty = rowArr.every(v => v === '' || v == null)
      if (isEmpty) continue
      if (rowArr.length !== headers.length) {
        errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${rowArr.length}. Skipped.`)
        continue
      }
      const trimmed = rowArr.map(v => String(v ?? '').trim())
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = trimmed[idx] })
      rows.push(row)
      rawRows.push(trimmed)
    }

    return { headers, rows, rawRows, errors }
  } catch (e) {
    return { headers: [], rows: [], rawRows: [], errors: [e instanceof Error ? e.message : 'Failed to parse XLSX file.'] }
  }
}

// ── Read file as ArrayBuffer ───────────────────────────────────────────────
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

// ── Template generators ───────────────────────────────────────────────────
// Force a column to Excel's "Text" number format (@) so typed values like 2026-06-26
// stay literal strings instead of Excel auto-converting them to a date serial (e.g. 46199),
// which is what caused upload date-mismatch errors on some devices/locales.
function forceTextColumn(ws: XLSX.WorkSheet, colIndex: number, rowCount: number): void {
  for (let r = 0; r < rowCount; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: colIndex })
    const cell = ws[addr]
    if (!cell) continue
    cell.t = 's'
    cell.z = '@'
  }
}

interface SalesmanStub {
  id: number
  rep_code?: string | null
  full_name: string
  branch_id: number
  branch_code: string
  supervisor_id?: number | null
  supervisor_name?: string | null
}

export function generateDailyTemplateXLSX(salesmen: SalesmanStub[], date: string): Uint8Array {
  const headers = [
    'Date', 'Rep_Code', 'Full_Name', 'Branch_Code',
    'Supervisor_Name',
    'KPI_1 (Jewelry Baht)', 'KPI_2 (Bar Baht)', 'KPI_3 (Quantity)',
  ]
  const dataRows = salesmen.map(s => [
    date, s.rep_code ?? '', s.full_name, s.branch_code,
    s.supervisor_name ?? 'Unassigned',
    0, 0, 0,
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 14 }, // Rep_Code
    { wch: 24 }, // Full_Name
    { wch: 12 }, // Branch_Code
    { wch: 24 }, // Supervisor_Name
    { wch: 20 }, // KPI_1
    { wch: 16 }, // KPI_2
    { wch: 14 }, // KPI_3
  ]
  forceTextColumn(ws, 0, dataRows.length + 1) // Date column, header + data rows

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Entry')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

export function generateTargetTemplateXLSX(salesmen: SalesmanStub[], year: number, month: number): Uint8Array {
  const headers = [
    'Rep_Code', 'Full_Name', 'Branch_Code',
    'Supervisor_Name',
    'Year', 'Month', 'Jewelry_Target (Baht)', 'Bar_Target (Baht)', 'Quantity_Target',
  ]
  const dataRows = salesmen.map(s => [
    s.rep_code ?? '', s.full_name, s.branch_code,
    s.supervisor_name ?? 'Unassigned',
    year, month, 0, 0, 0,
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  ws['!cols'] = [
    { wch: 14 }, // Rep_Code
    { wch: 24 }, // Full_Name
    { wch: 12 }, // Branch_Code
    { wch: 24 }, // Supervisor_Name
    { wch: 8  }, // Year
    { wch: 8  }, // Month
    { wch: 20 }, // Jewelry_Target
    { wch: 16 }, // Bar_Target
    { wch: 16 }, // Quantity_Target
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Targets')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

interface RosterStub {
  rep_code?: string | null
  full_name: string
  nickname?: string | null
  branch_code: string
  supervisor_name?: string | null
  supervisor_code?: string | null
  staff_type?: string | null
}

// KPI point target is not part of the roster — it is always looked up from HR KPI Setting.
// Effective_Date (REQUIRED, YYYY-MM-DD) is the month this row counts for — there is no
// month picker in the app; the file is the only source of truth for which month a row belongs to.
// Sup_Code AND Team_Sup_Name are both required now — name alone used to silently auto-create
// a duplicate supervisor whenever it didn't exactly match an existing one (typo, nickname,
// Lao spelling variant). Code is the only unambiguous match, but the name still has to agree.
export function generateRosterTemplateXLSX(salesmen: RosterStub[]): Uint8Array {
  const today = new Date().toISOString().split('T')[0]
  const headers = ['Rep_Code', 'Full_Name', 'Nickname', 'Branch_Code', 'Team_Sup_Name (required)', 'Staff_Type', 'Effective_Date (required)', 'Sup_Code (required)']
  const dataRows = salesmen.length > 0
    ? salesmen.map(s => [
        s.rep_code ?? '', s.full_name, s.nickname ?? '', s.branch_code,
        s.supervisor_name ?? '', s.staff_type ?? 'b2c', today, s.supervisor_code ?? '',
      ])
    : [['', '', '', '', '', 'b2c', today, '']]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  ws['!cols'] = [
    { wch: 14 }, // Rep_Code
    { wch: 26 }, // Full_Name
    { wch: 14 }, // Nickname
    { wch: 12 }, // Branch_Code
    { wch: 26 }, // Team_Sup_Name
    { wch: 12 }, // Staff_Type
    { wch: 14 }, // Effective_Date
    { wch: 16 }, // Sup_Code
  ]
  forceTextColumn(ws, 6, dataRows.length + 1) // Effective_Date column, header + data rows

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Roster')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

// ── Sample Sheet generator ──────────────────────────────────────────────────
// One worksheet per Google Sheets tab the app pushes, exact same headers as
// electron/ipc/sheets.ts's writeTab() calls, with a couple of example rows — for pasting
// into a brand-new Google Sheet before connecting the app to it. Pure static placeholder
// data, no DB read — replaces the old "Force Full Sync" admin button, which pushed
// whatever was currently in the local DB (including leftover test/seed data) straight over
// the connected Sheet with no guardrail distinguishing real data from sample data.
export function generateSampleWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new()
  const addTab = (name: string, rows: (string | number)[][]) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }

  addTab('Entries', [
    ['Date', 'Branch', 'Rep Code', 'Salesman Name', 'Jewelry (Baht)', 'Bar (Baht)', 'Qty'],
    ['2026-01-01', 'Morning Market', 'MM-A-001', 'Somchai Phommachan', 45.5, 12.0, 2],
  ])
  addTab('Settings', [
    ['Setting', 'Value'],
    ['Default Supervisor Commission Share (%)', '30'],
  ])
  addTab('Branches', [
    ['code', 'name', 'kpi_point_target'],
    ['MM', 'Morning Market', 8000],
    ['VC', 'Vientiane Center', 5500],
    ['IT', 'ITecc', 6000],
    ['VT', 'VangThong', 7000],
  ])
  addTab('KPIRates', [
    ['Metric', 'Branch', 'Staff Type', 'Applies To', 'Points per Unit'],
    ['Jewelry', 'MM', 'B2C', 'Standing (all months)', 15],
    ['Bar', 'MM', 'B2C', 'Standing (all months)', 7.5],
  ])
  addTab('QtyTiers', [
    ['Branch', 'Applies To', 'If Qty Is', 'Score Multiplier', 'Tier Order'],
    ['MM', 'B2C', '>= 50', 2, 1],
    ['MM', 'B2C', '>= 200', 3, 2],
  ])
  addTab('Roster', [
    ['Month', 'rep_code', 'full_name', 'nickname', 'branch_code', 'supervisor_name', 'staff_type', 'active', 'supervisor_code'],
    ['Jan 2026', 'MM-A-001', 'Somchai Phommachan', 'Som', 'MM', 'Somvang Phongsavanh', 'b2c', 1, 'MM-SUP-01'],
  ])
  addTab('CommissionConfig', [
    ['Month', 'Staff Type', 'Jewelry Rate (₭/Baht)', 'Bar Rate (₭/Baht)', 'Qty Rate (₭/pc)'],
    ['Jan 2026', 'B2C', 5000, 3000, 500],
    ['Jan 2026', 'B2B', 8000, 5000, 800],
  ])
  addTab('Users', [
    ['username', 'full_name', 'role', 'branch_code', 'supervisor_name', 'active', 'password'],
    ['sup_mm', 'Supervisor Morning Market', 'sales_sup', 'MM', '', 1, 'changeMe123'],
  ])
  addTab('Supervisors', [
    ['full_name', 'nickname', 'branch_code', 'staff_type', 'active', 'sup_code'],
    ['Somvang Phongsavanh', 'Somvang', 'MM', 'b2c', 1, 'MM-SUP-01'],
  ])
  addTab('MonthlyBranchTargets', [
    ['Branch', 'Month', 'Target (pts/person)', 'B2C Target Override', 'B2B Target Override'],
    ['MM', 'Jan 2026', 8000, '', ''],
  ])

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

// ── Generic rows → XLSX (Reports screen exports) ────────────────────────────
// XLSX over CSV here specifically because production data contains Lao script — CSV has
// no encoding declaration and mangles non-Latin text when opened in Excel; XLSX is UTF-8
// native and round-trips Lao characters correctly.
export function generateRowsXLSX(rows: Array<Record<string, string | number>>, sheetName = 'Report'): Uint8Array {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)) // sheet names cap at 31 chars
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

// ── Download XLSX blob ─────────────────────────────────────────────────────
export function downloadXLSX(filename: string, data: Uint8Array): void {
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
