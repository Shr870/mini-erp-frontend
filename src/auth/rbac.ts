/** Mirrors Stage 2 `requireRoles` plus the auditor GET-only bypass. Admin is not god-mode. */

export const GET_WAREHOUSE = [
  'sales',
  'warehouse',
  'procurement',
  'finance',
  'admin',
  'procurement_approver',
] as const

export const GET_PROCUREMENT = [
  'procurement',
  'procurement_approver',
  'warehouse',
  'finance',
  'admin',
] as const

export const GET_SALES = ['sales', 'warehouse', 'finance', 'admin'] as const

export const GET_FINANCE = ['finance', 'auditor', 'admin'] as const

export const POST = {
  createPO: ['procurement'],
  approvePO: ['procurement_approver'],
  goodsReceipt: ['warehouse'],
  adjustStock: ['finance'],
  createSO: ['sales'],
  fulfillSO: ['warehouse'],
  cancelSO: ['sales'],
  reverseJournal: ['finance'],
} as const

export function canGet(roles: string[], allowed: readonly string[]): boolean {
  if (roles.includes('auditor')) return true
  return allowed.some((r) => roles.includes(r))
}

export function canPost(roles: string[], allowed: readonly string[]): boolean {
  return allowed.some((r) => roles.includes(r))
}

export function navFor(roles: string[]) {
  return {
    warehouse: canGet(roles, GET_WAREHOUSE),
    procurement: canGet(roles, GET_PROCUREMENT),
    sales: canGet(roles, GET_SALES),
    finance: canGet(roles, GET_FINANCE),
  }
}

export function firstAllowedPath(roles: string[]): string {
  const n = navFor(roles)
  if (n.warehouse) return '/warehouse'
  if (n.procurement) return '/procurement'
  if (n.sales) return '/sales'
  if (n.finance) return '/finance'
  return '/login'
}

export const SEEDED_USERS: Array<{ email: string; role: string; note: string }> = [
  { email: 'sales@northwind.local', role: 'sales', note: 'Create/cancel SOs; live stock; no PO/GR/ledger' },
  { email: 'warehouse@northwind.local', role: 'warehouse', note: 'GR + fulfill; cannot create PO/SO' },
  { email: 'procurement@northwind.local', role: 'procurement', note: 'Create POs; cannot approve, GR, or sell' },
  { email: 'approver@northwind.local', role: 'procurement_approver', note: 'Approve POs ≥ ₹50k only' },
  { email: 'finance@northwind.local', role: 'finance', note: 'Recon, journals, reverse, stock adjust' },
  { email: 'auditor@northwind.local', role: 'auditor', note: 'GET-only on every view; all POSTs 403' },
  { email: 'admin@northwind.local', role: 'admin', note: 'Reads; not god-mode writes' },
]
