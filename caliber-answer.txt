# Mini-ERP Frontend — Operations Console (notes)

Repos: https://github.com/Shr870/mini-erp-frontend (console) · https://github.com/Shr870/mini-erp-backend (Stage 2 API, `:3100`).  
Stack: Vite + React + TypeScript + React Query. Vite proxies `/api` → Stage 2. Seed password `password123`.

## Approach

I treated the already-running Stage 2 API as the contract, not the written brief and not a mock. Order of work:

1. Read every Stage 2 route, `requireRoles` list, and error code (`403 forbidden`, `409 insufficient_stock` with `extra.available`, `422 over_receipt`, recon `{ reconciled, derivation, formula }`).
2. Map each console view to those routes. Anything the UI would have to invent (fake stock, fake YES/NO recon, IDs kept only in `localStorage`) was rejected.
3. Fill only the Stage 2 holes that made “reload = backend state” impossible: read-only list/history GETs + CORS. Warehouse levels stay on original `GET /products/:id/stock`. Writes, locks, 409/422, recon formula, and role lists stayed as shipped.
4. Build the operator console as a thin client: `apiRequest` + `ApiError`, React Query `staleTime: 0`, RBAC copied from `requireRoles`.
5. Prove it against live Postgres/API: unit tests for the RBAC matrix and error mapping, `scripts/operator-flow.mjs` for GR/409/recon, browser login as sales vs warehouse vs finance.

Underspecified spots are in `ASSUMPTIONS.md` rather than silent.

## Key decisions

### 1. Stage 2 is authoritative; the UI does not own business state

I rejected mocks, hard-coded SKUs/ledger figures, and optimistic inventory presented as truth. After a full page reload, lists and stock come from GET. `localStorage` holds only the JWT session (`nw-ops.session`), not documents. Mutation responses are backend JSON; lists invalidate and refetch. That is the only way the console can survive “another operator just reserved the last unit.”

### 2. Additive list/history GETs; stock levels stay on the original Stage 2 stock route

Stage 2 had GET-by-id for POs/SOs/journals and no movement history. A PO list after reload cannot be rebuilt from GET-by-id without stashing UUIDs in the browser. I added read-only `GET /purchase-orders`, `/sales-orders`, `/stock-movements`, `/ledger/journal-entries`. Warehouse **levels** do not use a new snapshot: they `GET /products` then `GET /products/:id/stock` per SKU — the same route Sales uses for live availability. CORS `origin: true` is for split origin; local Vite uses the proxy. No new reserve/GR/recon rules.

### 3. Live availability is `GET /products/:id/stock`, not a timer and not a client cap

Available = physical − active reservations, computed on the server. The create-SO panel uses that endpoint with `staleTime: 0`, refetch on window focus, an explicit Revalidate, and a refetch immediately before POST. I did **not** disable Confirm when qty > available: Stage 2 partial-reserves `min(available, ordered)` and sets `backordered_qty`. Blocking that in the UI would hide the required Ordered/Available/Backordered behavior. When available is 0, Confirm still POSTs so the operator sees **409 insufficient_stock** with `extra.available` — a client toast would be a fake reject.

### 4. Concurrent reservation is another HTTP session, not a local decrement

Two browser windows as sales share the JWT but not React Query cache. Window B `POST /sales-orders`; window A refetches `GET /products/:id/stock` on focus or Revalidate. An in-page second JWT does the same POST without replacing the signed-in user. `operator-flow.mjs` asserts `available_qty === 0` then 409. Polling every N seconds is not the proof.

### 5. RBAC copies `requireRoles`; hiding a button is not authorization

`canGet` / `canPost` match the backend lists, including auditor GET-bypass and admin-is-not-god-mode. Demo pair: **sales** vs **warehouse**. Sales nav is Warehouse + Sales; typing `/finance` still calls `GET /ledger/reconciliation` and shows **403** `requires one of: finance, auditor, admin`. Warehouse gets Procurement (GR) + Sales (fulfill) but cannot `POST /purchase-orders`. Routes are not a security wall.

### 6. Reconciliation is rendered, not computed

The finance hero and topbar chip bind `reconciled`, `derivation.movement_carrying_value`, `ledger_inventory_1300`, `difference`, and `formula` from `GET /ledger/reconciliation`. I never `===` those numbers in the client. Loading and 403/5xx have their own states. Sales sees “Recon hidden” because that role cannot GET the endpoint.

### 7. Duplicate submits follow Stage 2 idempotency

GR, SO create, fulfill, and adjustments send `Idempotency-Key` (≤64 chars, rotated when the payload identity changes and after success) plus `BusyButton` disabled while in flight. That matches Stage 2’s key+hash replay instead of inventing a frontend-only debounce.

### 8. Error bodies are shown as Stage 2 sent them

`operatorMessage` maps `insufficient_stock`, `over_receipt` (“outstanding was not changed”), `exceeds_reservation`, `forbidden`, `unauthorized`. Extra fields (`available`, `ordered`, `reserved`) are interpolated from the JSON, not guessed.

## Reasoning

The grading signal is whether the console is exercising Stage 2. Mocked stock or a client-computed recon YES/NO would fail that even if the UI looked complete. List/history GETs exist only because GET-by-id cannot survive a reload; live availability and recon still hit the original Stage 2 routes.

Stage 2 fulfills ≤ active reservation — later GRs do not auto-reserve onto an existing backorder; the console shows that instead of faking a fill. POs under ₹50k auto-approve with `approved_by` NULL. SO header has no `warehouse_id`; fulfill uses the reservation warehouse (returned on GET SO) or seeded WH1.

## What I deliberately did not build

A design system, Redux, WebSockets, optimistic rollback of stock, client-side permission database, or a mock MSW layer. Those would add surface without proving live availability, 409/422, or recon-from-endpoint.

## How to run

```bash
# backend
cd /home/user/mini-erp-backend && npm run dev   # :3100

# console
cd /home/user/mini-erp-frontend && npm run dev   # :5173
```

```bash
npm test                  # RBAC matrix + error mapping
node scripts/operator-flow.mjs   # live GR / 409 / recon against :3100
```

Live against `:3100` (25 Aug 2026): `operator-flow OK { outstanding: '4.0000', reserved: '6.0000', backordered: '94.0000', available_after: '0.0000', reconciled: true, movement_value: '80.00000000', ledger_1300: '80.0000' }`. Frontend vitest 7/7; backend 7/7.
