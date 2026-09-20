import {
  getMutations,
  getSetting,
  replaceSnapshot,
  setSetting,
} from "./db.js";

export async function setupSync({ afterSync } = {}) {
  const passwordInput = document.querySelector("#app-password");
  const rememberInput = document.querySelector("#remember-password");
  const syncButton = document.querySelector("#sync-button");
  const syncStatus = document.querySelector("#sync-status");

  if (!passwordInput || !rememberInput || !syncButton || !syncStatus) return;

  passwordInput.value = await getSetting("app-password");

  syncButton.addEventListener("click", async () => {
    const password = passwordInput.value;
    if (!password) {
      syncStatus.textContent = "Enter the app password first.";
      return;
    }

    syncButton.disabled = true;
    syncStatus.textContent = "Syncing…";

    try {
      await setSetting("app-password", rememberInput.checked ? password : "");
      const mutations = await getMutations();
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          authorization: `Bearer ${password}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ mutations }),
      });

      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error ?? `Sync failed (${response.status})`);
      }

      const result = await response.json();
      await replaceSnapshot(result.transactions);
      await afterSync?.();
      syncStatus.textContent = `Synced ${result.accepted} local change(s) at ${new Date().toLocaleTimeString()}.`;
    } catch (error) {
      syncStatus.textContent = error instanceof Error ? error.message : "Sync failed.";
    } finally {
      syncButton.disabled = false;
    }
  });
}
