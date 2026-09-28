// Remembers the last app page left in this tab, so the Add form's Cancel
// can tell whether going back stays inside the app. The site sends no
// Referer header, so document.referrer cannot answer that.
export const PREVIOUS_PAGE_KEY = "previous-page";
const previousPage = sessionStorage.getItem(PREVIOUS_PAGE_KEY);
addEventListener("pagehide", () => {
  sessionStorage.setItem(PREVIOUS_PAGE_KEY, location.pathname + location.search);
});

/** True when the page before this one in this tab was an app page. */
export function cameFromApp() {
  return previousPage !== null;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
