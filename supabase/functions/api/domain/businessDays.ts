// GERADO por tools/sync-domain.ts — NÃO EDITAR. Origem: src/utils/businessDays.ts (sha256 f9699ba0bcb41137f9a075d028622ba7d1b9990528455f3ab86faa3488586afb)
import { addDays, isSameDay, parseISO, differenceInCalendarDays, format } from 'date-fns'
import { Workdays } from './types.ts'

function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some((h) => isSameDay(h, date))
}

function isWeekdayOff(date: Date, workdays: Workdays): boolean {
  const day = date.getDay()
  if (workdays === 'mon-sat') return day === 0
  return day === 0 || day === 6
}

function isWorkday(date: Date, holidays: Date[], workdays: Workdays = 'mon-fri'): boolean {
  return !isWeekdayOff(date, workdays) && !isHoliday(date, holidays)
}

export function parseHolidays(isoStrings: string[]): Date[] {
  return isoStrings.map((s) => parseISO(s))
}

export function addWorkdays(start: Date, days: number, holidays: Date[], workdays: Workdays = 'mon-fri'): Date {
  if (days === 0) return start
  let current = start
  let remaining = Math.abs(days)
  const step = days > 0 ? 1 : -1
  while (remaining > 0) {
    current = addDays(current, step)
    if (isWorkday(current, holidays, workdays)) {
      remaining--
    }
  }
  return current
}

export function workdaysBetween(start: Date, end: Date, holidays: Date[], workdays: Workdays = 'mon-fri'): number {
  if (isSameDay(start, end)) return 0
  const totalDays = differenceInCalendarDays(end, start)
  const step = totalDays > 0 ? 1 : -1
  let count = 0
  let current = start
  const limit = Math.abs(totalDays)
  for (let i = 0; i < limit; i++) {
    current = addDays(current, step)
    if (isWorkday(current, holidays, workdays)) count++
  }
  return totalDays > 0 ? count : -count
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}
