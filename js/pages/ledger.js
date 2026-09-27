import "../site.js";
import { getTransactions } from "../db.js";
import { createCell, money } from "../format.js";
import { setupSync } from "../sync.js";

const records = document.querySelector("#records");
const recordsTable = document.querySelector("#records-table");
const emptyState = document.querySelector("#empty-state");

async function render() {
  const transactions = await getTransactions();
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  records.replaceChildren();
  for (const transaction of transactions) {
    const type = transaction.type === "credit" ? "credit" : "expense";
    const amount = money.format(transaction.amountCents / 100);
    const editLink = document.createElement("a");
    editLink.href = `/add/?id=${encodeURIComponent(transaction.id)}`;
    editLink.textContent = "Edit";
    const editCell = document.createElement("td");
    editCell.append(editLink);

    const row = document.createElement("tr");
    row.append(
      createCell(transaction.date),
      createCell(transaction.merchant || "—"),
      createCell(transaction.category),
      createCell(type === "expense" ? amount : ""),
      createCell(type === "credit" ? amount : ""),
      editCell,
    );
    records.append(row);
  }

  recordsTable.hidden = transactions.length === 0;
  emptyState.hidden = transactions.length > 0;
}

await render();
await setupSync({ afterSync: render });
