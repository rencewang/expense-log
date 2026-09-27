import "../site.js";
import { getCategories, recordCategories } from "../db.js";
import { setupSync } from "../sync.js";

const newForm = /** @type {HTMLFormElement} */ (document.querySelector("#new-category"));
const status = /** @type {HTMLElement} */ (document.querySelector("#category-status"));
const activeList = /** @type {HTMLElement} */ (document.querySelector("#active-categories"));
const archivedList = /** @type {HTMLElement} */ (document.querySelector("#archived-categories"));
const archivedSection = /** @type {HTMLElement} */ (document.querySelector("#archived-section"));
const emptyState = /** @type {HTMLElement} */ (document.querySelector("#empty-state"));

function stamp(category, changes) {
  return { ...category, ...changes, updatedAt: new Date().toISOString() };
}

function nameTaken(categories, name, exceptId) {
  const wanted = name.toLowerCase();
  return categories.some(
    (category) => category.id !== exceptId && category.name.toLowerCase() === wanted,
  );
}

function button(label, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

async function save(records, message) {
  await recordCategories(records);
  status.textContent = message;
  await render();
}

async function render() {
  const categories = await getCategories();
  const active = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);

  activeList.replaceChildren();
  for (const category of active) {
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.name = "name";
    input.value = category.name;
    input.required = true;
    input.autocomplete = "off";
    input.setAttribute("aria-label", `Name of ${category.name}`);
    const rename = document.createElement("button");
    rename.type = "submit";
    rename.textContent = "Rename";
    form.append(
      input, " ", rename, " ",
      button("Archive", () =>
        save([stamp(category, { archived: true })], `Archived ${category.name}.`),
      ),
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name || name === category.name) return;
      if (nameTaken(categories, name, category.id)) {
        status.textContent = `A category named ${name} already exists.`;
        return;
      }
      await save([stamp(category, { name })], `Renamed ${category.name} to ${name}.`);
    });
    const item = document.createElement("li");
    item.append(form);
    activeList.append(item);
  }

  archivedList.replaceChildren();
  for (const category of archived) {
    const item = document.createElement("li");
    item.append(
      `${category.name} `,
      button("Restore", () =>
        save(
          [stamp(category, { archived: false })],
          `Restored ${category.name}.`,
        ),
      ),
    );
    archivedList.append(item);
  }

  emptyState.hidden = active.length > 0;
  activeList.hidden = active.length === 0;
  archivedSection.hidden = archived.length === 0;
}

newForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = String(new FormData(newForm).get("name")).trim();
  if (!name) return;
  const categories = await getCategories();
  if (nameTaken(categories, name)) {
    status.textContent = `A category named ${name} already exists.`;
    return;
  }
  await save(
    [{ id: crypto.randomUUID(), name, archived: false, updatedAt: new Date().toISOString() }],
    `Added ${name}.`,
  );
  newForm.reset();
});

await render();
await setupSync({ afterSync: render });
