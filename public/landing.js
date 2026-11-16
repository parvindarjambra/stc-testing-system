/* STC Testing System — landing page: server health line only. No portal logic here. */
'use strict';
document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/health')
    .then((r) => r.json())
    .then((h) => {
      document.getElementById('health-status').textContent =
        'Server: online — database: ' + (h.db || 'unknown') + ', version ' + (h.version || '');
    })
    .catch(() => {
      document.getElementById('health-status').textContent =
        'Server: unreachable — please check that START.bat is running on the Admin PC.';
    });
});
