(function () {
  'use strict';

  // Safety shims and non-destructive auto-fixes to make the app more resilient
  // - Ensures window.LGMDM exists
  // - Provides basic LGMDM.storage wrapper (falls back to localStorage)
  // - Provides safe no-op LGMDM.ui.showToast and helpers used across modules
  // - Adds a small helper LGMDM.dom.requireById that returns element or logs
  // This file is intentionally conservative and should not alter app logic.

  window.LGMDM = window.LGMDM || {};

  // Storage shim: prefer existing LGMDM.storage, otherwise fallback to localStorage API
  if (!window.LGMDM.storage) {
    window.LGMDM.storage = (function () {
      function safeGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
      }
      function safeSet(key, value) {
        try { localStorage.setItem(String(key), String(value)); } catch (_) { /* ignore */ }
      }
      function safeRemove(key) {
        try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
      }
      return { get: safeGet, set: safeSet, remove: safeRemove };
    })();
  }

  // UI shim: provide minimal toast/status functions if absent so modules can call safely
  window.LGMDM.ui = window.LGMDM.ui || {};
  if (typeof window.LGMDM.ui.showToast !== 'function') {
    window.LGMDM.ui.showToast = function (message, type = 'info', duration = 4000) {
      try {
        // Create a lightweight toast only if not already present
        let container = document.getElementById('toast-container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'toast-container';
          container.setAttribute('aria-live', 'polite');
          container.style.position = 'fixed';
          container.style.right = '12px';
          container.style.top = '12px';
          container.style.zIndex = 99999;
          document.body.appendChild(container);
        }
        const item = document.createElement('div');
        item.className = 'lgmdm-toast';
        item.textContent = String(message || '');
        item.style.marginTop = '8px';
        item.style.padding = '8px 12px';
        item.style.borderRadius = '6px';
        item.style.background = (type === 'error') ? 'rgba(200,40,40,0.95)' : 'rgba(20,20,20,0.85)';
        item.style.color = '#fff';
        container.appendChild(item);
        setTimeout(() => { try { item.remove(); } catch (_) {} }, duration);
      } catch (_) { /* swallow errors */ }
  };
  }

  if (typeof window.LGMDM.ui.showStatus !== 'function') {
    window.LGMDM.ui.showStatus = function (idOrEl, message, type) {
      try {
        const el = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
        if (!el) return null;
        el.textContent = String(message || '');
        return el;
      } catch (_) { return null; }
    };
  }

  if (typeof window.LGMDM.ui.escapeHtml !== 'function') {
    window.LGMDM.ui.escapeHtml = function (s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };
  }

  // DOM helpers
  window.LGMDM.dom = window.LGMDM.dom || {};
  if (typeof window.LGMDM.dom.requireById !== 'function') {
    window.LGMDM.dom.requireById = function (id, context) {
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`LGMDM.dom.requireById: elemento "${id}" no encontrado` + (context ? ` (${context})` : ''));
      }
      return el;
    };
  }

  // Graceful global fallback for missing APIs used by multiple modules
  window.LGMDM.api = window.LGMDM.api || {};
  if (typeof window.LGMDM.api.apiFetch !== 'function') {
    window.LGMDM.api.apiFetch = function () {
      return Promise.reject(new Error('LGMDM.api.apiFetch no está implementado en este entorno'));
    };
  }

  // Expose a safe no-op applyMasteringState so undo/redo listeners won't crash
  if (typeof window.applyMasteringState !== 'function') {
    window.applyMasteringState = function () { /* noop until real implementation loads */ };
  }

  // Small lint-like checks (non-fix): detect obvious unterminated strings in inline scripts
  try {
    // no-op: placeholder for future static checks
  } catch (_) {}

  console.log('✅ LGMDM safety shims loaded');
})();
