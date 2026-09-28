export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
}

// One ledger row: optional date, merchant, category, debit, credit, edit link.
export function transactionRow(transaction, categoryNames, { showDate = true } = {}) {
  const amount = money.format(transaction.amountCents / 100);
  const credit = transaction.type === "credit";
  const editLink = document.createElement("a");
  editLink.href = `/add/?id=${encodeURIComponent(transaction.id)}`;
  editLink.textContent = "Edit";
  const editCell = document.createElement("td");
  editCell.append(editLink);

  const row = document.createElement("tr");
  if (showDate) row.append(createCell(transaction.date));
  row.append(
    createCell(transaction.merchant || "—"),
    createCell(categoryNames.get(transaction.categoryId) ?? "—"),
    createCell(credit ? "" : amount),
    createCell(credit ? amount : ""),
    editCell,
  );
  return row;
}

// YYYY-MM-DD in the device's local time zone.
export function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function today() {
  return localDate(new Date());
}
