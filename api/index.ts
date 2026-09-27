import { Hono } from "hono";

type TransactionType = "expense" | "credit";

// New transactions reference a category by ID. Transactions written before
// configured categories store the category name in `category` instead.
type Transaction = {
  id: string;
  type?: TransactionType;
  date: string;
  amountCents: number;
  categoryId?: string;
  category?: string;
  merchant: string;
  note: string;
  updatedAt: string;
};

type Category = {
  id: string;
  name: string;
  order: number;
  archived: boolean;
  updatedAt: string;
};

// Mutations without `entity` predate categories and are transaction upserts.
type TransactionUpsert = {
  id: string;
  op: "upsert";
  entity?: "transaction";
  transaction: Transaction;
};

type CategoryUpsert = {
  id: string;
  op: "upsert";
  entity: "category";
  category: Category;
};

type DeleteMutation = {
  id: string;
  op: "delete";
  transactionId: string;
  deletedAt: string;
};

type Mutation = TransactionUpsert | CategoryUpsert | DeleteMutation;

type Snapshot = {
  transactions: Transaction[];
  categories: Category[];
};

type GitHubFile = {
  sha: string | null;
  content: string;
};

const app = new Hono().basePath("/api");

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function githubHeaders(): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${requiredEnvironment("GITHUB_TOKEN")}`,
    "x-github-api-version": "2022-11-28",
  };
}

function githubFileUrl(): string {
  const repository = requiredEnvironment("GITHUB_DATA_REPO");
  const path = process.env.GITHUB_DATA_PATH ?? "data/mutations.jsonl";
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repository}/contents/${encodedPath}`;
}

function decodeBase64(value: string): string {
  const binary = atob(value.replaceAll(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function readGitHubFile(): Promise<GitHubFile> {
  const branch = process.env.GITHUB_DATA_BRANCH ?? "main";
  const response = await fetch(`${githubFileUrl()}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(),
  });

  if (response.status === 404) return { sha: null, content: "" };
  if (!response.ok) throw new Error(`GitHub read failed with status ${response.status}`);

  const file = (await response.json()) as { sha?: unknown; content?: unknown };
  if (typeof file.sha !== "string" || typeof file.content !== "string") {
    throw new Error("GitHub returned an unsupported file response");
  }

  return { sha: file.sha, content: decodeBase64(file.content) };
}

async function writeGitHubFile(file: GitHubFile, content: string): Promise<Response> {
  const branch = process.env.GITHUB_DATA_BRANCH ?? "main";
  return fetch(githubFileUrl(), {
    method: "PUT",
    headers: {
      ...githubHeaders(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: "Sync expense mutations",
      content: encodeBase64(content),
      branch,
      ...(file.sha ? { sha: file.sha } : {}),
    }),
  });
}

function parseMutations(content: string): Mutation[] {
  if (!content.trim()) return [];
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Mutation)
    .filter(isMutation);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTransaction(value: unknown): value is Transaction {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    (value.type === undefined || value.type === "expense" || value.type === "credit") &&
    typeof value.date === "string" &&
    Number.isSafeInteger(value.amountCents) &&
    (value.amountCents as number) > 0 &&
    (typeof value.categoryId === "string" || typeof value.category === "string") &&
    typeof value.merchant === "string" &&
    typeof value.note === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isCategory(value: unknown): value is Category {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.order === "number" &&
    Number.isFinite(value.order) &&
    typeof value.archived === "boolean" &&
    typeof value.updatedAt === "string"
  );
}

function isMutation(value: unknown): value is Mutation {
  if (!isObject(value) || typeof value.id !== "string") return false;
  if (value.op === "delete") {
    return typeof value.transactionId === "string" && typeof value.deletedAt === "string";
  }
  if (value.op !== "upsert") return false;
  if (value.entity === "category") return isCategory(value.category);
  return (value.entity === undefined || value.entity === "transaction") && isTransaction(value.transaction);
}

// Must match legacyCategoryId() in js/db.js.
function legacyCategoryId(name: string): string {
  return `legacy:${name.trim().toLowerCase()}`;
}

function newer(a: { updatedAt: string }, aId: string, b: { updatedAt: string }, bId: string) {
  return `${a.updatedAt}:${aId}` > `${b.updatedAt}:${bId}`;
}

// Latest upsert per ID wins. A delete tombstone is final: any transaction
// with a tombstone is omitted, even if a later upsert exists (for example,
// from a device that was offline when it was deleted). Categories are never
// deleted, only archived, because old transactions still reference them.
//
// Legacy transactions carry a category name; they get a deterministic
// category ID, and a category record is synthesized for any such name that
// has no explicit record. Renaming it writes an explicit record with that ID.
function materialize(mutations: Mutation[]): Snapshot {
  const transactions = new Map<string, TransactionUpsert>();
  const categories = new Map<string, CategoryUpsert>();
  const deleted = new Set<string>();

  for (const mutation of mutations) {
    if (mutation.op === "delete") {
      deleted.add(mutation.transactionId);
    } else if (mutation.entity === "category") {
      const previous = categories.get(mutation.category.id);
      if (!previous || newer(mutation.category, mutation.id, previous.category, previous.id)) {
        categories.set(mutation.category.id, mutation);
      }
    } else {
      const previous = transactions.get(mutation.transaction.id);
      if (!previous || newer(mutation.transaction, mutation.id, previous.transaction, previous.id)) {
        transactions.set(mutation.transaction.id, mutation);
      }
    }
  }

  const legacyNames = new Map<string, string>();
  const current = [...transactions.values()]
    .filter((mutation) => !deleted.has(mutation.transaction.id))
    .map(({ transaction }) => {
      const { category, ...rest } = transaction;
      let categoryId = transaction.categoryId;
      if (!categoryId) {
        const name = (category ?? "").trim().toLowerCase() || "uncategorized";
        categoryId = legacyCategoryId(name);
        legacyNames.set(categoryId, name);
      }
      return { ...rest, categoryId, type: transaction.type ?? "expense" };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  const records = [...categories.values()].map((mutation) => mutation.category);
  const synthesized = [...legacyNames]
    .filter(([id]) => !categories.has(id))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([id, name], index) => ({
      id,
      name,
      order: records.length + index,
      archived: false,
      updatedAt: "1970-01-01T00:00:00.000Z",
    }));

  return {
    transactions: current,
    categories: [...records, ...synthesized].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    ),
  };
}

app.get("/health", (context) => context.json({ ok: true }));

// Access control is Vercel Authentication on all deployments, applied before
// this function runs. As defense against cross-site request forgery, writes
// must come from this site's own origin.
app.use("*", async (context, next) => {
  if (context.req.method === "GET") return next();
  const origin = context.req.header("origin");
  const host = context.req.header("host");
  if (origin && (!host || new URL(origin).host !== host)) {
    return context.json({ error: "Cross-origin request rejected" }, 403);
  }
  return next();
});

app.get("/transactions", async (context) => {
  const file = await readGitHubFile();
  return context.json(materialize(parseMutations(file.content)));
});

app.post("/sync", async (context) => {
  const body = await context.req.json().catch(() => null);
  if (!isObject(body) || !Array.isArray(body.mutations) || body.mutations.length > 1_000) {
    return context.json({ error: "Expected at most 1,000 mutations" }, 400);
  }
  if (!body.mutations.every(isMutation)) {
    return context.json({ error: "One or more mutations are invalid" }, 400);
  }

  const incoming = body.mutations as Mutation[];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const file = await readGitHubFile();
    const existing = parseMutations(file.content);
    const knownIds = new Set(existing.map((mutation) => mutation.id));
    const accepted = incoming.filter((mutation) => !knownIds.has(mutation.id));

    if (accepted.length === 0) {
      return context.json({ accepted: 0, ...materialize(existing) });
    }

    const allMutations = [...existing, ...accepted];
    const content = `${allMutations.map((mutation) => JSON.stringify(mutation)).join("\n")}\n`;
    const response = await writeGitHubFile(file, content);

    if (response.ok) {
      return context.json({
        accepted: accepted.length,
        ...materialize(allMutations),
      });
    }

    if (response.status !== 409 && response.status !== 422) {
      throw new Error(`GitHub write failed with status ${response.status}`);
    }
  }

  return context.json({ error: "Storage changed during sync; try again" }, 409);
});

app.onError((error, context) => {
  console.error(error);
  return context.json({ error: "Server error" }, 500);
});

export default app;
