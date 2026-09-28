// Remembers the last app page left in this tab, so the Add form's Cancel
// can tell whether going back stays inside the app. The site sends no
// Referer header, so document.referrer cannot answer that.
export const PREVIOUS_PAGE_KEY = "previous-page";
const previousPage = sessionStorage.getItem(PREVIOUS_PAGE_KEY);
addEventListener("pagehide", () => {
  sessionStorage.setItem(PREVIOUS_PAGE_KEY, location.pathname + location.search);
});

/**
 * Returns to the app page this one was opened from. Opened directly, with
 * no app page before it in this tab, it goes to the Overview instead.
 */
export function goBack() {
  if (previousPage !== null && history.length > 1) history.back();
  else location.assign("/");
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
