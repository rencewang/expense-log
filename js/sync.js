import { getMutations, getSetting, replaceSnapshot, setSetting } from "./db.js";

// Background syncs with no local changes run at most once per interval,
// shared across pages and tabs. Pending local changes always sync.
const BACKGROUND_INTERVAL_MS = 60_000;
const LAST_SYNC_KEY = "last-sync-at";
const LOCK_NAME = "expense-log-sync";

let inFlight = null;

class SessionExpiredError extends Error {}

async function pushAndPull() {
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
    throw new SessionExpiredError("Your Vercel session expired. Reload the page to sign in again.");
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.error ?? `Sync failed (${response.status})`);
  }

  const result = await response.json();
  await replaceSnapshot(result, mutations.map((mutation) => mutation.id));
  await setSetting(LAST_SYNC_KEY, new Date().toISOString());
  return result;
}

// Returns the sync result, or null when another tab is already syncing.
function runExclusive() {
  if (!navigator.locks) return pushAndPull();
  return navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) =>
    lock ? pushAndPull() : null,
  );
}

// Coalesces overlapping calls within this page into one request.
function sync() {
  inFlight ??= runExclusive().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function backgroundSyncDue() {
  if (!navigator.onLine) return false;
  if ((await getMutations()).length > 0) return true;
  const lastSyncAt = Date.parse(await getSetting(LAST_SYNC_KEY));
  return !(Date.now() - lastSyncAt < BACKGROUND_INTERVAL_MS);
}

// Wires the triggers and returns requestSync(), which a page calls after a
// local change. It is a background sync, so it respects the session and
// offline checks, but pending changes mean it always runs.
export async function setupSync({ afterSync } = {}) {
  const syncButton = document.querySelector("#sync-button");
  const syncStatus = document.querySelector("#sync-status");
  let sessionExpired = false;

  const showStatus = (text) => {
    if (syncStatus) syncStatus.textContent = text;
  };

  async function run({ background }) {
    if (background && (sessionExpired || !(await backgroundSyncDue()))) return;
    if (syncButton) syncButton.disabled = true;
    showStatus("Syncing…");

    try {
      const result = await sync();
      if (result) {
        await afterSync?.();
        showStatus(`Synced ${result.accepted} local change(s) at ${new Date().toLocaleTimeString()}.`);
      } else {
        showStatus("Another tab is syncing.");
      }
    } catch (error) {
      // Stop retrying in the background until the page is reloaded.
      if (error instanceof SessionExpiredError) sessionExpired = true;
      showStatus(error instanceof Error ? error.message : "Sync failed.");
    } finally {
      if (syncButton) syncButton.disabled = false;
    }
  }

  syncButton?.addEventListener("click", () => run({ background: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run({ background: true });
  });
  window.addEventListener("online", () => run({ background: true }));

  // Pages render from IndexedDB first; this never blocks that.
  run({ background: true });

  return { requestSync: () => run({ background: true }) };
}
