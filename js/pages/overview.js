import "../site.js";
import { getCategoryNames, getTransactions } from "../db.js";
import { createCell, money, today, transactionRow } from "../format.js";
import { setupSync } from "../sync.js";

// The month view. The URL holds the state, so reloads and the back button
// keep it: ?m=YYYY-MM selects the month (default: this month) and
// &d=YYYY-MM-DD the day whose transactions are listed (default: today when
// viewing this month).

const monthHeading = /** @type {HTMLElement} */ (document.querySelector("#month-heading"));
const previousLink = /** @type {HTMLAnchorElement} */ (document.querySelector("#previous-month"));
const nextLink = /** @type {HTMLAnchorElement} */ (document.querySelector("#next-month"));
const nextSeparator = /** @type {HTMLElement} */ (document.querySelector("#next-month-separator"));
const dayBars = /** @type {HTMLElement} */ (document.querySelector("#day-bars"));
const dayHeading = /** @type {HTMLElement} */ (document.querySelector("#day-heading"));
const dayEmpty = /** @type {HTMLElement} */ (document.querySelector("#day-empty"));
const dayTable = /** @type {HTMLTableElement} */ (document.querySelector("#day-table"));
const dayRecords = /** @type {HTMLElement} */ (document.querySelector("#day-records"));

const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const shortMonth = new Intl.DateTimeFormat("en-US", { month: "long" });
const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

/** @param {string} month YYYY-MM */
function firstOfMonth(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1);
}

/** @param {string} month YYYY-MM @param {number} offset */
function shiftMonth(month, offset) {
  const date = firstOfMonth(month);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** @param {string} day YYYY-MM-DD */
function parseDay(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function readState() {
  const params = new URLSearchParams(location.search);
  const currentMonth = today().slice(0, 7);
  const requestedMonth = params.get("m") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentMonth;
  const requestedDay = params.get("d") ?? "";
  const daysInMonth = new Date(firstOfMonth(month).getFullYear(), firstOfMonth(month).getMonth() + 1, 0).getDate();
  const dayNumber = Number(requestedDay.slice(8));
  const day =
    requestedDay.startsWith(`${month}-`) && dayNumber >= 1 && dayNumber <= daysInMonth
      ? requestedDay
      : month === currentMonth
        ? today()
        : null;
  return { month, day, daysInMonth, currentMonth };
}

/** @param {string} month @param {string | null} day */
function stateUrl(month, day) {
  const params = new URLSearchParams();
  if (month !== today().slice(0, 7)) params.set("m", month);
  if (day) params.set("d", day);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/** @param {Array<{ type?: string, amountCents: number }>} records */
function totals(records) {
  let spent = 0;
  let credited = 0;
  for (const record of records) {
    if (record.type === "credit") credited += record.amountCents;
    else spent += record.amountCents;
  }
  return { spent, credited };
}

/** @param {{ scrollToDay?: boolean, focusDay?: boolean }} [options] */
async function render({ scrollToDay = false, focusDay = false } = {}) {
  const { month, day, daysInMonth, currentMonth } = readState();
  const [transactions, categoryNames] = await Promise.all([getTransactions(), getCategoryNames()]);
  const current = transactions.filter((transaction) => transaction.date.startsWith(`${month}-`));

  // Month heading, navigation and totals.
  const title = monthName.format(firstOfMonth(month));
  monthHeading.textContent = title;
  document.title = `${title} · Outgo`;
  previousLink.href = stateUrl(shiftMonth(month, -1), null);
  previousLink.textContent = `← ${shortMonth.format(firstOfMonth(shiftMonth(month, -1)))}`;
  const hasNext = month < currentMonth;
  nextLink.hidden = !hasNext;
  nextSeparator.hidden = !hasNext;
  nextLink.href = stateUrl(shiftMonth(month, 1), null);
  nextLink.textContent = `${shortMonth.format(firstOfMonth(shiftMonth(month, 1)))} →`;

  const monthTotals = totals(current);
  document.querySelector("#month-spent").textContent = money.format(monthTotals.spent / 100);
  document.querySelector("#month-credits").textContent = money.format(monthTotals.credited / 100);
  document.querySelector("#month-net").textContent = money.format(
    (monthTotals.spent - monthTotals.credited) / 100,
  );
  document.querySelector("#month-count").textContent = String(current.length);

  // One bar per day. Bar height is that day's spending; credits are a
  // separate mark, not subtracted, so a refund does not hide spending.
  const byDay = new Map();
  for (const transaction of current) {
    const records = byDay.get(transaction.date) ?? [];
    records.push(transaction);
    byDay.set(transaction.date, records);
  }
  const dailyTotals = [...Array(daysInMonth)].map((_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    return { date, ...totals(byDay.get(date) ?? []) };
  });
  const maxSpent = Math.max(1, ...dailyTotals.map((total) => total.spent));

  dayBars.replaceChildren();
  let selectedButton = null;
  for (const total of dailyTotals) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(total.date === day));
    const summary = [`${money.format(total.spent / 100)} spent`];
    if (total.credited) summary.push(`${money.format(total.credited / 100)} credited`);
    button.setAttribute("aria-label", `${dayName.format(parseDay(total.date))}: ${summary.join(", ")}`);
    button.title = button.getAttribute("aria-label");

    const bar = document.createElement("span");
    bar.className = "bar";
    bar.style.height = `${(total.spent / maxSpent) * 100}%`;
    const credit = document.createElement("span");
    credit.className = "credit";
    credit.hidden = total.credited === 0;
    const label = document.createElement("span");
    label.textContent = String(Number(total.date.slice(8)));
    if (total.date === today()) label.style.fontWeight = "700";

    button.append(bar, credit, label);
    button.addEventListener("click", () => {
      history.pushState(null, "", stateUrl(month, total.date));
      render({ focusDay: true });
    });
    dayBars.append(button);
    if (total.date === day) selectedButton = button;
  }

  // The row is rebuilt on every render, so return focus to the clicked day.
  if (focusDay) selectedButton?.focus({ preventScroll: true });

  // Scroll the row, not the page, so the selected day is in view.
  if (scrollToDay && selectedButton) {
    dayBars.scrollLeft =
      selectedButton.offsetLeft - dayBars.offsetLeft - (dayBars.clientWidth - selectedButton.offsetWidth) / 2;
  }

  // The selected day's transactions.
  const dayTransactions = day ? (byDay.get(day) ?? []) : [];
  dayTransactions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  dayHeading.textContent = day ? dayName.format(parseDay(day)) : "Choose a day";
  dayRecords.replaceChildren(
    ...dayTransactions.map((transaction) => transactionRow(transaction, categoryNames, { showDate: false })),
  );
  dayTable.hidden = dayTransactions.length === 0;
  dayEmpty.hidden = !day || dayTransactions.length > 0;

  // Spending by category for the month.
  const categories = new Map();
  for (const transaction of current.filter((record) => record.type !== "credit")) {
    const name = categoryNames.get(transaction.categoryId) ?? "—";
    categories.set(name, (categories.get(name) ?? 0) + transaction.amountCents);
  }
  const summary = document.querySelector("#category-summary");
  summary.replaceChildren();
  for (const [category, amount] of [...categories].sort((a, b) => b[1] - a[1])) {
    const row = document.createElement("tr");
    row.append(createCell(category), createCell(money.format(amount / 100)));
    summary.append(row);
  }
}

window.addEventListener("popstate", () => render({ scrollToDay: true }));

await render({ scrollToDay: true });
await setupSync({ afterSync: () => render() });
