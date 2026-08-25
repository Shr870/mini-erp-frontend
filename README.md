# Northwind Traders — Operations Console

Operator UI for the Mini-ERP Stage 2 API.

- Console: https://github.com/Shr870/mini-erp-frontend
- Stage 2 API: https://github.com/Shr870/mini-erp-backend (`http://127.0.0.1:3100`)

## Run

```bash
# backend
cd /home/user/mini-erp-backend
npm run dev          # :3100

# console
cd /home/user/mini-erp-frontend
npm install
npm run dev          # :5173, proxies /api → :3100
```

Seeded password: `password123`.

| Email | Role | Console surface |
|-------|------|-----------------|
| sales@northwind.local | sales | Warehouse + Sales (create/cancel SO). No Procurement/Finance. |
| warehouse@northwind.local | warehouse | Warehouse + Procurement (GR) + Sales (fulfill). No create PO/SO, no Finance. |
| finance@northwind.local | finance | All four views; recon + reverse + stock adjust. |
| auditor@northwind.local | auditor | All GET views; every POST 403. |

## Stage 2 gap fill (read-only)

Stage 2 originally exposed GET-by-id only. Reloadable lists require:

- `GET /inventory?warehouse_id=`
- `GET /stock-movements?warehouse_id=&product_id=`
- `GET /purchase-orders`, `GET /sales-orders`
- `GET /ledger/journal-entries`

No new business rules. Writes still use the original Stage 2 POSTs.

## Tests

```bash
npm test                 # RBAC matrix + error mapping
npm run flow             # live operator journey against :3100
npm run build
```
