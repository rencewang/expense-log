import "../site.js";
import { getCategoryNames, getTransactions } from "../db.js";
import { localDate, money, today, transactionRow } from "../format.js";
import { setupSync } from "../sync.js";

// The month view. The URL holds the state, so reloads and the back button
// keep it:
//   ?m=YYYY-MM    the month (default: this month)
//   &d=YYYY-MM-DD the selected day (default: today when viewing this month)
//   &v=day|month  which transactions are listed below the bars: the selected
//                 day's, or the whole month's grouped by category (default:
//                 day when a day is selected, otherwise month)

const monthHeading = /** @type {HTMLElement} */ (document.querySelector("#month-heading"));
const previousLink = /** @type {HTMLAnchorElement} */ (document.querySelector("#previous-month"));
const nextLink = /** @type {HTMLAnchorElement} */ (document.querySelector("#next-month"));
const nextSeparator = /** @type {HTMLElement} */ (document.querySelector("#next-month-separator"));
const dayBars = /** @type {HTMLElement} */ (document.querySelector("#day-bars"));
const monthTab = /** @type {HTMLButtonElement} */ (document.querySelector("#month-tab"));
const dayTab = /** @type {HTMLButtonElement} */ (document.querySelector("#day-tab"));
const monthPanel = /** @type {HTMLElement} */ (document.querySelector("#month-panel"));
const dayPanel = /** @type {HTMLElement} */ (document.querySelector("#day-panel"));
const previousDay = /** @type {HTMLButtonElement} */ (document.querySelector("#previous-day"));
const nextDay = /** @type {HTMLButtonElement} */ (document.querySelector("#next-day"));
const addDate = /** @type {HTMLInputElement} */ (document.querySelector("#add-date"));
const monthEmpty = /** @type {HTMLElement} */ (document.querySelector("#month-empty"));
const monthCategories = /** @type {HTMLElement} */ (document.querySelector("#month-categories"));
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

/** @param {string} day YYYY-MM-DD @param {number} offset */
function shiftDay(day, offset) {
  const date = parseDay(day);
  date.setDate(date.getDate() + offset);
  return localDate(date);
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
  let day =
    requestedDay.startsWith(`${month}-`) && dayNumber >= 1 && dayNumber <= daysInMonth
      ? requestedDay
      : month === currentMonth
        ? today()
        : null;
  const requestedView = params.get("v");
  const view =
    requestedView === "day" || requestedView === "month" ? requestedView : day ? "day" : "month";
  // The day list needs a day; in a past month, start at its first.
  if (view === "day" && !day) day = `${month}-01`;
  return { month, day, view, daysInMonth, currentMonth };
}

/** @param {{ month: string, day?: string | null, view?: string }} state */
function stateUrl({ month, day = null, view }) {
  const params = new URLSearchParams();
  if (month !== today().slice(0, 7)) params.set("m", month);
  if (day) params.set("d", day);
  // Only write the view when it differs from what readState() would pick.
  const defaultView = day || month === today().slice(0, 7) ? "day" : "month";
  if (view && view !== defaultView) params.set("v", view);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/** @param {{ month: string, day?: string | null, view?: string }} state */
function go(state, options = {}) {
  history.pushState(null, "", stateUrl(state));
  render(options);
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
  const { month, day, view, daysInMonth, currentMonth } = readState();
  const [transactions, categoryNames] = await Promise.all([getTransactions(), getCategoryNames()]);
  const current = transactions.filter((transaction) => transaction.date.startsWith(`${month}-`));

  // Month heading, navigation and totals.
  const title = monthName.format(firstOfMonth(month));
  monthHeading.textContent = title;
  document.title = `${title} · Outgo`;
  previousLink.href = stateUrl({ month: shiftMonth(month, -1) });
  previousLink.textContent = `← ${shortMonth.format(firstOfMonth(shiftMonth(month, -1)))}`;
  const hasNext = month < currentMonth;
  nextLink.hidden = !hasNext;
  nextSeparator.hidden = !hasNext;
  nextLink.href = stateUrl({ month: shiftMonth(month, 1) });
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
    button.addEventListener("click", () =>
      go({ month, day: total.date, view: "day" }, { focusDay: true }),
    );
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

  // Tabs: the selected day's transactions, or the month's by category.
  monthTab.setAttribute("aria-pressed", String(view === "month"));
  dayTab.setAttribute("aria-pressed", String(view === "day"));
  monthPanel.hidden = view !== "month";
  dayPanel.hidden = view !== "day";
  monthTab.onclick = () => go({ month, day, view: "month" });
  dayTab.onclick = () => go({ month, day: day ?? `${month}-01`, view: "day" });

  if (view === "day" && day) {
    dayHeading.textContent = dayName.format(parseDay(day));
    addDate.value = day;
    // Days cross into neighbouring months; there is nothing after today.
    previousDay.onclick = () => {
      const target = shiftDay(day, -1);
      go({ month: target.slice(0, 7), day: target, view: "day" }, { scrollToDay: true });
    };
    nextDay.disabled = day >= today();
    nextDay.onclick = () => {
      const target = shiftDay(day, 1);
      go({ month: target.slice(0, 7), day: target, view: "day" }, { scrollToDay: true });
    };

    const dayTransactions = byDay.get(day) ?? [];
    dayTransactions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    dayRecords.replaceChildren(
      ...dayTransactions.map((transaction) =>
        transactionRow(transaction, categoryNames, { showDate: false }),
      ),
    );
    dayTable.hidden = dayTransactions.length === 0;
    dayEmpty.hidden = dayTransactions.length > 0;
  }

  if (view === "month") renderMonthCategories(current, categoryNames);
}

// One collapsible group per category: the summary line carries the totals,
// and opening it lists that category's transactions. Open groups stay open
// across re-renders, such as after a background sync.
function renderMonthCategories(current, categoryNames) {
  const open = new Set(
    [...monthCategories.querySelectorAll("details[open]")].map(
      (details) => /** @type {HTMLElement} */ (details).dataset.categoryId,
    ),
  );
  const groups = new Map();
  for (const transaction of current) {
    const records = groups.get(transaction.categoryId) ?? [];
    records.push(transaction);
    groups.set(transaction.categoryId, records);
  }
  const ordered = [...groups]
    .map(([categoryId, records]) => ({
      categoryId,
      name: categoryNames.get(categoryId) ?? "—",
      records: records.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)),
      ...totals(records),
    }))
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));

  monthCategories.replaceChildren();
  for (const group of ordered) {
    const details = document.createElement("details");
    details.dataset.categoryId = group.categoryId;
    details.open = open.has(group.categoryId);
    const summary = document.createElement("summary");
    const parts = [`${group.name} · ${money.format(group.spent / 100)} spent`];
    if (group.credited) parts.push(`${money.format(group.credited / 100)} credited`);
    summary.textContent = parts.join(" · ");

    const table = document.createElement("table");
    const head = document.createElement("thead");
    head.innerHTML = "<tr><th>Date</th><th>Merchant</th><th>Debit</th><th>Credit</th><th></th></tr>";
    const body = document.createElement("tbody");
    body.append(
      ...group.records.map((transaction) =>
        transactionRow(transaction, categoryNames, { showCategory: false }),
      ),
    );
    table.append(head, body);
    details.append(summary, table);
    monthCategories.append(details);
  }
  monthEmpty.hidden = ordered.length > 0;
}
window.addEventListener("popstate", () => render({ scrollToDay: true }));

await render({ scrollToDay: true });
await setupSync({ afterSync: () => render() });
