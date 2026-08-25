# Mini-ERP Frontend — Operations Console (notes)

Repos: https://github.com/Shr870/mini-erp-frontend (console) against https://github.com/Shr870/mini-erp-backend (Stage 2, `:3100`). Vite proxies `/api` → Stage 2. Seed password `password123`.

## Approach

I did not design a fourth CRUD app. I mapped every screen to an existing Stage 2 route, then filled only the holes that made “reload = backend state” impossible.

Stage 2 already had JWT login, `requireRoles`, `GET /products/:id/stock`, PO/SO GET-by-id, GR 422 `over_receipt`, SO 409 `insufficient_stock` with `extra.available`, and `GET /ledger/reconciliation` (`reconciled`, `derivation.movement_carrying_value`, `ledger_inventory_1300`, `formula`). What it did **not** have: list POs/SOs/journals, movement history, CORS, or a warehouse snapshot. Stashing UUIDs in `localStorage` would fake a console. So I added **read-only** GETs that select existing tables / loop `getProductStock`. Writes, lock path, 409/422 codes, recon formula, and role lists are unchanged. CORS `origin: true` is for split origin; the console uses the proxy.

Stack: Vite + React + TS + React Query (`staleTime: 0`, refetch on focus, no 4xx retry). No mock service worker. Token in `localStorage` is the session only.

## Views → Stage 2

| View | Reads | Writes |
|------|--------|--------|
| Warehouse | `GET /inventory?warehouse_id=`, `GET /stock-movements` | `POST /inventory-adjustments` (finance) |
| Procurement | `GET /purchase-orders`, `GET /purchase-orders/:id` (`outstanding_qty`, `goods_receipts`) | `POST /purchase-orders` (procurement), `…/approve` (approver), `…/goods-receipts` (warehouse, Idempotency-Key) |
| Sales | `GET /products/:id/stock` (live avail), `GET /sales-orders`, `GET /sales-orders/:id` (ordered/reserved/fulfilled/backordered + reservation_status) | `POST /sales-orders` (sales), `…/fulfill` (warehouse), `…/cancel` (sales) |
| Finance | `GET /ledger/reconciliation`, `GET /ledger/journal-entries`, `GET …/:id` | `POST …/reverse` (finance) |

Reload refetches those GETs. Mutation responses are backend JSON; lists invalidate and refetch.

## Live availability / concurrency

Available qty on SO create is **only** `GET /products/:id/stock` (physical − active reservations). Timestamp + Revalidate + refetch immediately before POST. The UI does **not** block qty > available: Stage 2 reserves `min(available, ordered)` and sets `backordered_qty`. If available is 0, confirm still POSTs so the operator sees **409 insufficient_stock** with `extra.available` (not a client toast inventing a reject).

“Second session” holds a **second JWT** and POSTs `/sales-orders` as that token, then invalidates `['stock']`. Session A’s next GET shows the drop. `scripts/operator-flow.mjs` against live `:3100`: after reserve, `available_qty === 0`; next SO → 409.

## RBAC (demo: sales vs warehouse)

Nav/`canPost` copy `requireRoles` plus auditor GET-bypass. Admin is not god-mode.

Verified in the running console:
- **sales**: nav Warehouse + Sales. No Procurement/Finance. Topbar: “Recon hidden — this role cannot GET /ledger/reconciliation”. Typing `/finance` still calls recon → **403** `requires one of: finance, auditor, admin`.
- **warehouse**: nav Warehouse + Procurement + Sales. Cannot create PO (banner + API 403). Can open `PO-0002` and see ordered 10 / received 6 / outstanding 4 and post GR.
- **finance**: all four views; chip `Ledger matches movements: YES` from recon body (`₹50` = `₹50`, formula string from API).

Hiding a button is not the control. Routes are not a wall.

## Reconciliation

Finance hero + topbar chip render `reconciled`, `derivation.*`, `formula`, `on_failure` from `GET /ledger/reconciliation`. Loading and 403/5xx banners exist. No frontend equality check.

## Operator states

Loading/empty/error on every list. 401/403/409/422 mapped in `operatorMessage` (incl. over_receipt “outstanding was not changed”). Duplicate submits: `BusyButton` + Idempotency-Key ≤64, rotated on payload change and success. Seed empty stock banner is real (physical 0 until GR/adjust).

## Assumptions / Stage 2 limits (not faked)

1. List/snapshot/movement GETs are additive reads. See `ASSUMPTIONS.md`.
2. SO header has no `warehouse_id`; fulfill uses reservation warehouse (now returned on GET SO) or WH1.
3. Fulfill ships ≤ **active reservation**. Later GRs do not auto-reserve onto an existing backorder; the console shows that instead of a fake fill.
4. POs &lt; ₹50k auto-approve with `approved_by` NULL (Stage 2).

## Evidence

- Repos: https://github.com/Shr870/mini-erp-frontend · https://github.com/Shr870/mini-erp-backend
- Backend `npm test` → 7/7 (original six + console read/RBAC lists).
- Frontend `npm test` → 7; `npm run build` OK.
- `node scripts/operator-flow.mjs`: sales 403 on PO list + recon; partial GR outstanding 4; 422 over-receipt; live stock drop; 409 over-reserve; recon `reconciled: true`.
- Browser: sales vs warehouse vs finance surfaces; `/finance` as sales 403; recon YES from endpoint.

Run: backend `npm run dev`; frontend `npm run dev` → http://127.0.0.1:5173
