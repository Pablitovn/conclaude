// ============================================================
// 16-error-handling.js — Error handling, validación y feedback mejorado
// ============================================================

(function () {
  "use strict";

  // ── Toast/Notification System ──
  const TOAST_TYPES = {
    success: { icon: '✓', color: 'var(--vu-green)' },
    error: { icon: '✕', color: 'var(--clip-red)' },
    warning: { icon: '⚠', color: 'var(--vu-yellow)' },
    info: { icon: 'ℹ', color: 'var(--cyan)' },
    loading: { icon: '⏳', color: 'var(--amber)' },
  };

  const escapeHtml = window.LGMDM?.ui?.escapeHtml;
  if (typeof escapeHtml !== 'function') throw new Error('LGMDM.ui.escapeHtml debe estar disponible antes de 16-error-handling.js');

  function createToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.setAttribute('role', 'region');
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-label', 'Notificaciones');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  const LGMDM = window.LGMDM = window.LGMDM || {};
  LGMDM.errors = LGMDM.errors || {};

  function normalizeError(err, fallback = 'Ocurrió un error inesperado.') {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    const message = err.message || err.detail;
    return message ? String(message) : fallback;
  }

  function classifyError(err) {
    const status = Number(err?.status || err?.response?.status || 0);
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timeout';
    if (status === 401 || status === 403) return 'auth';
    if (status >= 400 && status < 500) return 'validation';
    if (status >= 500) return 'backend';
    if (err instanceof TypeError && /fetch|network|failed/i.test(String(err.message))) return 'network';
    return 'unknown';
  }

  function userMessage(err, fallback = 'Ocurrió un error inesperado.') {
    const kind = classifyError(err);
    if (kind === 'timeout') return 'La operación tardó demasiado. Intentá nuevamente.';
    if (kind === 'network') return 'No se pudo conectar con LGMDM. Verificá la conexión y el servidor.';
    if (kind === 'auth') return 'La sesión ya no es válida. Iniciá sesión nuevamente.';
    if (kind === 'validation') return normalizeError(err, 'Los datos enviados no son válidos.');
    if (kind === 'backend') return 'El servidor no pudo completar la operación. Intentá nuevamente.';
    return normalizeError(err, fallback);
  }

  function handleError(err, fallback = 'Ocurrió un error inesperado.', options = {}) {
    const message = userMessage(err, fallback);
    if (options.log !== false) console.error(options.context || 'LGMDM error:', err);
    if (options.notify !== false) LGMDM.ui.showToast(message, options.type || 'error', options.duration ?? 4500);
    return message;
  }

  function setText(idOrEl, value) {
    const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
    if (el) el.textContent = value == null ? '' : String(value);
    return el;
  }

  LGMDM.ui.showToast = function(message, type = 'info', duration = 4000) {
    const container = createToastContainer();
    const toast = document.createElement('lgmdm-toast');
    toast.setAttribute('type', type);
    toast.setAttribute('message', String(message));
    container.appendChild(toast);
    toast.scheduleRemove?.(duration);
    window.LGMDM?.a11y?.announce?.(message, type === 'error' ? 'assertive' : 'polite');
    return toast;
  };

  LGMDM.errors.handle = handleError;
  LGMDM.errors.normalize = normalizeError;
  LGMDM.errors.classify = classifyError;
  LGMDM.errors.userMessage = userMessage;
  LGMDM.errors.validateInput = validateInput;
  LGMDM.errors.fetchWithRetry = fetchWithRetry;
  LGMDM.errors.showProgress = showProgress;

  LGMDM.html = LGMDM.html || {};
  LGMDM.html.escape = escapeHtml;
  LGMDM.html.setText = setText;
  
  // ── Input Validation ──
  const VALIDATORS = {
    required: (value, label) => {
      if (!value || (typeof value === 'string' && !value.trim())) {
        return `${label} es requerido`;
      }
      return null;
    },
    minValue: (min) => (value, label) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < min) {
        return `${label} debe ser mayor a ${min}`;
      }
      return null;
    },
    maxValue: (max) => (value, label) => {
      const num = parseFloat(value);
      if (isNaN(num) || num > max) {
        return `${label} debe ser menor a ${max}`;
      }
      return null;
    },
    email: (value, label) => {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(value)) {
        return `${label} debe ser un email válido`;
      }
      return null;
    },
    fileSize: (maxMB) => (file, label) => {
      if (!file) return null;
      const maxBytes = maxMB * 1024 * 1024;
      if (file.size > maxBytes) {
        return `${label} no debe superar ${maxMB} MB (tamaño actual: ${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      }
      return null;
    },
    audioFormat: (file, label) => {
      const allowed = ['.wav', '.mp3', '.flac', '.ogg', '.aiff', '.aif'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!allowed.includes(ext)) {
        return `${label} debe ser: ${allowed.join(', ')}`;
      }
      return null;
    },
  };

  function validateInput(value, label, validators = []) {
    for (const validator of validators) {
      const error = validator(value, label);
      if (error) {
        return { valid: false, error };
      }
    }
    return { valid: true };
  };

  function validateInputElement(element, validators = []) {
    const label = element.getAttribute('aria-label') || element.id || 'Input';
    const value = element.type === 'file' ? element.files[0] : element.value;
    return validateInput(value, label, validators);
  };

  // ── HTTP: política única en LGMDM.api ──
  async function fetchWithRetry(url, options = {}) {
    const { handleError: _handleError, ...apiOptions } = options || {};
    return LGMDM.api.apiFetch(url, apiOptions);
  }

  LGMDM.errors.fetchWithRetry = fetchWithRetry;

  // Los errores globales pertenecen a LGMDM.observability.
  if (typeof window.LGMDM?.observability?.captureError === 'function') {
    window.LGMDM.observability.lastErrorHandler = true;
  }

  // ── Wrap existing API calls ──
  const fetchWithErrorHandling = async function(url, opts = {}) {
    const handleError = opts?.handleError !== false;
    const { handleError: _ignored, ...requestOptions } = opts || {};

    try {
      const response = await LGMDM.api.apiFetch(url, requestOptions);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response;
    } catch (err) {
      if (handleError) {
        let message = err.message;
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          message = 'La solicitud tomó demasiado tiempo. Por favor, intenta de nuevo.';
        } else if (message.includes('Failed to fetch')) {
          message = 'Error de conexión. Verifica tu conexión a internet.';
        }
        LGMDM.ui.showToast(message, 'error');
      }
      throw err;
    }
  };

  LGMDM.errors.fetchWithErrorHandling = fetchWithErrorHandling;

  // ── Progress indicator ──
  function showProgress(message, total = null) {
    const toast = LGMDM.ui.showToast(message, 'loading', 0);
    const progressBar = document.createElement('div');
    progressBar.className = total ? 'progress-bar' : 'progress-bar progress-bar-indeterminate';
    toast.appendChild(progressBar);

    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    progressBar.appendChild(fill);

    return {
      update(current) {
        if (total) {
          const percent = (current / total) * 100;
          fill.style.width = percent + '%';
        }
      },
      complete(successMessage = 'Completado') {
        toast.remove();
        LGMDM.ui.showToast(successMessage, 'success', 3000);
      },
      error(errorMessage = 'Error') {
        toast.remove();
        LGMDM.ui.showToast(errorMessage, 'error');
      },
      toast,
    };
  };

  // ── Inicializar ──

})();
