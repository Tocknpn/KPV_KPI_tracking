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
interface SalesmanStub { id: number; full_name: string; branch_id: number; branch_code: string }

export function generateDailyTemplateXLSX(salesmen: SalesmanStub[], date: string): Uint8Array {
  const headers = ['Date', 'Staff_ID', 'Full_Name', 'Branch_ID', 'KPI_1 (Jewelry Weight g)', 'KPI_2 (Bar Weight g)', 'KPI_3 (Quantity)']
  const dataRows = salesmen.map(s => [date, s.id, s.full_name, s.branch_id, 0, 0, 0])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  // Style header row bold
  ws['!cols'] = headers.map(() => ({ wch: 20 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Entry')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

export function generateTargetTemplateXLSX(salesmen: SalesmanStub[], year: number, month: number): Uint8Array {
  const headers = ['Staff_ID', 'Full_Name', 'Branch_ID', 'Year', 'Month', 'Jewelry_Target_g', 'Bar_Target_g', 'Quantity_Target']
  const dataRows = salesmen.map(s => [s.id, s.full_name, s.branch_id, year, month, 0, 0, 0])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  ws['!cols'] = headers.map(() => ({ wch: 20 }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Targets')
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
