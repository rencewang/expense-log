import "../site.js";
import { getTransactions } from "../db.js";
import { createCell, money } from "../format.js";

const transactions = await getTransactions();
transactions.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

const records = document.querySelector("#records");
const recordsTable = document.querySelector("#records-table");
const emptyState = document.querySelector("#empty-state");

for (const transaction of transactions) {
  const type = transaction.type === "credit" ? "credit" : "expense";
  const amount = money.format(transaction.amountCents / 100);
  const row = document.createElement("tr");
  row.append(
    createCell(transaction.date),
    createCell(transaction.merchant || "—"),
    createCell(transaction.category),
    createCell(type === "expense" ? amount : ""),
    createCell(type === "credit" ? amount : ""),
  );
  records.append(row);
}

recordsTable.hidden = transactions.length === 0;
emptyState.hidden = transactions.length > 0;
