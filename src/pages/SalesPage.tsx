import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../api/endpoints.ts'
import { ApiError } from '../api/http.ts'
import type { LoginResponse, ProductStock } from '../api/types.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { canPost, POST } from '../auth/rbac.ts'
import { BusyButton, EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../components/Ui.tsx'
import { inr, qty, skuOf, when } from '../lib/format.ts'
import { useIdempotencyKey } from '../lib/idempotency.ts'

export function SalesPage() {
  const { token, user } = useAuth()
  const qc = useQueryClient()
  const roles = user?.roles ?? []
  const canCreate = canPost(roles, POST.createSO)
  const canFulfill = canPost(roles, POST.fulfillSO)
  const canCancel = canPost(roles, POST.cancelSO)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listQ = useQuery({
    queryKey: ['sos', token],
    queryFn: () => api.listSOs({ token }),
    enabled: Boolean(token),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const detailQ = useQuery({
    queryKey: ['so', token, selectedId],
    queryFn: () => api.getSO({ token }, selectedId!),
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
    enabled: Boolean(token),
  })

  function invalidateSales() {
    void qc.invalidateQueries({ queryKey: ['sos'] })
    void qc.invalidateQueries({ queryKey: ['so'] })
    void qc.invalidateQueries({ queryKey: ['stock'] })
    void qc.invalidateQueries({ queryKey: ['inventory'] })
    void qc.invalidateQueries({ queryKey: ['recon'] })
    void qc.invalidateQueries({ queryKey: ['journals'] })
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Sales</h1>
          <p className="muted">
            Availability is <code>GET /products/:id/stock</code> (staleTime 0, refetch on focus, explicit revalidate
            before confirm). Reservation/fulfill/backorder come from <code>GET /sales-orders/:id</code>. A second JWT
            session can reserve without replacing yours.
          </p>
        </div>
      </header>

      {listQ.error ? <ErrorBanner err={listQ.error} onRetry={() => void listQ.refetch()} /> : null}

      <div className="split">
        <div>
          {canCreate ? (
            <CreateSO
              products={productsQ.data?.products ?? []}
              warehouseId={whQ.data?.warehouses[0]?.id ?? ''}
              onCreated={(id) => {
                setSelectedId(id)
                invalidateSales()
              }}
            />
          ) : (
            <p className="banner banner-info">
              Creating sales orders requires role <code>sales</code>. This session cannot POST /sales-orders.
            </p>
          )}

          {listQ.isLoading ? <LoadingState label="Loading sales orders…" /> : null}
          {listQ.data && listQ.data.sales_orders.length === 0 ? (
            <EmptyState title="No sales orders" hint="Confirmed SOs appear here from GET /sales-orders after reload." />
          ) : null}
          {listQ.data && listQ.data.sales_orders.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SO</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="num">Total</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.sales_orders.map((so) => (
                    <tr
                      key={so.id}
                      className={selectedId === so.id ? 'is-selected' : undefined}
                      onClick={() => setSelectedId(so.id)}
                    >
                      <td>{so.so_number}</td>
                      <td>{so.customer_name}</td>
                      <td>
                        <StatusBadge status={so.status} />
                      </td>
                      <td className="num">{inr(so.total_amount)}</td>
                      <td>{when(so.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="panel">
          {!selectedId ? <p className="muted">Select a sales order.</p> : null}
          {detailQ.isLoading ? <LoadingState /> : null}
          {detailQ.error ? <ErrorBanner err={detailQ.error} /> : null}
          {detailQ.data ? (
            <>
              <h2>
                {detailQ.data.so_number} <StatusBadge status={detailQ.data.status} />
              </h2>
              <p>
                {detailQ.data.customer_name} · {inr(detailQ.data.total_amount)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Ordered</th>
                    <th className="num">Reserved</th>
                    <th className="num">Fulfilled</th>
                    <th className="num">Backordered</th>
                    <th>Reservation</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailQ.data.lines ?? []).map((line) => (
                    <tr key={line.id}>
                      <td className="mono">{skuOf(productsQ.data?.products, line.product_id)}</td>
                      <td className="num">{qty(line.ordered_qty ?? line.quantity)}</td>
                      <td className="num">{qty(line.reserved_qty)}</td>
                      <td className="num">{qty(line.fulfilled_qty)}</td>
                      <td className="num">{qty(line.backordered_qty)}</td>
                      <td>
                        <StatusBadge status={line.reservation_status ?? 'none'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {canFulfill && ['confirmed', 'partially_fulfilled'].includes(detailQ.data.status) ? (
                <FulfillForm
                  key={detailQ.data.id}
                  soId={detailQ.data.id}
                  warehouseId={detailQ.data.warehouse_id || whQ.data?.warehouses[0]?.id || ''}
                  lines={detailQ.data.lines ?? []}
                  onDone={invalidateSales}
                />
              ) : null}

              {canCancel && !['cancelled', 'fulfilled'].includes(detailQ.data.status) ? (
                <CancelButton soId={detailQ.data.id} onDone={invalidateSales} />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function CreateSO({
  products,
  warehouseId,
  onCreated,
}: {
  products: Array<{ id: string; sku: string; name: string }>
  warehouseId: string
  onCreated: (id: string) => void
}) {
  const { token } = useAuth()
  const [customer, setCustomer] = useState('Vins et alcools Chevalier')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('18')
  const pid = productId || products[0]?.id || ''

  const stockQ = useQuery({
    queryKey: ['stock', token, pid, warehouseId],
    queryFn: () => api.stock({ token }, pid, warehouseId),
    enabled: Boolean(token && pid && warehouseId),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  })

  const payload = useMemo(
    () => ({
      customer_name: customer,
      warehouse_id: warehouseId,
      lines: [{ product_id: pid, quantity, unit_price: unitPrice }],
    }),
    [customer, warehouseId, pid, quantity, unitPrice],
  )
  const idemp = useIdempotencyKey(payload)

  const mut = useMutation({
    mutationFn: async () => {
      const fresh = await api.stock({ token }, pid, warehouseId)
      return { fresh, so: await api.createSO({ token, idempotencyKey: idemp.key }, payload) }
    },
    onSuccess: (res) => {
      idemp.rotate()
      onCreated(res.so.id)
    },
  })

  const avail = stockQ.data ? Number(stockQ.data.available_qty) : null
  const want = Number(quantity)
  const willBackorder = avail != null && want > avail && avail > 0
  const will409 = avail === 0 && want > 0

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault()
        mut.mutate()
      }}
    >
      <h2>Create sales order</h2>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      {mut.data ? (
        <p className="banner banner-ok">
          Confirmed {mut.data.so.so_number}. Reserved {qty(mut.data.so.lines?.[0]?.reserved_qty)} · backordered{' '}
          {qty(mut.data.so.lines?.[0]?.backordered_qty)}. Availability just before POST was{' '}
          {qty(mut.data.fresh.available_qty)}.
        </p>
      ) : null}

      <label>
        Customer
        <input value={customer} onChange={(e) => setCustomer(e.target.value)} required />
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
      <LiveAvailability stockQ={stockQ} />
      <div className="row2">
        <label>
          Qty
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>
        <label>
          Unit price
          <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
        </label>
      </div>
      {willBackorder ? (
        <p className="banner banner-info">
          Ordered {want} &gt; available {avail}. Stage 2 will reserve {avail} and backorder {want - avail}. The UI does
          not block this.
        </p>
      ) : null}
      {will409 ? (
        <p className="banner banner-error">
          Available is 0. Confirm will POST anyway; Stage 2 should return 409 insufficient_stock.
        </p>
      ) : null}
      <BusyButton type="submit" busy={mut.isPending} disabled={!pid || !warehouseId}>
        Confirm & reserve
      </BusyButton>

      <SecondSession productId={pid} warehouseId={warehouseId} sku={products.find((p) => p.id === pid)?.sku} />
    </form>
  )
}

function LiveAvailability({
  stockQ,
}: {
  stockQ: {
    data?: ProductStock
    isFetching: boolean
    isError: boolean
    error: unknown
    dataUpdatedAt: number
    refetch: () => Promise<unknown>
  }
}) {
  return (
    <div className="live-box">
      <div className="live-head">
        <strong>Live availability</strong>
        <button type="button" className="btn btn-ghost" onClick={() => void stockQ.refetch()}>
          Revalidate now
        </button>
      </div>
      <p className="muted">
        GET /products/:id/stock · fetched{' '}
        {stockQ.dataUpdatedAt ? new Date(stockQ.dataUpdatedAt).toLocaleTimeString() : '—'}
        {stockQ.isFetching ? ' · fetching…' : ''}. A second browser window that reserves this SKU will show here after
        you focus this tab or click Revalidate — not a local decrement.
      </p>
      {stockQ.isError ? <ErrorBanner err={stockQ.error} onRetry={() => void stockQ.refetch()} /> : null}
      {stockQ.data ? (
        <dl className="kpi">
          <div>
            <dt>Physical</dt>
            <dd>{qty(stockQ.data.physical_qty)}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{qty(stockQ.data.reserved_qty)}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{qty(stockQ.data.available_qty)}</dd>
          </div>
        </dl>
      ) : (
        <LoadingState label="Fetching stock…" />
      )}
    </div>
  )
}

function SecondSession({
  productId,
  warehouseId,
  sku,
}: {
  productId: string
  warehouseId: string
  sku?: string
}) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('sales@northwind.local')
  const password = 'password123'
  const [session, setSession] = useState<LoginResponse | null>(null)
  const [loginErr, setLoginErr] = useState<unknown>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  const stockQ = useQuery({
    queryKey: ['stock-b', session?.token, productId, warehouseId],
    queryFn: () => api.stock({ token: session!.token }, productId, warehouseId),
    enabled: Boolean(session && productId && warehouseId),
    staleTime: 0,
  })

  const idemp = useIdempotencyKey({ sid: session?.user.id, productId, warehouseId })
  const reserve = useMutation({
    mutationFn: () =>
      api.createSO(
        { token: session!.token, idempotencyKey: idemp.key },
        {
          customer_name: `Session B ${session!.user.email}`,
          warehouse_id: warehouseId,
          lines: [{ product_id: productId, quantity: '1', unit_price: '18' }],
        },
      ),
    onSuccess: () => {
      idemp.rotate()
      void qc.invalidateQueries({ queryKey: ['stock'] })
      void qc.invalidateQueries({ queryKey: ['stock-b'] })
      void qc.invalidateQueries({ queryKey: ['sos'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  return (
    <details className="second-session">
      <summary>Second session (concurrent reservation)</summary>
      <p className="muted">
        Separate JWT. Reserving 1 × {sku ?? 'SKU'} here hits POST /sales-orders as this user. Then Revalidate on
        session A — or use a second browser window as sales and focus this tab. Not a local decrement.
      </p>
      {loginErr ? <ErrorBanner err={loginErr} /> : null}
      {!session ? (
        <div className="row2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Second session email" />
          <BusyButton
            type="button"
            busy={loggingIn}
            onClick={() => {
              setLoggingIn(true)
              setLoginErr(null)
              api
                .login(email, password)
                .then((res) => setSession(res))
                .catch((e) => setLoginErr(e))
                .finally(() => setLoggingIn(false))
            }}
          >
            Login session B
          </BusyButton>
        </div>
      ) : (
        <>
          <p>
            B: {session.user.email} ({session.user.roles.join(', ')}) · available {qty(stockQ.data?.available_qty)}
          </p>
          {reserve.error ? <ErrorBanner err={reserve.error} /> : null}
          {reserve.data ? (
            <p className="banner banner-ok">
              Session B reserved {qty(reserve.data.lines?.[0]?.reserved_qty)} on {reserve.data.so_number}.
            </p>
          ) : null}
          {reserve.error instanceof ApiError && reserve.error.status === 403 ? (
            <p className="muted">Session B is not sales — POST correctly forbidden.</p>
          ) : null}
          <BusyButton
            type="button"
            busy={reserve.isPending}
            disabled={session.user.roles.includes('sales') === false}
            onClick={() => reserve.mutate()}
          >
            Reserve 1 unit as session B
          </BusyButton>
        </>
      )}
    </details>
  )
}

function FulfillForm({
  soId,
  warehouseId,
  lines,
  onDone,
}: {
  soId: string
  warehouseId: string
  lines: Array<{ id: string; reserved_qty: string; reservation_status?: string | null }>
  onDone: () => void
}) {
  const { token } = useAuth()
  const shippable = lines.filter((l) => l.reservation_status === 'active' && Number(l.reserved_qty) > 0)
  const [qtys, setQtys] = useState<Record<string, string>>(
    Object.fromEntries(shippable.map((l) => [l.id, String(Number(l.reserved_qty))])),
  )
  const payload = {
    warehouse_id: warehouseId,
    lines: shippable
      .map((l) => ({ so_line_id: l.id, quantity: qtys[l.id] ?? '0' }))
      .filter((l) => Number(l.quantity) > 0),
  }
  const idemp = useIdempotencyKey(payload)
  const mut = useMutation({
    mutationFn: () => api.fulfillSO({ token, idempotencyKey: idemp.key }, soId, payload),
    onSuccess: () => {
      idemp.rotate()
      onDone()
    },
  })

  if (shippable.length === 0) {
    return <p className="muted">No active reservation to fulfill (backordered remainder ships only after new stock + a new reservation — Stage 2 fulfills ≤ active reservation).</p>
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        mut.mutate()
      }}
    >
      <h3>Fulfill (warehouse)</h3>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      {shippable.map((l) => (
        <label key={l.id}>
          Ship (reserved {qty(l.reserved_qty)})
          <input value={qtys[l.id] ?? ''} onChange={(e) => setQtys((p) => ({ ...p, [l.id]: e.target.value }))} />
        </label>
      ))}
      <BusyButton type="submit" busy={mut.isPending} disabled={!warehouseId}>
        Post fulfillment
      </BusyButton>
    </form>
  )
}

function CancelButton({ soId, onDone }: { soId: string; onDone: () => void }) {
  const { token } = useAuth()
  const mut = useMutation({
    mutationFn: () => api.cancelSO({ token }, soId),
    onSuccess: onDone,
  })
  return (
    <div>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      <BusyButton type="button" className="btn btn-danger" busy={mut.isPending} onClick={() => mut.mutate()}>
        Cancel SO (release reservation)
      </BusyButton>
    </div>
  )
}
