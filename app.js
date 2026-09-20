const DB_NAME = "expense-log";
const DB_VERSION = 1;
const STORES = {
  transactions: "transactions",
  mutations: "mutations",
  settings: "settings",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const form = document.querySelector("#expense-form");
const dateInput = document.querySelector("#date");
const passwordInput = document.querySelector("#app-password");
const rememberInput = document.querySelector("#remember-password");
const syncButton = document.querySelector("#sync-button");
const syncStatus = document.querySelector("#sync-status");

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      database.createObjectStore(STORES.transactions, { keyPath: "id" });
      database.createObjectStore(STORES.mutations, { keyPath: "id" });
      database.createObjectStore(STORES.settings, { keyPath: "key" });
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

const database = await openDatabase();

async function getAll(storeName) {
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll());
}

async function getSetting(key) {
  const transaction = database.transaction(STORES.settings, "readonly");
  const value = await requestResult(transaction.objectStore(STORES.settings).get(key));
  return value?.value ?? "";
}

async function setSetting(key, value) {
  const transaction = database.transaction(STORES.settings, "readwrite");
  const store = transaction.objectStore(STORES.settings);
  if (value) store.put({ key, value });
  else store.delete(key);
  await transactionDone(transaction);
}

async function recordExpense(expense) {
  const mutation = {
    id: crypto.randomUUID(),
    op: "upsert",
    transaction: expense,
  };
  const transaction = database.transaction(
    [STORES.transactions, STORES.mutations],
    "readwrite",
  );
  transaction.objectStore(STORES.transactions).put(expense);
  transaction.objectStore(STORES.mutations).put(mutation);
  await transactionDone(transaction);
}

async function replaceSnapshot(transactions) {
  const transaction = database.transaction(
    [STORES.transactions, STORES.mutations],
    "readwrite",
  );
  const records = transaction.objectStore(STORES.transactions);
  records.clear();
  for (const record of transactions) records.put(record);
  transaction.objectStore(STORES.mutations).clear();
  await transactionDone(transaction);
}

function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
}

async function render() {
  const transactions = await getAll(STORES.transactions);
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  const records = document.querySelector("#records");
  const recordsTable = document.querySelector("#records-table");
  const emptyState = document.querySelector("#empty-state");
  records.replaceChildren();

  for (const transaction of transactions) {
    const row = document.createElement("tr");
    row.append(
      createCell(transaction.date),
      createCell(transaction.merchant || "—"),
      createCell(transaction.category),
      createCell(money.format(transaction.amountCents / 100)),
    );
    records.append(row);
  }

  recordsTable.hidden = transactions.length === 0;
  emptyState.hidden = transactions.length > 0;

  const month = new Date().toISOString().slice(0, 7);
  const current = transactions.filter((transaction) => transaction.date.startsWith(month));
  const total = current.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  document.querySelector("#month-total").textContent = money.format(total / 100);
  document.querySelector("#month-count").textContent = String(current.length);

  const categories = new Map();
  for (const transaction of current) {
    categories.set(
      transaction.category,
      (categories.get(transaction.category) ?? 0) + transaction.amountCents,
    );
  }

  const summary = document.querySelector("#category-summary");
  summary.replaceChildren();
  for (const [category, amount] of [...categories].sort((a, b) => b[1] - a[1])) {
    const row = document.createElement("tr");
    row.append(createCell(category), createCell(money.format(amount / 100)));
    summary.append(row);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const amountCents = Math.round(Number(data.get("amount")) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return;

  const now = new Date().toISOString();
  await recordExpense({
    id: crypto.randomUUID(),
    date: String(data.get("date")),
    amountCents,
    category: String(data.get("category")).trim().toLowerCase(),
    merchant: String(data.get("merchant")).trim(),
    note: String(data.get("note")).trim(),
    updatedAt: now,
  });

  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  document.querySelector("#amount").focus();
  await render();
});

syncButton.addEventListener("click", async () => {
  const password = passwordInput.value;
  if (!password) {
    syncStatus.textContent = "Enter the app password first.";
    return;
  }

  syncButton.disabled = true;
  syncStatus.textContent = "Syncing…";

  try {
    await setSetting("app-password", rememberInput.checked ? password : "");
    const mutations = await getAll(STORES.mutations);
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        authorization: `Bearer ${password}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ mutations }),
    });

    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.error ?? `Sync failed (${response.status})`);
    }

    const result = await response.json();
    await replaceSnapshot(result.transactions);
    await render();
    syncStatus.textContent = `Synced ${result.accepted} local change(s) at ${new Date().toLocaleTimeString()}.`;
  } catch (error) {
    syncStatus.textContent = error instanceof Error ? error.message : "Sync failed.";
  } finally {
    syncButton.disabled = false;
  }
});

dateInput.value = new Date().toISOString().slice(0, 10);
passwordInput.value = await getSetting("app-password");
await render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
