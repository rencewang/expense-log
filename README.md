# expense-log

A tiny, private, offline-first expense log.

- Vanilla HTML CSS JS
- IndexedDB for offline entry and local read model
- Hono on Vercel for sync and authentication
- JSONL in a separate private GitHub repository for durable storage

See [`docs/PLAN.md`](docs/PLAN.md) for the architecture and delivery plan.

## Local setup

Requirements: Node.js 22+ and a Vercel account.

```sh
npm install
cp .env.example .env.local
npx vercel dev
```

Open the URL printed by `vercel dev`. Entries remain in IndexedDB until you press **Sync**.

## Data repository

Create a second private GitHub repository, such as `expense-log-data`. Do not use this application repository for finance data: sync commits would otherwise trigger unnecessary Vercel deployments.

Create a fine-grained GitHub token with access only to the data repository and **Contents: Read and write** permission. Configure the variables from `.env.example` in Vercel; never prefix secrets with `VITE_` or expose them to client code.

The first successful sync creates `data/mutations.jsonl` automatically.

## Commands

```sh
npm run typecheck
```

The frontend intentionally has no build step or framework.
