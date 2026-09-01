// ============================================================
// 00-critical-fixes.js — Diagnóstico y contratos base LGMDM
// ============================================================
(function (global) {
  'use strict';
  const LG = global.LGMDM = global.LGMDM || {};
  const diagnostics = LG.diagnostics = LG.diagnostics || {};
  const errorLog = [];
  const MAX_ERROR_LOG = 50;

  diagnostics.setText = (element, text) => {
    if (!element) return false;
    element.textContent = String(text ?? '');
    return true;
  };
  diagnostics.log = {
    info: (...args) => console.info('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    debug: (...args) => console.debug('[DEBUG]', ...args),
  };
  diagnostics.errors = () => errorLog.slice();
  diagnostics.clearErrors = () => { errorLog.length = 0; };

  function recordError(entry) {
    errorLog.push(entry);
    if (errorLog.length > MAX_ERROR_LOG) errorLog.shift();
  }

  global.addEventListener('error', (event) => {
    recordError({
      type: 'error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      timestamp: new Date().toISOString(),
    });
  });

  global.addEventListener('unhandledrejection', (event) => {
    recordError({
      type: 'unhandledrejection',
      reason: event.reason?.stack || event.reason?.message || String(event.reason),
      timestamp: new Date().toISOString(),
    });
  });
})(window);
