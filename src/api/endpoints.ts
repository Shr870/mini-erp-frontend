import { apiRequest } from './http.ts'
import type {
  InventoryRow,
  JournalEntry,
  LoginResponse,
  Product,
  ProductStock,
  PurchaseOrder,
  Reconciliation,
  SalesOrder,
  StockMovement,
  Warehouse,
} from './types.ts'

type Tok = { token: string | null; idempotencyKey?: string }

export const api = {
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),

  warehouses: (t: Tok) =>
    apiRequest<{ warehouses: Warehouse[] }>('/warehouses', { token: t.token }),

  products: (t: Tok) => apiRequest<{ products: Product[] }>('/products', { token: t.token }),

  stock: (t: Tok, productId: string, warehouseId: string) =>
    apiRequest<ProductStock>(
      `/products/${productId}/stock?warehouse_id=${encodeURIComponent(warehouseId)}`,
      { token: t.token },
    ),

  inventory: (t: Tok, warehouseId: string) =>
    apiRequest<{ warehouse_id: string; rows: InventoryRow[] }>(
      `/inventory?warehouse_id=${encodeURIComponent(warehouseId)}`,
      { token: t.token },
    ),

  movements: (t: Tok, warehouseId: string, productId?: string) => {
    const q = new URLSearchParams({ warehouse_id: warehouseId })
    if (productId) q.set('product_id', productId)
    return apiRequest<{ movements: StockMovement[] }>(`/stock-movements?${q}`, { token: t.token })
  },

  adjust: (
    t: Tok,
    body: {
      product_id: string
      warehouse_id: string
      direction: 'IN' | 'OUT'
      quantity: string
      unit_cost?: string
      reason: string
    },
  ) =>
    apiRequest('/inventory-adjustments', {
      token: t.token,
      idempotencyKey: t.idempotencyKey,
      body,
    }),

  listPOs: (t: Tok) =>
    apiRequest<{ purchase_orders: PurchaseOrder[] }>('/purchase-orders', { token: t.token }),

  getPO: (t: Tok, id: string) => apiRequest<PurchaseOrder>(`/purchase-orders/${id}`, { token: t.token }),

  createPO: (
    t: Tok,
    body: { supplier_name: string; lines: Array<{ product_id: string; quantity: string; unit_cost: string }> },
  ) => apiRequest<PurchaseOrder>('/purchase-orders', { token: t.token, body }),

  approvePO: (t: Tok, id: string) =>
    apiRequest(`/purchase-orders/${id}/approve`, { token: t.token, method: 'POST', body: {} }),

  goodsReceipt: (
    t: Tok,
    poId: string,
    body: { warehouse_id: string; lines: Array<{ po_line_id: string; quantity: string }> },
  ) =>
    apiRequest(`/purchase-orders/${poId}/goods-receipts`, {
      token: t.token,
      idempotencyKey: t.idempotencyKey,
      body,
    }),

  listSOs: (t: Tok) => apiRequest<{ sales_orders: SalesOrder[] }>('/sales-orders', { token: t.token }),

  getSO: (t: Tok, id: string) => apiRequest<SalesOrder>(`/sales-orders/${id}`, { token: t.token }),

  createSO: (
    t: Tok,
    body: {
      customer_name: string
      warehouse_id: string
      lines: Array<{ product_id: string; quantity: string; unit_price: string }>
    },
  ) =>
    apiRequest<SalesOrder>('/sales-orders', {
      token: t.token,
      idempotencyKey: t.idempotencyKey,
      body,
    }),

  fulfillSO: (
    t: Tok,
    id: string,
    body: { warehouse_id: string; lines: Array<{ so_line_id: string; quantity: string }> },
  ) =>
    apiRequest(`/sales-orders/${id}/fulfill`, {
      token: t.token,
      idempotencyKey: t.idempotencyKey,
      body,
    }),

  cancelSO: (t: Tok, id: string) =>
    apiRequest(`/sales-orders/${id}/cancel`, { token: t.token, method: 'POST', body: {} }),

  recon: (t: Tok) => apiRequest<Reconciliation>('/ledger/reconciliation', { token: t.token }),

  listJournals: (t: Tok) =>
    apiRequest<{ journal_entries: JournalEntry[] }>('/ledger/journal-entries', { token: t.token }),

  getJournal: (t: Tok, id: string) =>
    apiRequest<JournalEntry>(`/ledger/journal-entries/${id}`, { token: t.token }),

  reverseJournal: (t: Tok, id: string) =>
    apiRequest(`/ledger/journal-entries/${id}/reverse`, { token: t.token, method: 'POST', body: {} }),
}
