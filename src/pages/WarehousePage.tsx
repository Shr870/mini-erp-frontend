import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api/endpoints.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { canPost, POST } from '../auth/rbac.ts'
import { BusyButton, EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../components/Ui.tsx'
import { inr, qty, when } from '../lib/format.ts'
import { useIdempotencyKey } from '../lib/idempotency.ts'
import type { InventoryRow } from '../api/types.ts'

export function WarehousePage() {
  const { token, user } = useAuth()
  const qc = useQueryClient()
  const canAdjust = canPost(user?.roles ?? [], POST.adjustStock)
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [selected, setSelected] = useState<InventoryRow | null>(null)

  const whQ = useQuery({
    queryKey: ['warehouses', token],
    queryFn: () => api.warehouses({ token }),
    enabled: Boolean(token),
  })

  const activeWh = warehouseId || whQ.data?.warehouses[0]?.id || ''

  const productsQ = useQuery({
    queryKey: ['products', token],
    queryFn: () => api.products({ token }),
    enabled: Boolean(token),
  })

  const invQ = useQuery({
    queryKey: ['inventory', token, activeWh, productsQ.data?.products.map((p) => p.id).join(',')],
    queryFn: async () => {
      const products = productsQ.data!.products
      const rows = await Promise.all(
        products.map(async (p) => {
          const stock = await api.stock({ token }, p.id, activeWh)
          return { ...p, ...stock }
        }),
      )
      return { warehouse_id: activeWh, rows }
    },
    enabled: Boolean(token && activeWh && productsQ.data),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })

  const movQ = useQuery({
    queryKey: ['movements', token, activeWh, selected?.product_id],
    queryFn: () => api.movements({ token }, activeWh, selected?.product_id),
    enabled: Boolean(token && activeWh && selected),
    staleTime: 0,
  })

  const emptyStock = useMemo(
    () => (invQ.data?.rows ?? []).every((r) => Number(r.physical_qty) === 0),
    [invQ.data],
  )

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Warehouse</h1>
          <p className="muted">
            Grid is <code>GET /products</code> then <code>GET /products/:id/stock</code> per SKU (original Stage 2).
            History is <code>GET /stock-movements</code>. Reload refetches; nothing is cached as truth.
          </p>
        </div>
        <label className="inline">
          Warehouse
          <select
            value={activeWh}
            onChange={(e) => {
              setWarehouseId(e.target.value)
              setSelected(null)
            }}
          >
            {(whQ.data?.warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {whQ.error ? <ErrorBanner err={whQ.error} onRetry={() => void whQ.refetch()} /> : null}
      {productsQ.error ? <ErrorBanner err={productsQ.error} onRetry={() => void productsQ.refetch()} /> : null}
      {invQ.error ? <ErrorBanner err={invQ.error} onRetry={() => void invQ.refetch()} /> : null}
      {invQ.isLoading ? <LoadingState label="Loading stock from API…" /> : null}

      {invQ.data && invQ.data.rows.length === 0 ? (
        <EmptyState title="No products" hint="Stage 2 returned an empty products list." />
      ) : null}

      {invQ.data && invQ.data.rows.length > 0 ? (
        <>
          {emptyStock ? (
            <p className="banner banner-info">
              All SKUs show physical qty 0. That is real seed state until a goods receipt or finance IN adjustment posts a movement.
            </p>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th className="num">Physical</th>
                  <th className="num">Reserved</th>
                  <th className="num">Available</th>
                  <th className="num">Carrying value</th>
                </tr>
              </thead>
              <tbody>
                {invQ.data.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={selected?.id === row.id ? 'is-selected' : undefined}
                    onClick={() => setSelected(row)}
                  >
                    <td>{row.sku}</td>
                    <td>{row.name}</td>
                    <td className="num">{qty(row.physical_qty)}</td>
                    <td className="num">{qty(row.reserved_qty)}</td>
                    <td className="num">{qty(row.available_qty)}</td>
                    <td className="num">{inr(row.carrying_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {selected ? (
        <div className="split">
          <div className="panel">
            <h2>
              Movements · {selected.sku}
              <button type="button" className="btn btn-ghost" onClick={() => void movQ.refetch()}>
                Refresh
              </button>
            </h2>
            {movQ.isLoading ? <LoadingState /> : null}
            {movQ.error ? <ErrorBanner err={movQ.error} onRetry={() => void movQ.refetch()} /> : null}
            {movQ.data && movQ.data.movements.length === 0 ? (
              <EmptyState title="No movements" hint="Append-only stock_movements is empty for this SKU/warehouse." />
            ) : null}
            {movQ.data && movQ.data.movements.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Dir</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit cost</th>
                    <th>Reason</th>
                    <th>Ref</th>
                    <th>JE</th>
                  </tr>
                </thead>
                <tbody>
                  {movQ.data.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{when(m.created_at)}</td>
                      <td>
                        <StatusBadge status={m.direction} />
                      </td>
                      <td className="num">{qty(m.quantity)}</td>
                      <td className="num">{inr(m.unit_cost)}</td>
                      <td>{m.reason}</td>
                      <td className="mono">
                        {m.reference_type}
                      </td>
                      <td className="mono">{m.journal_entry_id.slice(0, 8)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          {canAdjust ? (
            <AdjustForm
              warehouseId={activeWh}
              productId={selected.product_id}
              sku={selected.sku}
              onDone={() => {
                void qc.invalidateQueries({ queryKey: ['inventory'] })
                void qc.invalidateQueries({ queryKey: ['movements'] })
                void qc.invalidateQueries({ queryKey: ['recon'] })
                void qc.invalidateQueries({ queryKey: ['journals'] })
              }}
            />
          ) : (
            <p className="muted panel">
              Inventory adjustment is <code>POST /inventory-adjustments</code> (finance only). This role cannot post it; hiding the form is not the control — the API returns 403.
            </p>
          )}
        </div>
      ) : (
        <p className="muted">Select a SKU to load movement history.</p>
      )}
    </section>
  )
}

function AdjustForm({
  warehouseId,
  productId,
  sku,
  onDone,
}: {
  warehouseId: string
  productId: string
  sku: string
  onDone: () => void
}) {
  const { token } = useAuth()
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('10')
  const [reason, setReason] = useState('cycle_count')
  const idemp = useIdempotencyKey({ productId, warehouseId, direction, quantity, unitCost, reason })
  const mut = useMutation({
    mutationFn: () =>
      api.adjust(
        { token, idempotencyKey: idemp.key },
        {
          product_id: productId,
          warehouse_id: warehouseId,
          direction,
          quantity,
          unit_cost: direction === 'IN' ? unitCost : undefined,
          reason,
        },
      ),
    onSuccess: () => {
      idemp.rotate()
      onDone()
    },
  })

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault()
        mut.mutate()
      }}
    >
      <h2>Finance adjustment · {sku}</h2>
      <p className="muted">Posts a movement + journal in one Stage 2 transaction. Idempotency-Key: {idemp.key}</p>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      {mut.isSuccess ? <p className="banner banner-ok">Posted. Grid and recon will refetch.</p> : null}
      <label>
        Direction
        <select value={direction} onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </select>
      </label>
      <label>
        Quantity
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
      </label>
      {direction === 'IN' ? (
        <label>
          Unit cost
          <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
        </label>
      ) : null}
      <label>
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} required />
      </label>
      <BusyButton type="submit" busy={mut.isPending}>
        Post adjustment
      </BusyButton>
    </form>
  )
}
