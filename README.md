# expenses.jsonl

A small and private expense log with on-device IndexDB that syncs to a private repo that stores JSONL.

## Setup

Requirements: Node.js 24+ and this directory linked to a Vercel project (`npx vercel link`).

1. Create a second private GitHub repository for the data, such as `expense-log-data`.
2. Create a fine-grained GitHub token with **Contents: Read and write** on only that repository.
3. Set the variables from `.env.example` in Vercel for **Production** and **Development**.

The first sync creates `data/mutations.jsonl`.

## Local Development
Anything you add locally still syncs to the real data repository.

```sh
npm install
npm run typecheck
npx vercel dev
```

