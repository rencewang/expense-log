export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function createCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
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
