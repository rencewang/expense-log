import { getMutations, replaceSnapshot, setSetting } from "./db.js";

export async function setupSync({ afterSync } = {}) {
  const syncButton = document.querySelector("#sync-button");
  const syncStatus = document.querySelector("#sync-status");

  if (!syncButton || !syncStatus) return;

  // Remove the app password stored by earlier versions.
  await setSetting("app-password", "");

  syncButton.addEventListener("click", async () => {
    syncButton.disabled = true;
    syncStatus.textContent = "Syncing…";

    try {
      const mutations = await getMutations();
      // Vercel Authentication handles access. An expired session answers
      // with a redirect to Vercel's sign-in page instead of the API.
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutations }),
        redirect: "manual",
      });

      if (response.type === "opaqueredirect") {
        throw new Error("Your Vercel session expired. Reload the page to sign in again.");
      }
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error ?? `Sync failed (${response.status})`);
      }

      const result = await response.json();
      await replaceSnapshot(
        result.transactions,
        mutations.map((mutation) => mutation.id),
      );
      await afterSync?.();
      syncStatus.textContent = `Synced ${result.accepted} local change(s) at ${new Date().toLocaleTimeString()}.`;
    } catch (error) {
      syncStatus.textContent = error instanceof Error ? error.message : "Sync failed.";
    } finally {
      syncButton.disabled = false;
    }
  });
}
