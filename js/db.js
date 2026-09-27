const IS_LOCAL_DEVELOPMENT = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const DB_NAME = IS_LOCAL_DEVELOPMENT ? "expense-log-dev" : "expense-log";
const DB_VERSION = 2;

const STORES = {
  transactions: "transactions",
  mutations: "mutations",
  settings: "settings",
  categories: "categories",
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

    request.addEventListener("upgradeneeded", (event) => {
      const database = request.result;
      if (event.oldVersion < 1) {
        database.createObjectStore(STORES.transactions, { keyPath: "id" });
        database.createObjectStore(STORES.mutations, { keyPath: "id" });
        database.createObjectStore(STORES.settings, { keyPath: "key" });
      }
      if (event.oldVersion < 2) {
        database.createObjectStore(STORES.categories, { keyPath: "id" });
      }
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

  // Loaded only on localhost, so production never downloads the fixtures.
  const { createDevelopmentData } = await import("../dev-data.js");
  const { transactions, categories } = createDevelopmentData();
  const seedTransaction = database.transaction(
    [STORES.transactions, STORES.categories],
    "readwrite",
  );
  for (const record of transactions) seedTransaction.objectStore(STORES.transactions).put(record);
  for (const record of categories) seedTransaction.objectStore(STORES.categories).put(record);
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

// Sorted alphabetically.
export async function getCategories() {
  const categories = await getAll(STORES.categories);
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCategoryNames() {
  return new Map((await getCategories()).map((category) => [category.id, category.name]));
}

// Creates, renames, archives or restores a category. Categories
// are never deleted because transactions keep referencing them.
export async function recordCategories(records) {
  const transaction = database.transaction(
    [STORES.categories, STORES.mutations],
    "readwrite",
  );
  for (const record of records) {
    transaction.objectStore(STORES.categories).put(record);
    transaction.objectStore(STORES.mutations).put({
      id: crypto.randomUUID(),
      op: "upsert",
      entity: "category",
      category: record,
    });
  }
  await transactionDone(transaction);
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

export async function getTransaction(id) {
  const transaction = database.transaction(STORES.transactions, "readonly");
  return requestResult(transaction.objectStore(STORES.transactions).get(id));
}

// Records a new transaction or an edit. An edit reuses the transaction ID
// with a newer updatedAt; the server keeps the latest upsert per ID.
export async function recordTransaction(record) {
  const mutation = {
    id: crypto.randomUUID(),
    op: "upsert",
    transaction: record,
  };
  const transaction = database.transaction(
    [STORES.transactions, STORES.mutations],
    "readwrite",
  );
  transaction.objectStore(STORES.transactions).put(record);
  transaction.objectStore(STORES.mutations).put(mutation);
  await transactionDone(transaction);
}

// Deletion is a permanent tombstone: once synced, no later upsert can
// restore the transaction.
export async function deleteTransaction(transactionId) {
  const mutation = {
    id: crypto.randomUUID(),
    op: "delete",
    transactionId,
    deletedAt: new Date().toISOString(),
  };
  const transaction = database.transaction(
    [STORES.transactions, STORES.mutations],
    "readwrite",
  );
  transaction.objectStore(STORES.transactions).delete(transactionId);
  transaction.objectStore(STORES.mutations).put(mutation);
  await transactionDone(transaction);
}

// Replaces local records with the server snapshot, clearing only the
// mutations that were sent. Changes made while the sync was in flight stay
// queued and are reapplied on top of the snapshot.
export async function replaceSnapshot({ transactions, categories }, syncedMutationIds) {
  const transaction = database.transaction(
    [STORES.transactions, STORES.categories, STORES.mutations],
    "readwrite",
  );
  const records = transaction.objectStore(STORES.transactions);
  const categoryRecords = transaction.objectStore(STORES.categories);
  const mutations = transaction.objectStore(STORES.mutations);

  for (const id of syncedMutationIds) mutations.delete(id);
  const pending = await requestResult(mutations.getAll());

  records.clear();
  categoryRecords.clear();
  for (const record of transactions) records.put(record);
  for (const record of categories) categoryRecords.put(record);
  for (const mutation of pending) {
    if (mutation.op === "delete") records.delete(mutation.transactionId);
    else if (mutation.entity === "category") categoryRecords.put(mutation.category);
    else records.put(mutation.transaction);
  }
  await transactionDone(transaction);
}
