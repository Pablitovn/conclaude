// filepath: js/00-observability.js
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  const metrics = Object.create(null);
  const observers = [];
  let initialized = false;
  let sentry = null;
  let sentryDsn = '';

  function endpoint() {
    const node = document.querySelector('meta[name="lgmdm-observability-endpoint"]');
    return node?.content?.trim() || '';
  }

  function record(name, value, extra = {}) {
    metrics[name] = { value, at: Date.now(), ...extra };
    window.dispatchEvent(new CustomEvent('lgmdm:metric', { detail: metrics[name] }));
  }

  function reportToBackend(name, value, extra = {}) {
    const url = endpoint();
    if (!url || typeof LGMDM.api?.apiFetch !== 'function') return;
    LGMDM.api.apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: name, value, ...extra, path: location.pathname }),
    }).catch(() => {});
  }

  function captureError(error, context = {}) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (global.Sentry && typeof global.Sentry.captureException === 'function') {
      try { global.Sentry.captureException(err, { extra: context }); } catch (_) {}
    }
    if (sentry && typeof sentry.captureException === 'function') {
      try { sentry.captureException(err, context); } catch (_) {}
    }
  }

  function observePerformance() {
    if (!('PerformanceObserver' in global)) return;
    try {
      const paint = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') { record('FCP', entry.startTime); reportToBackend('FCP', entry.startTime); }
        }
      });
      paint.observe({ type: 'paint', buffered: true }); observers.push(paint);
    } catch (_) {}

    try {
      const lcp = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) { record('LCP', last.startTime); reportToBackend('LCP', last.startTime); }
      });
      lcp.observe({ type: 'largest-contentful-paint', buffered: true }); observers.push(lcp);
    } catch (_) {}

    try {
      let cls = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) cls += entry.value;
        }
        record('CLS', cls);
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true }); observers.push(clsObserver);
    } catch (_) {}

    try {
      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) {
            record('INP.last', entry.duration, { interactionId: entry.interactionId });
          }
        }
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 }); observers.push(inpObserver);
    } catch (_) {}
  }

  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (nav && Number.isFinite(nav.responseStart)) {
      record('TTFB', nav.responseStart - nav.requestStart);
    }
  } catch (_) {}

  function init(config = {}) {
    if (initialized) return;
    initialized = true;
    sentry = config.sentry || global.Sentry || null;
    const dsnNode = document.querySelector('meta[name="lgmdm-sentry-dsn"]');
    sentryDsn = dsnNode?.content?.trim() || '';
    if (sentry && sentryDsn && typeof sentry.init === 'function') {
      try { sentry.init({ dsn: sentryDsn, environment: location.hostname || 'frontend' }); } catch (_) {}
    }
    observePerformance();
    global.addEventListener('error', (event) => captureError(event.error || new Error(event.message), { source: event.filename, line: event.lineno }), { once: false });
    global.addEventListener('unhandledrejection', (event) => captureError(event.reason || new Error('Unhandled rejection')), { once: false });
  }

  LGMDM.observability = { init, record, captureError, metrics: () => ({ ...metrics }), sentryDsn: () => sentryDsn };
  init();
})(window);
