import "../site.js";
import { deleteTransaction, getCategories, getTransaction, recordTransaction } from "../db.js";
import { today } from "../format.js";
import { setupSync } from "../sync.js";

const form = document.querySelector("#expense-form");
const dateInput = document.querySelector("#date");
const status = document.querySelector("#entry-status");
const heading = document.querySelector("#page-heading");
const submitButton = document.querySelector("#submit-button");
const deleteButton = document.querySelector("#delete-button");
const categoryInput = document.querySelector("#category-id");
const categoryButtons = document.querySelector("#category-buttons");

const editId = new URLSearchParams(location.search).get("id");
const editing = editId ? await getTransaction(editId) : null;

if (editId && !editing) {
  heading.textContent = "Transaction not found";
  form.hidden = true;
} else if (editing) {
  document.title = "Edit transaction · Outgo";
  heading.textContent = "Edit transaction";
  submitButton.textContent = "Save changes";
  deleteButton.hidden = false;
  form.elements.type.value = editing.type === "credit" ? "credit" : "expense";
  form.elements.amount.value = (editing.amountCents / 100).toFixed(2);
  form.elements.date.value = editing.date;
  categoryInput.value = editing.categoryId;
  form.elements.merchant.value = editing.merchant;
  form.elements.note.value = editing.note;
} else {
  dateInput.value = today();
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

  if (editing) {
    location.assign("/transactions/");
    return;
  }

  form.reset();
  dateInput.value = today();
  categoryInput.value = "";
  await renderCategories();
  status.textContent = "Transaction recorded locally.";
  document.querySelector("#amount").focus();
});

deleteButton.addEventListener("click", async () => {
  if (!editing || !confirm("Delete this transaction? This cannot be undone.")) return;
  await deleteTransaction(editing.id);
  location.assign("/transactions/");
});

await setupSync({ afterSync: renderCategories });
