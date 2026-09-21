import { getTransactions } from "../db.js";
import { createCell, money, today } from "../format.js";
import { setupSync } from "../sync.js";

async function render() {
  const transactions = await getTransactions();
  const month = today().slice(0, 7);
  const current = transactions.filter((transaction) => transaction.date.startsWith(month));
  const spent = current
    .filter((transaction) => transaction.type !== "credit")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const credits = current
    .filter((transaction) => transaction.type === "credit")
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  document.querySelector("#month-spent").textContent = money.format(spent / 100);
  document.querySelector("#month-credits").textContent = money.format(credits / 100);
  document.querySelector("#month-net").textContent = money.format((spent - credits) / 100);
  document.querySelector("#month-count").textContent = String(current.length);

  const categories = new Map();
  for (const transaction of current.filter((record) => record.type !== "credit")) {
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

await render();
await setupSync({ afterSync: render });
