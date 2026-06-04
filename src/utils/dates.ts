export function getDefaultDateRange(year: number, month: number): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateFrom = `${year}-${pad(month)}-01`
  const dateTo = isCurrentMonth
    ? now.toISOString().split('T')[0]
    : `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`
  return { dateFrom, dateTo }
}

export function dayOfMonthFrom(dateTo: string): number {
  return new Date(dateTo + 'T00:00:00').getDate()
}
