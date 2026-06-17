// ── CSV Parser ────────────────────────────────────────────────────────────
export interface ParseResult {
  headers: string[]
  rows: Record<string, string>[]
  rawRows: string[][]  // positional column arrays, no header row
  errors: string[]
}

export function parseCSV(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [], rawRows: [], errors: ['File is empty or has no data rows.'] }

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const errors: string[] = []
  const rows: Record<string, string>[] = []
  const rawRows: string[][] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitCSVLine(line)
    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${values.length}. Skipped.`)
      continue
    }
    const trimmed = values.map(v => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = trimmed[idx] })
    rows.push(row)
    rawRows.push(trimmed)
  }

  return { headers, rows, rawRows, errors }
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ── Column aliases (normalise various header spellings) ───────────────────
const ALIASES: Record<string, string> = {
  date: 'date', entry_date: 'date',
  rep_code: 'rep_code', rep_id: 'rep_code', staff_id: 'rep_code', id_staff: 'rep_code', salesman_id: 'rep_code', id: 'rep_code',
  full_name: 'full_name', name: 'full_name', salesman_name: 'full_name',
  branch_code: 'branch_code', branch: 'branch_code', branch_id: 'branch_code',
  nickname: 'nickname', nick: 'nickname',
  team_sup_name: 'supervisor_name', supervisor_name: 'supervisor_name', team_supervisor: 'supervisor_name', sup_name: 'supervisor_name',
  staff_type: 'staff_type', type: 'staff_type', customer_type: 'staff_type',
  point_target: 'point_target', kpi_target: 'point_target', monthly_target: 'point_target', points_target: 'point_target',
  year_month: 'year_month', yearmonth: 'year_month', yyyymm: 'year_month',
  kpi_1: 'jewelry_weight_g', jewelry_weight_g: 'jewelry_weight_g', jewelry: 'jewelry_weight_g',
  'jewelry_(baht)': 'jewelry_weight_g', 'jewelry_(g)': 'jewelry_weight_g', jewelry_weight: 'jewelry_weight_g',
  kpi_2: 'bar_weight_g', bar_weight_g: 'bar_weight_g', bar: 'bar_weight_g',
  'bar_(baht)': 'bar_weight_g', 'bar_(g)': 'bar_weight_g', bar_weight: 'bar_weight_g',
  kpi_3: 'quantity', quantity: 'quantity', qty: 'quantity', quantity_target: 'quantity',
  year: 'year', month: 'month',
  jewelry_target_g: 'jewelry_weight_g', bar_target_g: 'bar_weight_g',
  'jewelry_target_(g)': 'jewelry_weight_g', 'bar_target_(g)': 'bar_weight_g',
  'jewelry_target_(baht)': 'jewelry_weight_g', 'bar_target_(baht)': 'bar_weight_g',
}

export function normaliseRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    const canonical = ALIASES[k] ?? k
    out[canonical] = v
  }
  return out
}

// ── Validate & convert daily rows (rep_code based) ────────────────────────
export interface DailyRowRaw { date: string; repCode: string; jewelryWeightG: number; barWeightG: number; quantity: number }
export interface TargetRowRaw { repCode: string; year: number; month: number; jewelryWeightG: number; barWeightG: number; quantity: number }
export interface RosterRowRaw { repCode: string; fullName: string; nickname: string; branchCode: string; supervisorName: string; supervisorCode?: string; staffType: 'b2c' | 'b2b'; effectiveDate: string }

// Column positions for daily template: Date, Rep_Code, Full_Name, Branch_Code, Supervisor_Name, KPI_1, KPI_2, KPI_3
export function validateDailyRows(parsed: ParseResult): { rows: DailyRowRaw[]; errors: string[] } {
  const errors = [...parsed.errors]
  const rows: DailyRowRaw[] = []

  for (let i = 0; i < parsed.rawRows.length; i++) {
    const pos = parsed.rawRows[i]
    const lineNum = i + 2

    const date = pos[0] ?? ''
    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push(`Row ${lineNum}: Invalid date "${date}". Use YYYY-MM-DD format.`); continue
    }
    const repCode = pos[1] ?? ''
    if (!repCode) {
      errors.push(`Row ${lineNum}: Missing Rep Code.`); continue
    }

    rows.push({
      date,
      repCode,
      jewelryWeightG: parseFloat(pos[5] ?? '') || 0,
      barWeightG:     parseFloat(pos[6] ?? '') || 0,
      quantity:       parseInt(pos[7]   ?? '') || 0,
    })
  }

  return { rows, errors }
}

// Column positions for target template: Rep_Code, Full_Name, Branch_Code, Supervisor_Name, Year, Month, Jewelry_Target, Bar_Target, Quantity_Target
export function validateTargetRows(parsed: ParseResult): { rows: TargetRowRaw[]; errors: string[] } {
  const errors = [...parsed.errors]
  const rows: TargetRowRaw[] = []

  for (let i = 0; i < parsed.rawRows.length; i++) {
    const pos = parsed.rawRows[i]
    const lineNum = i + 2

    const repCode = pos[0] ?? ''
    if (!repCode) {
      errors.push(`Row ${lineNum}: Missing Rep Code.`); continue
    }
    const year  = parseInt(pos[4] ?? '')
    const month = parseInt(pos[5] ?? '')
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      errors.push(`Row ${lineNum}: Invalid year/month.`); continue
    }

    rows.push({
      repCode, year, month,
      jewelryWeightG: parseFloat(pos[6] ?? '') || 0,
      barWeightG:     parseFloat(pos[7] ?? '') || 0,
      quantity:       parseInt(pos[8]   ?? '') || 0,
    })
  }

  return { rows, errors }
}

// Column positions for roster template: Rep_Code, Full_Name, Nickname, Branch_Code, Team_Sup_Name,
// Staff_Type, Effective_Date (REQUIRED, YYYY-MM-DD), Sup_Code (optional, trailing — preferred
// match over Team_Sup_Name when present, since names collide/typo across Lao text and code doesn't).
// KPI point target is not part of the roster — it is always looked up from HR KPI Setting.
// Effective_Date is the month this roster row counts for — there is no app-level month picker;
// the file is the single source of truth for which month each row belongs to.
export function validateRosterRows(parsed: ParseResult): { rows: RosterRowRaw[]; errors: string[] } {
  const errors = [...parsed.errors]
  const rows: RosterRowRaw[] = []

  for (let i = 0; i < parsed.rawRows.length; i++) {
    const pos = parsed.rawRows[i]
    const lineNum = i + 2

    const repCode = (pos[0] ?? '').trim()
    if (!repCode) { errors.push(`Row ${lineNum}: Missing Rep Code.`); continue }
    const fullName = (pos[1] ?? '').trim()
    if (!fullName) { errors.push(`Row ${lineNum}: Missing Full Name.`); continue }
    const branchCode = (pos[3] ?? '').trim().toUpperCase()
    if (!branchCode) { errors.push(`Row ${lineNum}: Missing Branch Code.`); continue }

    const rawStaffType = (pos[5] ?? '').trim().toLowerCase()
    const staffType: 'b2c' | 'b2b' = rawStaffType === 'b2b' ? 'b2b' : 'b2c'

    const effectiveDate = (pos[6] ?? '').trim()
    if (!effectiveDate) { errors.push(`Row ${lineNum}: Missing Effective_Date — required, use YYYY-MM-DD.`); continue }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      errors.push(`Row ${lineNum}: Invalid Effective_Date "${effectiveDate}" — use YYYY-MM-DD.`); continue
    }

    rows.push({
      repCode, fullName,
      nickname:       (pos[2] ?? '').trim(),
      branchCode,
      supervisorName: (pos[4] ?? '').trim(),
      supervisorCode: (pos[7] ?? '').trim() || undefined, // optional trailing column — sup_code, preferred match over name when present
      staffType,
      effectiveDate,
    })
  }

  return { rows, errors }
}

// ── Template generators ───────────────────────────────────────────────────
interface SalesmanStub {
  id: number
  full_name: string
  branch_id: number
  branch_code: string
  supervisor_id?: number | null
  supervisor_name?: string | null
}

export function generateDailyTemplate(salesmen: SalesmanStub[], date: string): string {
  const header = 'Date,Staff_ID,Full_Name,Branch_ID,Supervisor_ID,Supervisor_Name,KPI_1 (Jewelry Weight g),KPI_2 (Bar Weight g),KPI_3 (Quantity)'
  const rows = salesmen.map(s =>
    `${date},${s.id},"${s.full_name}",${s.branch_id},${s.supervisor_id ?? ''},"${s.supervisor_name ?? 'Unassigned'}",0,0,0`
  )
  return [header, ...rows].join('\n')
}

export function generateTargetTemplate(salesmen: SalesmanStub[], year: number, month: number): string {
  const header = 'Staff_ID,Full_Name,Branch_ID,Supervisor_ID,Supervisor_Name,Year,Month,Jewelry_Target_g,Bar_Target_g,Quantity_Target'
  const rows = salesmen.map(s =>
    `${s.id},"${s.full_name}",${s.branch_id},${s.supervisor_id ?? ''},"${s.supervisor_name ?? 'Unassigned'}",${year},${month},0,0,0`
  )
  return [header, ...rows].join('\n')
}

export function downloadCSV(filename: string, content: string): void {
  const bom = '﻿' // UTF-8 BOM — makes Excel open correctly
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target?.result as string ?? '')
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file, 'utf-8')
  })
}
