// ============================================================
// 00-async-safety.js — Manejo seguro de async/await y Promises
// ============================================================

(function(window) {
  "use strict";

  // Objeto global donde se cuelgan todas las utilidades async
  const asyncApi = window.asyncApi = window.asyncApi || {};

  // Wrapper seguro para async operations
  asyncApi.wrap = async function(fn, onError = null) {
    try {
      return await fn();
    } catch (error) {
      console.error('[Async Error]', error);
      if (onError) {
        onError(error);
      }
      return null;
    }
  };

  // Timeout para promesas (evita promises que nunca resuelven)
  asyncApi.withTimeout = function(promise, timeoutMs = 30000) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Promise timeout')), timeoutMs)
      )
    ]);
  };

  // Retry logic para operaciones que pueden fallar
  asyncApi.retry = async function(fn, maxAttempts = 3, delayMs = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt}/${maxAttempts} failed:`, error.message);

        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }

    throw lastError;
  };

  // Ejecutar múltiples promesas con límite de concurrencia
  asyncApi.queue = async function(fns, concurrency = 3) {
    const results = [];
    const queue = [...fns];
    const running = [];

    while (queue.length > 0 || running.length > 0) {
      while (running.length < concurrency && queue.length > 0) {
        const fn = queue.shift();
        const promise = Promise.resolve()
          .then(() => fn())
          .then(result => {
            running.splice(running.indexOf(promise), 1);
            results.push(result);
          })
          .catch(error => {
            running.splice(running.indexOf(promise), 1);
            console.error('[Queue Error]', error);
            results.push({ error: error.message });
          });

        running.push(promise);
      }

      if (running.length > 0) {
        await Promise.race(running);
      }
    }

    return results;
  };

  // Safe fetch wrapper
  asyncApi.fetchJSON = async function(url, options = {}) {
    const { timeout = 30000, ...requestOptions } = options || {};
    try {
      const response = await window.LGMDM.api.apiFetch(url, {
        ...requestOptions,
        timeout,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`[Fetch Error] ${url}:`, error.message);
      throw error;
    }
  };

  // Debounce async function
  asyncApi.debounce = function(fn, delayMs = 300) {
    let timeoutId;
    let isRunning = false;

    return async function(...args) {
      clearTimeout(timeoutId);

      if (isRunning) return;

      timeoutId = setTimeout(async () => {
        isRunning = true;
        try {
          await fn(...args);
        } finally {
          isRunning = false;
        }
      }, delayMs);
    };
  };

  // Throttle async function
  asyncApi.throttle = function(fn, delayMs = 300) {
    let lastCall = 0;
    let isRunning = false;

    return async function(...args) {
      const now = Date.now();

      if (now - lastCall < delayMs || isRunning) {
        return;
      }

      lastCall = now;
      isRunning = true;

      try {
        await fn(...args);
      } finally {
        isRunning = false;
      }
    };
  };

  console.log("✅ Async Safety cargado");
})(window);
