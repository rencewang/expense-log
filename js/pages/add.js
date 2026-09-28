import { cameFromApp } from "../site.js";
import { deleteTransaction, getCategories, getTransaction, recordTransaction } from "../db.js";
import { today } from "../format.js";
import { setupSync } from "../sync.js";

const form = /** @type {HTMLFormElement} */ (document.querySelector("#transaction-form"));
const dateInput = /** @type {HTMLInputElement} */ (document.querySelector("#date"));
const status = /** @type {HTMLElement} */ (document.querySelector("#entry-status"));
const heading = /** @type {HTMLElement} */ (document.querySelector("#page-heading"));
const submitButton = /** @type {HTMLButtonElement} */ (document.querySelector("#submit-button"));
const deleteButton = /** @type {HTMLButtonElement} */ (document.querySelector("#delete-button"));
const cancelButton = /** @type {HTMLButtonElement} */ (document.querySelector("#cancel-button"));
const categoryInput = /** @type {HTMLInputElement} */ (document.querySelector("#category-id"));
const categoryButtons = /** @type {HTMLElement} */ (document.querySelector("#category-buttons"));

/** Named form control; radio groups come back as a RadioNodeList. */
const field = (/** @type {string} */ name) =>
  /** @type {HTMLInputElement | RadioNodeList} */ (form.elements.namedItem(name));

const params = new URLSearchParams(location.search);
const editId = params.get("id");
// ?date=YYYY-MM-DD prefills the date, as the Overview's Add button does.
// It stays after each save, so several entries for one day go quickly.
const requestedDate = params.get("date") ?? "";
const startDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today();
const editing = editId ? await getTransaction(editId) : null;

if (editId && !editing) {
  heading.textContent = "Transaction not found";
  form.hidden = true;
} else if (editing) {
  document.title = "Edit transaction · Outgo";
  heading.textContent = "Edit transaction";
  submitButton.textContent = "Save changes";
  deleteButton.hidden = false;
  field("type").value = editing.type === "credit" ? "credit" : "expense";
  field("amount").value = (editing.amountCents / 100).toFixed(2);
  field("date").value = editing.date;
  categoryInput.value = editing.categoryId;
  field("merchant").value = editing.merchant;
  field("note").value = editing.note;
} else {
  dateInput.value = startDate;
}

// Active categories, plus the edited transaction's category if archived.
async function renderCategories() {
  const categories = (await getCategories()).filter(
    (category) => !category.archived || category.id === categoryInput.value,
  );
  categoryButtons.replaceChildren();
  if (categories.length === 0) {
    categoryButtons.textContent = "No categories yet.";
    return;
  }
  for (const category of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category.archived ? `${category.name} (archived)` : category.name;
    button.setAttribute("aria-pressed", String(category.id === categoryInput.value));
    button.addEventListener("click", () => {
      categoryInput.value = category.id;
      for (const other of categoryButtons.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other === button));
      }
      status.textContent = "";
    });
    categoryButtons.append(button, " ");
  }
}

await renderCategories();

const { requestSync } = await setupSync({ afterSync: renderCategories });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const amountCents = Math.round(Number(data.get("amount")) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return;
  if (!categoryInput.value) {
    status.textContent = "Choose a category.";
    categoryButtons.querySelector("button")?.focus();
    return;
  }

  await recordTransaction({
    id: editing?.id ?? crypto.randomUUID(),
    type: data.get("type") === "credit" ? "credit" : "expense",
    date: String(data.get("date")),
    amountCents,
    categoryId: categoryInput.value,
    merchant: String(data.get("merchant")).trim(),
    note: String(data.get("note")).trim(),
    updatedAt: new Date().toISOString(),
  });

  // Edits return to the Ledger, which syncs pending changes on load.
  if (editing) {
    location.assign("/ledger/");
    return;
  }

  form.reset();
  dateInput.value = startDate;
  categoryInput.value = "";
  await renderCategories();
  status.textContent = "Transaction recorded.";
  /** @type {HTMLInputElement} */ (form.elements.namedItem("amount")).focus();
  requestSync();
});

// Cancel returns to the page that opened the form, saving nothing. Opened
// directly, with no app page before it in this tab, it goes to the Overview.
cancelButton.addEventListener("click", () => {
  if (cameFromApp() && history.length > 1) history.back();
  else location.assign("/");
});

deleteButton.addEventListener("click", async () => {
  if (!editing || !confirm("Delete this transaction? This cannot be undone.")) return;
  await deleteTransaction(editing.id);
  location.assign("/ledger/");
});
