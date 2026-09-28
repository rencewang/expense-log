import "../site.js";
import { getCategoryNames, getTransactions } from "../db.js";
import { transactionRow } from "../format.js";
import { setupSync } from "../sync.js";

const records = /** @type {HTMLElement} */ (document.querySelector("#records"));
const recordsTable = /** @type {HTMLTableElement} */ (document.querySelector("#records-table"));
const emptyState = /** @type {HTMLElement} */ (document.querySelector("#empty-state"));

async function render() {
  const transactions = await getTransactions();
  const categoryNames = await getCategoryNames();
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  records.replaceChildren();
  for (const transaction of transactions) {
    records.append(transactionRow(transaction, categoryNames));
  }

  recordsTable.hidden = transactions.length === 0;
  emptyState.hidden = transactions.length > 0;
}

await render();
await setupSync({ afterSync: render });
