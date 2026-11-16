/**
 * Opens the spacedesk Android app from the deck with one tap (Chrome intent URL).
 * If the app is missing, Chrome follows the fallback to its Play Store page.
 */
const PACKAGE = "ph.spacedesk.beta";
const STORE = `https://play.google.com/store/apps/details?id=${PACKAGE}`;

export function openSpacedesk() {
  const android = /Android/i.test(navigator.userAgent);
  if (!android) {
    window.open(STORE, "_blank");
    return;
  }
  location.href =
    `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;` +
    `package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(STORE)};end`;
}
