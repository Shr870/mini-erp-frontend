#!/usr/bin/env node
/**
 * Hits the real Stage 2 API the same way the console does.
 * Run with backend up: node scripts/operator-flow.mjs
 */
const BASE = process.env.API ?? 'http://127.0.0.1:3100/api/v1'

async function req(path, { method = 'GET', token, body, key } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (key) headers['Idempotency-Key'] = key
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const WH = 'd0000000-0000-4000-8000-000000000001'
const SKU = 'e0000000-0000-4000-8000-000000000001'

async function login(email) {
  const r = await req('/auth/login', { method: 'POST', body: { email, password: 'password123' } })
  assert(r.status === 200 && r.json.token, `login failed ${email} ${r.status}`)
  return r.json.token
}

const stamp = Date.now().toString(36)

async function main() {
  const sales = await login('sales@northwind.local')
  const warehouse = await login('warehouse@northwind.local')
  const proc = await login('procurement@northwind.local')
  const finance = await login('finance@northwind.local')

  const forbiddenPo = await req('/purchase-orders', { token: sales })
  assert(forbiddenPo.status === 403, `sales GET PO should 403, got ${forbiddenPo.status}`)

  const forbiddenRecon = await req('/ledger/reconciliation', { token: sales })
  assert(forbiddenRecon.status === 403, `sales recon should 403, got ${forbiddenRecon.status}`)

  const stock0 = await req(`/products/${SKU}/stock?warehouse_id=${WH}`, { token: warehouse })
  assert(stock0.status === 200, 'stock')

  const po = await req('/purchase-orders', {
    token: proc,
    method: 'POST',
    body: { supplier_name: 'Flow Supplier', lines: [{ product_id: SKU, quantity: '10', unit_cost: '5' }] },
  })
  assert(po.status === 201, `PO ${po.status} ${JSON.stringify(po.json)}`)
  const lineId = po.json.lines[0].id

  const gr1 = await req(`/purchase-orders/${po.json.id}/goods-receipts`, {
    token: warehouse,
    method: 'POST',
    key: `flow-gr1-${stamp}`,
    body: { warehouse_id: WH, lines: [{ po_line_id: lineId, quantity: '6' }] },
  })
  assert(gr1.status === 201, `GR1 ${gr1.status}`)

  const over = await req(`/purchase-orders/${po.json.id}/goods-receipts`, {
    token: warehouse,
    method: 'POST',
    key: `flow-over-${stamp}`,
    body: { warehouse_id: WH, lines: [{ po_line_id: lineId, quantity: '5' }] },
  })
  assert(over.status === 422 && over.json.error === 'over_receipt', `over-receipt ${over.status} ${over.json.error}`)

  const poView = await req(`/purchase-orders/${po.json.id}`, { token: proc })
  assert(Number(poView.json.lines[0].outstanding_qty) === 4, `outstanding ${poView.json.lines[0].outstanding_qty}`)

  const stock = await req(`/products/${SKU}/stock?warehouse_id=${WH}`, { token: sales })
  const availBefore = Number(stock.json.available_qty)
  assert(availBefore >= 6, `available ${availBefore}`)

  const so = await req('/sales-orders', {
    token: sales,
    method: 'POST',
    key: `flow-so-${stamp}`,
    body: {
      customer_name: 'Flow Buyer',
      warehouse_id: WH,
      lines: [{ product_id: SKU, quantity: '100', unit_price: '12' }],
    },
  })
  assert(so.status === 201, `SO ${so.status} ${JSON.stringify(so.json)}`)
  assert(Number(so.json.lines[0].reserved_qty) === availBefore, 'partial reserve')
  assert(Number(so.json.lines[0].backordered_qty) === 100 - availBefore, 'backorder')

  const stockAfter = await req(`/products/${SKU}/stock?warehouse_id=${WH}`, { token: sales })
  assert(Number(stockAfter.json.available_qty) === 0, 'availability dropped after reserve')

  const so2 = await req('/sales-orders', {
    token: sales,
    method: 'POST',
    key: `flow-so2-${stamp}`,
    body: {
      customer_name: 'Should 409',
      warehouse_id: WH,
      lines: [{ product_id: SKU, quantity: '1', unit_price: '12' }],
    },
  })
  assert(so2.status === 409 && so2.json.error === 'insufficient_stock', `over-reserve ${so2.status}`)

  const recon = await req('/ledger/reconciliation', { token: finance })
  assert(recon.status === 200, 'recon')
  assert(recon.json.reconciled === true, `reconciled ${JSON.stringify(recon.json.derivation)}`)
  assert(recon.json.derivation.movement_carrying_value != null, 'derivation from API')

  const movements = await req(`/stock-movements?warehouse_id=${WH}&product_id=${SKU}`, { token: warehouse })
  assert(movements.json.movements.length > 0, 'movements exist')

  console.log('operator-flow OK', {
    outstanding: poView.json.lines[0].outstanding_qty,
    reserved: so.json.lines[0].reserved_qty,
    backordered: so.json.lines[0].backordered_qty,
    available_after: stockAfter.json.available_qty,
    reconciled: recon.json.reconciled,
    movement_value: recon.json.derivation.movement_carrying_value,
    ledger_1300: recon.json.derivation.ledger_inventory_1300,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
