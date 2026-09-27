# expense-log

A tiny, private, offline-first expense log.

- Vanilla HTML, CSS and JavaScript, with no build step
- IndexedDB as the offline working database
- A Hono function on Vercel that syncs with storage
- JSONL in a separate private GitHub repository as durable storage
- Vercel Authentication on all deployments for access control

See [`docs/PLAN.md`](docs/PLAN.md) for the architecture and data model.

## Local setup

Requirements: Node.js 24+ and a Vercel account with this directory linked (`npx vercel link`).

```sh
npm install
cp .env.example .env.local   # then fill in the values
```

`vercel dev` reads variables from the project's **Development** environment, not from `.env.local`. Copy them there once:

```sh
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  printf '%s' "$value" | npx vercel env add "$key" development --sensitive --force
done < .env.local
```

Then run the server bound to this machine only. Local development has no Vercel Authentication in front of it, and the API holds your real GitHub token:

```sh
npx vercel dev --listen 127.0.0.1:3001
```

Localhost uses an isolated `expense-log-dev` IndexedDB database and seeds it with fake transactions and categories when empty. Delete that database in browser developer tools to reset the fixtures. Seeded records are not queued for sync, but anything you add locally syncs to the real data repository.

## Sync

Pages render from IndexedDB, then sync in the background on load, when the tab becomes visible and when the browser comes back online. **Sync now** on the Overview page syncs immediately.

## Data repository

Create a second private GitHub repository, such as `expense-log-data`. Do not use this application repository for finance data: sync commits would otherwise trigger unnecessary Vercel deployments.

Create a fine-grained GitHub token with access only to the data repository and **Contents: Read and write** permission. Set the variables from `.env.example` in Vercel for Production and Development. They are read only by the server function.

The first successful sync creates `data/mutations.jsonl` automatically.

## Commands

```sh
npm run typecheck
```

The frontend intentionally has no build step or framework.
