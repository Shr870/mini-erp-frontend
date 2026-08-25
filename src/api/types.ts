export type AuthUser = {
  id: string
  email: string
  name: string
  roles: string[]
}

export type LoginResponse = { token: string; user: AuthUser }

export type Product = {
  id: string
  sku: string
  name: string
  unit: string
  is_active: boolean
}

export type Warehouse = { id: string; code: string; name: string }

export type ProductStock = {
  product_id: string
  warehouse_id: string
  physical_qty: string
  reserved_qty: string
  available_qty: string
  carrying_value: string
}

export type InventoryRow = Product & ProductStock

export type StockMovement = {
  id: string
  product_id: string
  sku: string
  product_name: string
  warehouse_id: string
  direction: 'IN' | 'OUT'
  quantity: string
  unit_cost: string
  reason: string
  reference_type: string
  reference_id: string
  journal_entry_id: string
  created_at: string
}

export type PoLine = {
  id: string
  product_id: string
  quantity: string
  unit_cost: string
  received_qty: string
  outstanding_qty: string
}

export type PurchaseOrder = {
  id: string
  po_number: string
  supplier_name: string
  status: string
  total_amount: string
  created_by?: string
  approved_by?: string | null
  created_at?: string
  lines?: PoLine[]
  goods_receipts?: Array<{
    id: string
    gr_number: string
    status: string
    received_by: string
    created_at: string
  }>
}

export type SoLine = {
  id: string
  product_id: string
  quantity?: string
  ordered_qty?: string
  unit_price: string
  reserved_qty: string
  backordered_qty: string
  fulfilled_qty: string
  reservation_status?: string | null
}

export type SalesOrder = {
  id: string
  so_number: string
  customer_name: string
  status: string
  total_amount: string
  warehouse_id?: string | null
  created_at?: string
  lines?: SoLine[]
}

export type Reconciliation = {
  formula: string
  derivation: {
    physical_qty_all_warehouses: string
    movement_carrying_value: string
    ledger_inventory_1300: string
    difference: string
  }
  accounts_involved: {
    inventory_asset: string
    affected_by: string[]
  }
  reconciled: boolean
  on_failure: string
}

export type JournalEntry = {
  id: string
  entry_number: string
  description: string
  reference_type: string
  reference_id: string
  posted_at: string
  total_debit?: string
  total_credit?: string
  lines?: Array<{
    id: string
    account_code: string
    account_name: string
    debit: string
    credit: string
  }>
  totals?: { debit: string; credit: string }
  balanced?: boolean
}
