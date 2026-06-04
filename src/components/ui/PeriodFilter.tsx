import { useEffect, useRef, useState } from 'react'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Month picker dropdown ─────────────────────────────────────────────────
interface MonthDropdownProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}

export function MonthDropdown({ year, month, onChange }: MonthDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const options: Array<{ y: number; m: number; label: string }> = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({ y: d.getFullYear(), m: d.getMonth() + 1, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container text-on-surface text-body-sm hover:bg-surface-container-high transition-colors border border-white/20"
      >
        <span className="material-symbols-outlined text-sm text-primary">calendar_month</span>
        {MONTH_NAMES[month - 1]} {year}
        <span className="material-symbols-outlined text-sm text-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-xl shadow-xl rounded-xl border border-white/40 z-50 min-w-40 py-1 max-h-64 overflow-y-auto">
          {options.map(o => (
            <button
              key={`${o.y}-${o.m}`}
              onClick={() => { onChange(o.y, o.m); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 text-body-sm hover:bg-primary/5 transition-colors ${
                o.y === year && o.m === month ? 'text-primary font-bold' : 'text-on-surface'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Date range bar (From → To) ─────────────────────────────────────────────
interface DateRangeBarProps {
  year: number
  month: number
  dateFrom: string
  dateTo: string
  maxDate: string          // upper bound for dateTo (today for current month, last day otherwise)
  onDateFromChange: (v: string) => void
  onDateToChange:   (v: string) => void
}

export function DateRangeBar({ year, month, dateFrom, dateTo, maxDate, onDateFromChange, onDateToChange }: DateRangeBarProps) {
  const minFrom = `${year}-${String(month).padStart(2, '0')}-01`
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-white/20 shadow-sm">
      <span className="material-symbols-outlined text-sm text-primary">date_range</span>
      <input
        type="date"
        value={dateFrom}
        min={minFrom}
        max={dateTo}
        onChange={e => onDateFromChange(e.target.value)}
        className="text-body-sm bg-transparent border-none outline-none text-on-surface w-[118px]"
      />
      <span className="text-on-surface-variant text-xs">→</span>
      <input
        type="date"
        value={dateTo}
        min={dateFrom}
        max={maxDate}
        onChange={e => onDateToChange(e.target.value)}
        className="text-body-sm bg-transparent border-none outline-none text-on-surface w-[118px]"
      />
    </div>
  )
}
