import * as XLSX from 'xlsx'
import type { ParseResult } from './csv'

// ── Read XLSX file as ParseResult (same shape as CSV parser output) ────────
export function parseXLSX(buffer: ArrayBuffer): ParseResult {
  const errors: string[] = []
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return { headers: [], rows: [], errors: ['File has no sheets.'] }

    const sheet = workbook.Sheets[sheetName]
    const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    if (raw.length < 2) return { headers: [], rows: [], errors: ['File is empty or has no data rows.'] }

    const headerRow = raw[0] as string[]
    const headers = headerRow.map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'))

    const rows: Record<string, string>[] = []
    for (let i = 1; i < raw.length; i++) {
      const rowArr = raw[i] as unknown[]
      const isEmpty = rowArr.every(v => v === '' || v == null)
      if (isEmpty) continue
      if (rowArr.length !== headers.length) {
        errors.push(`Row ${i + 1}: expected ${headers.length} columns, got ${rowArr.length}. Skipped.`)
        continue
      }
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = String(rowArr[idx] ?? '').trim() })
      rows.push(row)
    }

    return { headers, rows, errors }
  } catch (e) {
    return { headers: [], rows: [], errors: [e instanceof Error ? e.message : 'Failed to parse XLSX file.'] }
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
  staff_type?: string | null
  point_target?: number | null
  year_month?: string | null
}

export function generateRosterTemplateXLSX(salesmen: RosterStub[]): Uint8Array {
  const headers = ['Rep_Code', 'Full_Name', 'Nickname', 'Branch_Code', 'Team_Sup_Name', 'Staff_Type', 'Year_Month', 'Point_Target']
  const dataRows = salesmen.length > 0
    ? salesmen.map(s => [
        s.rep_code ?? '', s.full_name, s.nickname ?? '', s.branch_code,
        s.supervisor_name ?? '', s.staff_type ?? 'b2c', s.year_month ?? '',
        s.point_target ?? 0,
      ])
    : [['', '', '', '', '', 'b2c', '', 0]]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  ws['!cols'] = [
    { wch: 14 }, // Rep_Code
    { wch: 26 }, // Full_Name
    { wch: 14 }, // Nickname
    { wch: 12 }, // Branch_Code
    { wch: 26 }, // Team_Sup_Name
    { wch: 12 }, // Staff_Type
    { wch: 12 }, // Year_Month
    { wch: 14 }, // Point_Target
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Roster')
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
