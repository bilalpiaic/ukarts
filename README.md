# U.K Arts ERP

A web-based ERP for textile material and garment production — covering owner
investment, grey cloth purchasing, lot management, sales, production,
processing, stitching, finished goods, and **double-entry accounting**.

Built with **Next.js + TypeScript** on **PostgreSQL**. This repository contains
a working, end-to-end vertical slice of the system plus a ready-to-use
development environment. The full technical design lives in
[`docs/DESIGN.md`](docs/DESIGN.md).

---

## Core principles

- Every inventory change requires an inventory ledger entry.
- Every financial posting requires a **balanced** journal entry (Debits = Credits).
- Posted transactions are immutable; corrections use reversals/adjustments.
- Grey traceability is preserved by item, category, quality, lot, sale order,
  production order, party, location, and stage.
- Critical workflows post inside a single PostgreSQL transaction (all-or-nothing).

## Architecture

```
Frontend (Next.js + TypeScript)
        │
Application / API layer (route handlers + posting engine)
        │
Inventory · Production · Costing · Accounting engines
        │
PostgreSQL (schemas: master, sales, inventory, production, accounting, audit)
```

The system revolves around three integrated ledgers:

- **Inventory ledger** — material, location, lot, quality, sale/production order.
- **Production ledger** — production orders, consumption, processor/stitcher
  quantities, WIP, losses, finished production.
- **General ledger** — cash, payables, receivables, inventory, costs, income.

## What's implemented today

The current slice demonstrates the full ledger loop end to end:

- **Owner investment** → balanced journal (`Dr Cash / Cr Owner Investment`).
- **Grey purchase** → grey lot creation, an inventory movement into the owner
  grey store, and a balanced journal (`Dr Grey Inventory / Cr Supplier Payable`)
  — all in one transaction.
- **Trial balance** report that proves Debits = Credits.
- **Grey stock by location & lot**, computed from the inventory ledger via the
  `inventory.get_location_stock` function.
- **Recent journal vouchers** with posting status.

The complete database schema from the design document (all modules: sales,
production, processing, stitching, finished goods, shortages, costing, audit) is
created by `db/schema.sql`, ready for the remaining modules to build on.

## Tech stack

| Layer     | Choice                              |
| --------- | ----------------------------------- |
| Frontend  | Next.js 15 (App Router) + React 19  |
| Language  | TypeScript                          |
| Database  | PostgreSQL 16                       |
| DB access | `pg` (node-postgres) with pooling   |

## Quick start (local)

Prerequisites: Node.js 22+ and PostgreSQL 16 (a local server on `localhost:5432`).

```bash
# 1. Install dependencies
npm install

# 2. Point the app at your database
cp .env.example .env.local        # edit DATABASE_URL if needed

# 3. Create the schema + seed data (idempotent)
npm run db:setup

# 4. Start the dev server
npm run dev                       # http://localhost:3000
```

`DATABASE_URL` defaults to `postgres://ukarts:ukarts@localhost:5432/ukarts`.

### Using the Cloud Agent environment

This repo ships a Cloud Agent environment (`.cursor/environment.json`) that
provisions everything automatically:

- `scripts/install.sh` — installs PostgreSQL (if missing), runs `npm ci`, and
  initializes a local Postgres cluster. Idempotent.
- `scripts/start.sh` — starts PostgreSQL, ensures the app role/database, and
  applies the schema + seed on every boot. Idempotent.
- A `next dev` terminal serves the app on port 3000.

## npm scripts

| Script             | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Start the Next.js dev server                       |
| `npm run build`    | Production build (also type-checks and lints)      |
| `npm start`        | Run the production build                            |
| `npm run lint`     | Lint                                               |
| `npm run db:setup` | Apply `db/schema.sql` + `db/seed.sql` (idempotent) |
| `npm run db:reset` | Drop app schemas, then re-apply schema + seed      |

## Project structure

```
.
├── .cursor/environment.json   # Cloud Agent dev environment
├── db/
│   ├── schema.sql             # Full ERP schema (idempotent)
│   └── seed.sql               # Chart of accounts, posting rules, master data
├── docs/
│   └── DESIGN.md              # Full Software Design Document (SDD)
├── scripts/
│   ├── install.sh             # Environment install (idempotent)
│   ├── start.sh               # Environment start (idempotent)
│   └── db-setup.mjs           # Apply schema + seed via node-postgres
└── src/
    ├── lib/
    │   ├── db.ts              # Pooled connection + withTransaction helper
    │   └── erp.ts             # Posting-rule engine, transactions, reports
    └── app/
        ├── page.tsx           # Dashboard (server component)
        ├── forms.tsx          # Interactive forms (client component)
        └── api/               # health, owner-investment, grey-purchase
```

## Accounting engine

Journal postings are driven by configurable rules in
`accounting.posting_rules` (seeded from the design document, §20). Each business
transaction:

1. runs inside a single DB transaction,
2. writes inventory movements and/or documents,
3. creates a balanced two-line journal entry from the matching rule,
4. calls `accounting.post_journal_entry`, which validates Debits = Credits
   before flipping the entry to `POSTED` (raising and rolling back otherwise).

## End-to-end workflow (target)

```
Owner Investment → Grey Purchase → Grey Lot → Sale Order → Production Order
→ Grey Allocation → Issue to Processor → Processing Receipt → Shortage
Reconciliation → Processing Bill → Issue to Stitcher → Stitching → Production
Receipt → Finished Goods → Sale → Accounting & Profitability
```

## Roadmap

Remaining modules from the design document: sales orders & allocation,
processing (issue/receipt/shortage/bills), stitching (issue/settlement/bills),
finished goods, production costing, party ledgers, trial balance drill-downs,
and profitability reporting. See [`docs/DESIGN.md`](docs/DESIGN.md) for the full
specification and implementation phases.
