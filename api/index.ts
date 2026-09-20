import { Hono } from "hono";

type Expense = {
  id: string;
  date: string;
  amountCents: number;
  category: string;
  merchant: string;
  note: string;
  updatedAt: string;
};

type Mutation = {
  id: string;
  op: "upsert";
  transaction: Expense;
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

function isMutation(value: unknown): value is Mutation {
  if (!isObject(value) || value.op !== "upsert" || typeof value.id !== "string") return false;
  const transaction = value.transaction;
  return (
    isObject(transaction) &&
    typeof transaction.id === "string" &&
    typeof transaction.date === "string" &&
    Number.isSafeInteger(transaction.amountCents) &&
    (transaction.amountCents as number) > 0 &&
    typeof transaction.category === "string" &&
    typeof transaction.merchant === "string" &&
    typeof transaction.note === "string" &&
    typeof transaction.updatedAt === "string"
  );
}

function materialize(mutations: Mutation[]): Expense[] {
  const latest = new Map<string, Mutation>();

  for (const mutation of mutations) {
    const previous = latest.get(mutation.transaction.id);
    const currentOrder = `${mutation.transaction.updatedAt}:${mutation.id}`;
    const previousOrder = previous
      ? `${previous.transaction.updatedAt}:${previous.id}`
      : "";
    if (!previous || currentOrder > previousOrder) latest.set(mutation.transaction.id, mutation);
  }

  return [...latest.values()]
    .map((mutation) => mutation.transaction)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}

app.get("/health", (context) => context.json({ ok: true }));

app.use("*", async (context, next) => {
  if (context.req.path === "/api/health") return next();
  const expected = requiredEnvironment("APP_PASSWORD");
  if (context.req.header("authorization") !== `Bearer ${expected}`) {
    return context.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.get("/transactions", async (context) => {
  const file = await readGitHubFile();
  return context.json({ transactions: materialize(parseMutations(file.content)) });
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
      return context.json({ accepted: 0, transactions: materialize(existing) });
    }

    const allMutations = [...existing, ...accepted];
    const content = `${allMutations.map((mutation) => JSON.stringify(mutation)).join("\n")}\n`;
    const response = await writeGitHubFile(file, content);

    if (response.ok) {
      return context.json({
        accepted: accepted.length,
        transactions: materialize(allMutations),
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
