import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/endpoints.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { canPost, POST } from '../auth/rbac.ts'
import { BusyButton, EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../components/Ui.tsx'
import { inr, qty, skuOf, when } from '../lib/format.ts'
import { useIdempotencyKey } from '../lib/idempotency.ts'

export function ProcurementPage() {
  const { token, user } = useAuth()
  const qc = useQueryClient()
  const roles = user?.roles ?? []
  const canCreate = canPost(roles, POST.createPO)
  const canApprove = canPost(roles, POST.approvePO)
  const canGR = canPost(roles, POST.goodsReceipt)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listQ = useQuery({
    queryKey: ['pos', token],
    queryFn: () => api.listPOs({ token }),
    enabled: Boolean(token),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const detailQ = useQuery({
    queryKey: ['po', token, selectedId],
    queryFn: () => api.getPO({ token }, selectedId!),
    enabled: Boolean(token && selectedId),
    staleTime: 0,
  })

  const productsQ = useQuery({
    queryKey: ['products', token],
    queryFn: () => api.products({ token }),
    enabled: Boolean(token),
  })

  const whQ = useQuery({
    queryKey: ['warehouses', token],
    queryFn: () => api.warehouses({ token }),
    enabled: Boolean(token && canGR),
  })

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Procurement</h1>
          <p className="muted">
            List <code>GET /purchase-orders</code>, detail includes <code>outstanding_qty</code> per line.
            Partial GR is a warehouse POST; over-receipt is 422 from Stage 2, not a UI invention.
          </p>
        </div>
      </header>

      {listQ.error ? <ErrorBanner err={listQ.error} onRetry={() => void listQ.refetch()} /> : null}

      <div className="split">
        <div>
          {canCreate ? (
            <CreatePO
              products={productsQ.data?.products ?? []}
              onCreated={(id) => {
                setSelectedId(id)
                void qc.invalidateQueries({ queryKey: ['pos'] })
              }}
            />
          ) : (
            <p className="banner banner-info">
              Creating POs requires role <code>procurement</code>. This session cannot POST /purchase-orders (API 403).
            </p>
          )}

          {listQ.isLoading ? <LoadingState label="Loading purchase orders…" /> : null}
          {listQ.data && listQ.data.purchase_orders.length === 0 ? (
            <EmptyState title="No purchase orders" hint="Create one, or this is a fresh seed with no documents." />
          ) : null}
          {listQ.data && listQ.data.purchase_orders.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PO</th>
                    <th>Supplier</th>
                    <th>Status</th>
                    <th className="num">Total</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.purchase_orders.map((po) => (
                    <tr
                      key={po.id}
                      className={selectedId === po.id ? 'is-selected' : undefined}
                      onClick={() => setSelectedId(po.id)}
                    >
                      <td>{po.po_number}</td>
                      <td>{po.supplier_name}</td>
                      <td>
                        <StatusBadge status={po.status} />
                      </td>
                      <td className="num">{inr(po.total_amount)}</td>
                      <td>{when(po.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="panel">
          {!selectedId ? <p className="muted">Select a PO.</p> : null}
          {detailQ.isLoading ? <LoadingState /> : null}
          {detailQ.error ? <ErrorBanner err={detailQ.error} /> : null}
          {detailQ.data ? (
            <>
              <h2>
                {detailQ.data.po_number} <StatusBadge status={detailQ.data.status} />
              </h2>
              <p>
                {detailQ.data.supplier_name} · {inr(detailQ.data.total_amount)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Ordered</th>
                    <th className="num">Received</th>
                    <th className="num">Outstanding</th>
                    <th className="num">Unit cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailQ.data.lines ?? []).map((line) => (
                    <tr key={line.id}>
                      <td className="mono">{skuOf(productsQ.data?.products, line.product_id)}</td>
                      <td className="num">{qty(line.quantity)}</td>
                      <td className="num">{qty(line.received_qty)}</td>
                      <td className="num">{qty(line.outstanding_qty)}</td>
                      <td className="num">{inr(line.unit_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {canApprove && detailQ.data.status === 'pending_approval' ? (
                <ApproveButton
                  poId={detailQ.data.id}
                  onDone={() => void qc.invalidateQueries({ queryKey: ['po'] })}
                />
              ) : null}

              {canGR && ['approved', 'partially_received'].includes(detailQ.data.status) ? (
                <GRForm
                  key={`${detailQ.data.id}-${(detailQ.data.lines ?? []).map((l) => l.outstanding_qty).join(',')}`}
                  poId={detailQ.data.id}
                  warehouseId={whQ.data?.warehouses[0]?.id ?? ''}
                  lines={detailQ.data.lines ?? []}
                  onDone={() => {
                    void qc.invalidateQueries({ queryKey: ['po'] })
                    void qc.invalidateQueries({ queryKey: ['pos'] })
                    void qc.invalidateQueries({ queryKey: ['inventory'] })
                    void qc.invalidateQueries({ queryKey: ['movements'] })
                    void qc.invalidateQueries({ queryKey: ['recon'] })
                    void qc.invalidateQueries({ queryKey: ['journals'] })
                  }}
                />
              ) : null}

              {!canGR && !canApprove ? (
                <p className="muted">
                  Approve is procurement_approver; goods receipt is warehouse. This role is read-only here.
                </p>
              ) : null}

              <h3>Goods receipts</h3>
              {(detailQ.data.goods_receipts ?? []).length === 0 ? (
                <EmptyState title="No receipts yet" />
              ) : (
                <ul>
                  {(detailQ.data.goods_receipts ?? []).map((gr) => (
                    <li key={gr.id}>
                      {gr.gr_number} · {when(gr.created_at)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function CreatePO({
  products,
  onCreated,
}: {
  products: Array<{ id: string; sku: string; name: string }>
  onCreated: (id: string) => void
}) {
  const { token } = useAuth()
  const [supplier, setSupplier] = useState('Exotic Liquids')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [quantity, setQuantity] = useState('10')
  const [unitCost, setUnitCost] = useState('5')
  const pid = productId || products[0]?.id || ''
  const mut = useMutation({
    mutationFn: () =>
      api.createPO(
        { token },
        {
          supplier_name: supplier,
          lines: [{ product_id: pid, quantity, unit_cost: unitCost }],
        },
      ),
    onSuccess: (po) => onCreated(po.id),
  })
  const overThreshold = Number(quantity) * Number(unitCost) >= 50000

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pid) return
        mut.mutate()
      }}
    >
      <h2>Create purchase order</h2>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      <label>
        Supplier
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} required />
      </label>
      <label>
        Product
        <select value={pid} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row2">
        <label>
          Qty
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
        <label>
          Unit cost
          <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
        </label>
      </div>
      <p className="muted">
        Line total {inr(Number(quantity) * Number(unitCost) || 0)}.
        {overThreshold
          ? ' ≥ ₹50,000 → pending_approval (needs procurement_approver).'
          : ' < ₹50,000 → Stage 2 auto-approves, approved_by stays NULL.'}
      </p>
      <BusyButton type="submit" busy={mut.isPending} disabled={!pid}>
        Create PO
      </BusyButton>
    </form>
  )
}

function ApproveButton({ poId, onDone }: { poId: string; onDone: () => void }) {
  const { token } = useAuth()
  const mut = useMutation({
    mutationFn: () => api.approvePO({ token }, poId),
    onSuccess: onDone,
  })
  return (
    <div>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      <BusyButton type="button" busy={mut.isPending} onClick={() => mut.mutate()}>
        Approve PO
      </BusyButton>
    </div>
  )
}

function GRForm({
  poId,
  warehouseId,
  lines,
  onDone,
}: {
  poId: string
  warehouseId: string
  lines: Array<{ id: string; outstanding_qty: string; product_id: string }>
  onDone: () => void
}) {
  const { token } = useAuth()
  const defaults = Object.fromEntries(lines.map((l) => [l.id, String(Number(l.outstanding_qty))]))
  const [qtys, setQtys] = useState<Record<string, string>>(defaults)
  const payload = {
    warehouse_id: warehouseId,
    lines: lines
      .map((l) => ({ po_line_id: l.id, quantity: qtys[l.id] ?? '0' }))
      .filter((l) => Number(l.quantity) > 0),
  }
  const idemp = useIdempotencyKey(payload)
  const mut = useMutation({
    mutationFn: () => api.goodsReceipt({ token, idempotencyKey: idemp.key }, poId, payload),
    onSuccess: () => {
      idemp.rotate()
      onDone()
    },
  })

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        mut.mutate()
      }}
    >
      <h3>Record goods receipt (partial allowed)</h3>
      <p className="muted">
        Default qty = outstanding. Lower it for a partial receipt. Raising it above outstanding is sent to the API and
        must 422 — the UI does not fake a success.
      </p>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      {lines.map((l) => (
        <label key={l.id}>
          Receive (outstanding {qty(l.outstanding_qty)})
          <input
            value={qtys[l.id] ?? ''}
            onChange={(e) => setQtys((prev) => ({ ...prev, [l.id]: e.target.value }))}
          />
        </label>
      ))}
      <BusyButton type="submit" busy={mut.isPending} disabled={!warehouseId || payload.lines.length === 0}>
        Post goods receipt
      </BusyButton>
    </form>
  )
}
