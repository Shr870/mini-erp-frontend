export function qty(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString('en-IN', { maximumFractionDigits: 4 })
}

export function inr(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
}

export function when(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', { hour12: false })
}

export function num(value: string | number | null | undefined): number {
  return Number(value) || 0
}
