// ============================================================
// 00-error-wrapper.js — Hook de errores al backend
//
// Q19 (audit): antes este archivo registraba listeners de
// `error` y `unhandledrejection` para solo loguearlos a
// `console.error`. Pero `00-observability.js` ya registra los
// MISMOS eventos y los manda a Sentry / observability. Resultado:
// cada error se procesaba dos veces (una por módulo) y este
// archivo solo producía logs duplicados, sin enviar nada.
//
// QUEDA:
//   - Un único punto de captura: 00-observability.js (loadear
//     después de este archivo para que el orden sea claro).
//   - Este archivo expone `LGMDM.errorReport` para que módulos
//     que quieran mandar un error custom al backend (no solo
//     capturar uncaught) lo hagan. Si no hay endpoint
//     configurado, cae a console.error como antes.
// ============================================================

(function () {
  'use strict';

  const LG = window.LGMDM = window.LGMDM || {};

  function endpoint() {
    const node = document.querySelector('meta[name="lgmdm-observability-endpoint"]');
    return node?.content?.trim() || '';
  }

  /**
   * Reporta un error custom al backend (si hay endpoint
   * configurado via <meta name="lgmdm-observability-endpoint">).
   * Si no hay, solo loguea a console.error.
   */
  function errorReport(error, context = {}) {
    const err = error instanceof Error ? error : new Error(String(error));
    const payload = {
      message: err.message,
      stack: err.stack,
      ...context,
      at: new Date().toISOString(),
      path: location.pathname,
    };
    const url = endpoint();
    if (url && typeof LG.api?.apiFetch === 'function') {
      LG.api.apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: payload }),
      }).catch(() => { /* noop — observability es best-effort */ });
    } else {
      console.error('[ErrorReport]', err, context);
    }
  }

  LG.errorReport = errorReport;
  console.log('✅ Error wrapper cargado (sin duplicar listeners)');
})();
