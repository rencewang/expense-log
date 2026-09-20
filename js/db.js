import { createDevelopmentExpenses } from "../dev-data.js";

const IS_LOCAL_DEVELOPMENT = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const DB_NAME = IS_LOCAL_DEVELOPMENT ? "expense-log-dev" : "expense-log";
const DB_VERSION = 1;

const STORES = {
  transactions: "transactions",
  mutations: "mutations",
  settings: "settings",
};

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

async function seedDevelopmentDatabase() {
  if (!IS_LOCAL_DEVELOPMENT) return;

  const countTransaction = database.transaction(STORES.transactions, "readonly");
  const count = await requestResult(
    countTransaction.objectStore(STORES.transactions).count(),
  );
  if (count > 0) return;

  const seedTransaction = database.transaction(STORES.transactions, "readwrite");
  const store = seedTransaction.objectStore(STORES.transactions);
  for (const expense of createDevelopmentExpenses()) store.put(expense);
  await transactionDone(seedTransaction);
}

await seedDevelopmentDatabase();

async function getAll(storeName) {
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll());
}

export function getTransactions() {
  return getAll(STORES.transactions);
}

export function getMutations() {
  return getAll(STORES.mutations);
}

export async function getSetting(key) {
  const transaction = database.transaction(STORES.settings, "readonly");
  const value = await requestResult(transaction.objectStore(STORES.settings).get(key));
  return value?.value ?? "";
}

export async function setSetting(key, value) {
  const transaction = database.transaction(STORES.settings, "readwrite");
  const store = transaction.objectStore(STORES.settings);
  if (value) store.put({ key, value });
  else store.delete(key);
  await transactionDone(transaction);
}

export async function recordExpense(expense) {
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

export async function replaceSnapshot(transactions) {
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
