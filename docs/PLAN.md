# Expense Log Plan

## Goal

Build the smallest useful personal expense tracker: offline entry on PWA or browser, and manual sync to durable storage.

## Principles

1. Local entry must work without a network connection.
2. Sync is explicit and recoverable, not invisible background machinery.
3. Prefer browser and platform APIs over libraries.
4. Keep financial data portable, inspectable, and easy to back up.
5. Preserve the old-web aesthetic: semantic HTML, native controls, system fonts, links, borders, and tables.
6. Add infrastructure only after a demonstrated need.

## Architecture

```text
Phone or laptop browser
  static HTML/CSS/JS PWA
  IndexedDB: transactions + unsynced mutations
             |
             | manual POST /api/sync
             v
Vercel Function
  Hono API + app-password check
  GitHub token held only in Vercel environment
             |
             | GitHub Contents API
             v
Private data repository
  data/mutations.jsonl
```

The application repository and data repository MUST remain separate. A data commit must not redeploy the application.

### Why this shape

- IndexedDB makes entry and display instant and offline.
- Vercel removes the need to operate an always-on computer or container.
- Hono supplies small typed HTTP routing without imposing a frontend framework.
- GitHub provides durable, versioned storage suitable for this low write volume.
- JSONL is directly readable by JavaScript, DuckDB, Polars, and command-line tools.

GitHub is not queried for every render. The UI reads its local IndexedDB snapshot; sync exchanges queued mutations and a refreshed snapshot.

## Data model

Amounts are positive integer cents. `type` is either `expense` or `credit`; credits cover refunds, reimbursements, and income. Existing records without a type are treated as expenses. Currency is USD for v0.

```json
{
  "id": "mutation UUID",
  "op": "upsert",
  "transaction": {
    "id": "transaction UUID",
    "type": "expense",
    "date": "2026-08-29",
    "amountCents": 1299,
    "category": "food",
    "merchant": "Example",
    "note": "",
    "updatedAt": "2026-08-30T03:00:00.000Z"
  }
}
```

Each JSONL line is an immutable mutation. The server deduplicates by mutation ID and materializes one transaction per transaction ID. Later updates resolve by `updatedAt`, with mutation ID as a deterministic tie-breaker.

A deletion can later be represented as a tombstone mutation without rewriting history.

## Sync protocol

1. Entry writes the transaction and its mutation atomically to IndexedDB.
2. The user presses **Sync** when online.
3. The client sends all queued mutations with an app password.
4. The server reads the current JSONL file, deduplicates mutations, and commits the appended file using its Git blob SHA.
5. A stale-SHA conflict is retried from the latest file.
6. The server returns the complete materialized transaction snapshot.
7. The client replaces its local read model and clears only the accepted queue.

This is intentionally optimized for one person and a small number of devices, not concurrent collaborative editing.

## v0 scope

- Installable PWA shell
- Offline expense and credit entry
- Local transaction list
- Current-month total and category totals
- Manual sync and pull from the private data repository
- One app password shared across the user's devices
- USD only

## Explicit non-goals

- Bank or Plaid integration
- Envelope budgeting
- Accounts, balances, investments, or net worth
- Multi-user permissions
- Recurring transaction automation
- Background sync
- General-purpose accounting or double entry
- React, Tailwind, charting libraries, ORM, or Postgres

## Milestones

### 0. Foundation

- Static PWA and brutalist baseline
- IndexedDB stores and local entry flow
- Hono health, read, and sync endpoints
- Vercel and environment configuration

### 1. Prove the loop

- Create the private data repository and token
- Deploy to Vercel
- Enter expenses offline on the phone
- Sync, then open and sync in a laptop browser
- Verify the JSONL history and recovery path

### 2. Make it personally usable

- Edit and delete via new immutable mutations
- CSV import for card statements
- Category management without a dedicated settings system
- Date/category filters
- Export JSONL and CSV

### 3. Only if usage justifies it

- Annual JSONL files if the single file becomes awkward
- Better device authentication
- Small SVG visualizations
- Migrate to SQLite/libSQL if server-side relational queries become useful

## Analytics

For the app, thousands of transactions can be reduced locally in JavaScript without a query service. For deeper analysis, clone the data repository and query JSONL directly:

```sql
SELECT transaction.category, sum(transaction.amountCents) / 100.0 AS spent
FROM read_json_auto('data/mutations.jsonl')
WHERE op = 'upsert'
GROUP BY transaction.category
ORDER BY spent DESC;
```

This naive query does not collapse later updates; a reusable DuckDB view should materialize the latest mutation before serious analysis.

## Security boundary

- `GITHUB_TOKEN` exists only in Vercel server-side environment variables.
- The token is fine-grained, expires, and can access only the data repository contents.
- Browsers hold only the app password, optionally in IndexedDB.
- The API accepts same-origin requests and does not enable broad CORS.
- The frontend must not execute transaction values through `innerHTML`.
- This authentication design is acceptable for one private user, not a public multi-tenant service.

## Exit criteria

v0 is complete when an expense can be entered offline on the phone, manually synced, and then viewed after syncing from a clean laptop browser, with the corresponding mutation visible in the private GitHub data repository.
