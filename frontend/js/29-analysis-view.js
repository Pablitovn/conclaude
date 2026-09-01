/* LGMDM — Server Analysis View
 * The Analysis workspace is a pure renderer of backend results.
 * No client-side audio metrics, FFT or preview streaming are produced here.
 */
(function () {
  'use strict';
  const LG = window.LGMDM = window.LGMDM || {};
  const qs = (id) => document.getElementById(id);

  function setStatus(state, text, progress = null) {
    const status = qs('analysisStatus');
    if (!status) return;
    status.textContent = progress != null
      ? `${String(state).toUpperCase()} ${Number(progress).toFixed(0)}%`
      : String(state).toUpperCase();
    status.classList.toggle('processing', state === 'processing');
    status.classList.toggle('ready', state === 'ready');
    status.classList.toggle('error', state === 'error');
    status.title = text || '';
  }

  function renderServerAnalysis(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('El servidor devolvió un análisis inválido');
    }
    const dynamic = qs('analysisDynamicContent');
    if (!dynamic) throw new Error('Contrato DOM roto: #analysisDynamicContent no existe');
    if (typeof window.renderAnalysisSingle === 'function') {
      window.renderAnalysisSingle(data);
    } else {
      throw new Error('Renderizador server-analysis no disponible');
    }
    if (data.fft_spectrum && typeof window.renderFFT === 'function') {
      window.renderFFT([{ label: 'Espectro del servidor', data: data.fft_spectrum }]);
    }
  }

  function clear() {
    const target = qs('analysisDynamicContent');
    if (target) target.replaceChildren();
    setStatus('idle', 'Esperando análisis del servidor');
  }

  LG.analysis = Object.assign(LG.analysis || {}, {
    update: renderServerAnalysis,
    render: renderServerAnalysis,
    request: requestAnalysis,
    clear: () => { lastData = null; requestedFile = null; requestSeq += 1; clear(); },
    redraw: () => { if (lastData) renderServerAnalysis(lastData); },
  });

  window.addEventListener('lgmdm:analysis-state', (event) => {
    const detail = event.detail || {};
    setStatus(detail.state || 'idle', detail.text || '', detail.progress ?? null);
  });

  let requestSeq = 0;
  let requestedFile = null;
  let lastData = null;

  async function requestAnalysis(options = {}) {
    const file = window.selectedFile;
    if (!(file instanceof File)) {
      throw new Error('No existe archivo seleccionado para el análisis server-side');
    }
    const seq = ++requestSeq;
    requestedFile = file;
    if (options.clear !== false) clear();
    setStatus('processing', 'Análisis completo en servidor…');
    const body = new FormData();
    body.append('file', file, file.name);
    const res = await LG.api.apiFetch(`${LG.api.apiBase()}/analysis`, {
      method: 'POST', body, timeout: 0, maxRetries: 0,
    });
    if (seq !== requestSeq || requestedFile !== window.selectedFile) return null;
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const text = await res.text(); if (text) detail += `: ${text}`; } catch (_) {}
      throw new Error(`Análisis server-side rechazado: ${detail}`);
    }
    const data = await res.json();
    if (seq !== requestSeq || requestedFile !== window.selectedFile) return null;
    lastData = data;
    renderServerAnalysis(data);
    setStatus('ready', 'Análisis completo del servidor disponible');
    window.dispatchEvent(new CustomEvent('lgmdm:analysis-state', { detail: { state: 'ready', text: 'Análisis completo del servidor disponible', progress: 100 } }));
    window.dispatchEvent(new CustomEvent('analysis-updated', { detail: data }));
    return data;
  }

  window.addEventListener('lgmdm:file-selected', () => { requestSeq += 1; lastData = null; requestedFile = null; clear(); });
})();

// ── Resize vertical de dashboard/meters/health (helper compartido) ──
(function () {
  if (!window.LGMDM || !LGMDM.ui || !LGMDM.ui.makeResizable) return;
  document.querySelectorAll('.panel-resize-handle-bottom[data-resize-target]').forEach((handle) => {
    const panel = document.getElementById(handle.dataset.resizeTarget);
    if (!panel) return;
    LGMDM.ui.makeResizable(handle, {
      axis: 'y',
      min: 80,
      max: () => window.innerHeight - 120,
      getSize: () => panel.getBoundingClientRect().height,
      setSize: (h) => panel.style.setProperty('--panel-resize-h', h + 'px')
    });
  });
})();
