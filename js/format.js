export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
}

export function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
