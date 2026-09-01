// ============================================================
// 00-logging-filter.js — Filtrar console.log en producción
// ============================================================

(function() {
  "use strict";

  const isDev = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname.includes('dev');

  if (!isDev) {
    // En producción, reemplazar console.log con noop
    const noop = () => {};
    window.console.log = noop;
    console.warn('⚠️ console.log desactivado en producción');
  }
})();
