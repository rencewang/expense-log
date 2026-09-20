import { getTransactions, recordExpense } from "../db.js";
import { createCell, money, today } from "../format.js";
import { setupSync } from "../sync.js";

const form = document.querySelector("#expense-form");
const dateInput = document.querySelector("#date");

async function render() {
  const transactions = await getTransactions();
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

  const month = today().slice(0, 7);
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
  dateInput.value = today();
  document.querySelector("#amount").focus();
  await render();
});

dateInput.value = today();
await render();
await setupSync({ afterSync: render });
