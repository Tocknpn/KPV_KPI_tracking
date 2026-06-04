// ── CSV Parser ────────────────────────────────────────────────────────────
export interface ParseResult {
  headers: string[]
  rows: Record<string, string>[]
  errors: string[]
}

export function parseCSV(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [], errors: ['File is empty or has no data rows.'] }

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const errors: string[] = []
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitCSVLine(line)
    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${values.length}. Skipped.`)
      continue
    }
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx].trim() })
    rows.push(row)
  }

  return { headers, rows, errors }
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
  staff_id: 'staff_id', id_staff: 'staff_id', salesman_id: 'staff_id', id: 'staff_id',
  full_name: 'full_name', name: 'full_name', salesman_name: 'full_name',
  branch_id: 'branch_id', branch: 'branch_id',
  kpi_1: 'jewelry_weight_g', jewelry_weight_g: 'jewelry_weight_g', jewelry: 'jewelry_weight_g', 'jewelry_(g)': 'jewelry_weight_g', jewelry_weight: 'jewelry_weight_g',
  kpi_2: 'bar_weight_g', bar_weight_g: 'bar_weight_g', bar: 'bar_weight_g', 'bar_(g)': 'bar_weight_g', bar_weight: 'bar_weight_g',
  kpi_3: 'quantity', quantity: 'quantity', qty: 'quantity', quantity_target: 'quantity',
  year: 'year', month: 'month',
  jewelry_target_g: 'jewelry_weight_g', bar_target_g: 'bar_weight_g', 'jewelry_target_(g)': 'jewelry_weight_g', 'bar_target_(g)': 'bar_weight_g',
}

export function normaliseRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(row)) {
    const canonical = ALIASES[k] ?? k
    out[canonical] = v
  }
  return out
}

// ── Validate & convert daily rows ─────────────────────────────────────────
export interface DailyRowRaw { date: string; salesmanId: number; branchId: number; jewelryWeightG: number; barWeightG: number; quantity: number }
export interface TargetRowRaw { salesmanId: number; branchId: number; year: number; month: number; jewelryWeightG: number; barWeightG: number; quantity: number }

export function validateDailyRows(parsed: ParseResult): { rows: DailyRowRaw[]; errors: string[] } {
  const errors = [...parsed.errors]
  const rows: DailyRowRaw[] = []

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = normaliseRow(parsed.rows[i])
    const lineNum = i + 2

    if (!raw.date || !raw.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push(`Row ${lineNum}: Invalid date "${raw.date}". Use YYYY-MM-DD format.`); continue
    }
    const salesmanId = parseInt(raw.staff_id)
    if (isNaN(salesmanId) || salesmanId <= 0) {
      errors.push(`Row ${lineNum}: Invalid Staff ID "${raw.staff_id}".`); continue
    }
    const branchId = parseInt(raw.branch_id)
    if (isNaN(branchId) || branchId <= 0) {
      errors.push(`Row ${lineNum}: Invalid Branch ID "${raw.branch_id}".`); continue
    }

    rows.push({
      date: raw.date,
      salesmanId,
      branchId,
      jewelryWeightG: parseFloat(raw.jewelry_weight_g) || 0,
      barWeightG:     parseFloat(raw.bar_weight_g)     || 0,
      quantity:       parseInt(raw.quantity)            || 0,
    })
  }

  return { rows, errors }
}

export function validateTargetRows(parsed: ParseResult): { rows: TargetRowRaw[]; errors: string[] } {
  const errors = [...parsed.errors]
  const rows: TargetRowRaw[] = []

  for (let i = 0; i < parsed.rows.length; i++) {
    const raw = normaliseRow(parsed.rows[i])
    const lineNum = i + 2

    const salesmanId = parseInt(raw.staff_id)
    if (isNaN(salesmanId) || salesmanId <= 0) {
      errors.push(`Row ${lineNum}: Invalid Staff ID "${raw.staff_id}".`); continue
    }
    const branchId = parseInt(raw.branch_id)
    if (isNaN(branchId) || branchId <= 0) {
      errors.push(`Row ${lineNum}: Invalid Branch ID "${raw.branch_id}".`); continue
    }
    const year  = parseInt(raw.year)
    const month = parseInt(raw.month)
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      errors.push(`Row ${lineNum}: Invalid year/month.`); continue
    }

    rows.push({
      salesmanId, branchId, year, month,
      jewelryWeightG: parseFloat(raw.jewelry_weight_g) || 0,
      barWeightG:     parseFloat(raw.bar_weight_g)     || 0,
      quantity:       parseInt(raw.quantity)            || 0,
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
