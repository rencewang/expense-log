import "./js/pages/home.js";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
