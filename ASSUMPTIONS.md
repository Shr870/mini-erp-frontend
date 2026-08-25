# Assumptions

1. **Read-only list/history endpoints on Stage 2.** The submitted backend had GET-by-id for POs/SOs/journals and no movement history route. Reloadable lists cannot be rebuilt from GET-by-id without stashing IDs locally. Additive `GET /purchase-orders`, `/sales-orders`, `/stock-movements`, `/ledger/journal-entries` wrap existing tables. Warehouse **levels** use original `GET /products` + `GET /products/:id/stock`. Writes, RBAC, 409/422, recon formula, and locking are unchanged.

2. **CORS** enabled on Stage 2 (`origin: true`) so a split origin can call the API. Vite also proxies `/api` → `:3100`.

3. **Live availability** is `GET /products/:id/stock` with `staleTime: 0`, refetch on window focus, explicit Revalidate, and a refetch immediately before SO confirm. The UI does **not** block qty > available: Stage 2 partial-reserves `min(available, ordered)` and backorders the rest; qty with available=0 is POSTed so the operator sees **409 insufficient_stock**.

4. **Second session** is another HTTP caller: a second browser window (same JWT, separate React Query cache; refetch on focus / Revalidate) or the in-page second JWT. Both POST `/sales-orders` and re-GET stock. Not a local decrement.

5. **RBAC.** Nav hides views the role cannot GET. Mutation buttons follow `canPost` matching `requireRoles`. Routes are not a security wall: `/finance` as sales still calls recon and shows the **403** body. Admin is not god-mode. Auditor GET-bypass is mirrored for nav, POSTs still 403.

6. **Auth persistence.** JWT + user in `localStorage` is the session, not inventory/ledger. After reload, queries refetch from Stage 2.

7. **Idempotency-Key** (32 hex chars, ≤64) on GR, fulfill, SO create, adjustments. New key when the payload identity changes and after success.

8. **SO has no warehouse_id column.** Fulfill uses `warehouse_id` from a reservation row (Stage 2 GET SO now returns it) or the single seeded WH1.

9. **Fulfill ships ≤ active reservation.** Backordered qty does not ship until stock exists *and* there is an active reservation — Stage 2 does not auto-reserve later receipts onto an existing SO. The console shows that limitation instead of faking a backorder fill.

10. **Recon** is displayed from `GET /ledger/reconciliation` (`reconciled`, `derivation.*`, `formula`). The UI never computes match/mismatch.
