// Initialisation script — loaded as plain <script> (not module) so it runs
// before app.js and has access to window globals set by CI (APP_VERSION).
// CI replaces __APP_VERSION__ in this file via sed during the deploy step.

window.APP_VERSION = '__APP_VERSION__';
// Local fallback: placeholder is only replaced by GitHub Actions.
// During local testing it stays as 'dev-local'.
if (window.APP_VERSION === '__APP_' + 'VERSION__') {
  window.APP_VERSION = 'dev-local';
}

function buildBugReportUrl() {
  const repoUrl = 'https://github.com/Bluematrix2/XACML-Policy-Atlas';
  const version = window.APP_VERSION || 'unbekannt';
  const body = encodeURIComponent(
`**Version:** ${version}

**Browser:** ${navigator.userAgent}

**Beschreibung des Fehlers:**
<!-- Was ist passiert? -->

**Schritte zur Reproduktion:**
1.
2.

**Erwartetes Verhalten:**

**Tatsächliches Verhalten:**
`);
  const title = encodeURIComponent('[Bug] ');
  return `${repoUrl}/issues/new?title=${title}&body=${body}&labels=bug`;
}

document.addEventListener('DOMContentLoaded', () => {
  // Footer: app version
  const versionEl = document.getElementById('appVersion');
  if (versionEl) versionEl.textContent = window.APP_VERSION;

  // Footer: current year
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Footer: bug report link
  const bugLink = document.getElementById('bugReportLink');
  if (bugLink) bugLink.href = buildBugReportUrl();

  if (window.App && window.App.restoreMappingsOnStartup) {
    window.App.restoreMappingsOnStartup();
  }
});
