import "../site.js";
import { recordTransaction } from "../db.js";
import { today } from "../format.js";

const form = document.querySelector("#expense-form");
const dateInput = document.querySelector("#date");
const status = document.querySelector("#entry-status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const amountCents = Math.round(Number(data.get("amount")) * 100);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return;

  await recordTransaction({
    id: crypto.randomUUID(),
    type: data.get("type") === "credit" ? "credit" : "expense",
    date: String(data.get("date")),
    amountCents,
    category: String(data.get("category")).trim().toLowerCase(),
    merchant: String(data.get("merchant")).trim(),
    note: String(data.get("note")).trim(),
    updatedAt: new Date().toISOString(),
  });

  form.reset();
  dateInput.value = today();
  status.textContent = "Transaction recorded locally.";
  document.querySelector("#amount").focus();
});

dateInput.value = today();
