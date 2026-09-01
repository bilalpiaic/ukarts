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

## What's implemented

The full production-to-accounting lifecycle is implemented, each step running in
a single transaction with a balanced journal and inventory-ledger movements:

- **Purchasing** — owner investment; grey purchase (lot + stock-in +
  `Dr Grey Inventory / Cr Supplier Payable`).
- **Production planning** — sale orders; production orders with BOM (design
  standard consumption); grey allocation.
- **Processing** — issue grey to processor (custody move); processing receipt
  with reconciliation (`issued = processed + returned + shortage`) and shortage
  classification (processor-recoverable / normal / abnormal loss); processing
  bill (`Dr Processing Cost / Cr Processor Payable`, net of recovery).
- **Stitching & finished goods** — issue processed cloth to stitcher; stitching
  production receipt (finished goods into inventory); stitching bill.
- **Sales** — dispatch finished goods with cash or credit revenue postings.
- **Reports** — trial balance, party ledgers (AP/AR), inventory by stage,
  production costing, profitability, and KPI dashboard.

Each business action is exposed at `POST /api/action/[name]` and driven from the
module pages (Overview, Purchasing, Production, Processing, Stitching, Sales).

Accounting model note: conversion costs (processing, stitching) and grey
consumption are expensed as incurred to the P&L, while the `production_costs`
table accumulates true per-order product cost for management reporting and
profitability. Every posting keeps Total Debits = Total Credits.

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

### Signing in

The app requires authentication. Seeded demo accounts:

- `admin` / `admin123` — full access (edit/delete, Admin, Settings)
- `user` / `user123` — create and view

Set `AUTH_SECRET` (used to sign session cookies) to a long random value in
production; a development fallback is used when it is unset.

### Feature highlights

- Admin/User authentication with role-based access
- Organization settings (used in print headers)
- Searchable, type-to-filter dropdowns (LOVs) throughout
- Reports dashboard with from/to date filtering and printable output
- Print buttons on all forms and reports
- Multi-tab Workspace to operate several modules at once
- Admin editing/deletion of master data and voiding of documents

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

## Deployment (Vercel + Neon)

The app is deploy-ready for **Vercel** with a **Neon** Postgres database, targeting
`https://ukarts.vercel.app`.

- `vercel.json` sets the build command to `npm run vercel-build`.
- `npm run vercel-build` runs `db-setup.mjs --if-configured` (applies the schema +
  seed to `DATABASE_URL` when it is set, idempotently) and then `next build`. The
  first build before a database is attached simply skips DB setup, so it never
  fails.
- The DB layer enables TLS automatically for managed providers (Neon, etc.).

### Option A — Vercel dashboard (recommended, no CLI)

1. In Vercel, **Add New → Project** and import `bilalpiaic/ukarts`. Set the
   **Project Name** to `ukarts` so the production URL is `ukarts.vercel.app`.
2. Open the project's **Storage** tab → **Create Database → Neon** (Marketplace).
   This provisions Neon and injects `DATABASE_URL` into the project automatically.
3. **Redeploy**. `vercel-build` applies the schema + seed to Neon during the build,
   then the app goes live at `https://ukarts.vercel.app`.

Every push to `main` then auto-deploys.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link                                  # create/link project named "ukarts"
vercel integration add neon                  # provision Neon, injects DATABASE_URL
vercel --prod                                # build (applies schema+seed) + deploy
```

To use an existing/external Neon database instead of the Marketplace, set the
connection string yourself:

```bash
vercel env add DATABASE_URL production        # paste the Neon pooled connection string
vercel env add AUTH_SECRET production          # long random value for session signing
vercel --prod
```

Set `AUTH_SECRET` in Vercel project settings for secure sessions in production.

## Roadmap

Future extensions from the design document: customer invoices & sales tax,
purchase orders, bank reconciliation, GL inventory capitalization (WIP → finished
goods), transaction reversal UI, role-based access control, and multi-warehouse.
See [`docs/DESIGN.md`](docs/DESIGN.md) for the full specification.
