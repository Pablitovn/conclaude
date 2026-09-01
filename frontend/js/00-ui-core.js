
(function(global){
  "use strict";
  const LG = global.LGMDM = global.LGMDM || {};
  const bound = new WeakMap();
  function bindOnce(el, type, handler, key = type, options){
    if (!el || typeof el.addEventListener !== "function") return false;
    let map = bound.get(el);
    if (!map){ map = new Set(); bound.set(el, map); }
    const token = `${type}:${key}`;
    if (map.has(token)) return false;
    el.addEventListener(type, handler, options);
    map.add(token);
    return true;
  }
  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeAudioSrc(value){
    try {
      const raw = String(value ?? '').trim();
      if (!raw) return '';
      const u = new URL(raw, global.location.href);
      if (['http:','https:','blob:'].includes(u.protocol)) return u.href;
    } catch (_) {}
    return '';
  }

  // S9 (audit): whitelist defensivo de formatos conocidos. Si el atributo
  // `data-display-format` del HTML fue manipulado o se agregó un valor
  // nuevo sin actualizar este switch, caemos a String(value) en vez de
  // propagar un formato inesperado.
  const KNOWN_DISPLAY_FORMATS = new Set(['percent', 'fixed1', 'fixed2', 'fixed1s', 'raw']);

  function formatDisplay(value, format) {
    if (!KNOWN_DISPLAY_FORMATS.has(format)) {
      return String(value ?? '');
    }
    const n = Number(value);
    switch (format) {
      case 'percent':
        return Number.isFinite(n) ? `${n}%` : String(value);
      case 'fixed1':
        return Number.isFinite(n) ? n.toFixed(1) : String(value);
      case 'fixed2':
        return Number.isFinite(n) ? n.toFixed(2) : String(value);
      case 'fixed1s':
        return Number.isFinite(n) ? `${n.toFixed(1)}s` : String(value);
      case 'raw':
      default:
        return String(value ?? '');
    }
  }

  function syncRangeDisplay(input) {
    if (!input?.dataset?.displayTarget) return;
    const target = document.getElementById(input.dataset.displayTarget);
    if (!target) return;
    target.textContent = formatDisplay(input.value, input.dataset.displayFormat || 'raw');
  }

  function clearResults() {
    // BUGFIX: #analysisDynamicContent no estaba en esta lista — cada click
    // en Analizar/Consejos hacía appendChild() de un grid nuevo ARRIBA de
    // los anteriores (ver renderAnalysisSingle/renderAnalysisComparison en
    // 09-visualizers.js, que siempre usan appendChild, nunca replaceChildren).
    // El contenedor crecía sin límite con cada análisis, lo que rompía el
    // layout de la pestaña Analysis (contenido superpuesto, sin scroll
    // consistente) hasta refrescar la página.
    const selectors = [
      '#results', '#result', '#analysisResults', '#analysis-results',
      '#masteringResults', '#mastering-results', '#resultPanel', '.results-panel',
      '#analysisDynamicContent'
    ];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if ('value' in node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA')) node.value = '';
        else node.replaceChildren();
      });
    });
    const statusNodes = [
      '#consoleStatus', '#previewPanelStatus', '#previewStatus', '#previewActionStatus'
    ];
    statusNodes.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (node.id === 'consoleStatus') node.textContent = 'Listo para recibir audio';
        else if (node.id === 'previewPanelStatus') node.textContent = 'Listo para procesar';
        else if (node.id === 'previewActionStatus') node.textContent = 'Esperando archivo';
        else node.textContent = '';
      });
    });
  }

  function showStatus(target, message, type = 'info', progress = null, stage = null) {
    const text = message == null ? '' : String(message);
    const targeted = typeof target === 'string' ? document.getElementById(target) : target;
    if (targeted) {
      targeted.textContent = text;
      targeted.dataset.statusType = String(type || 'info');
      if (progress != null) targeted.dataset.progress = String(progress);
      else delete targeted.dataset.progress;
      if (stage != null) targeted.dataset.stage = String(stage);
      else delete targeted.dataset.stage;
    }
    const status = document.getElementById('consoleStatus');
    const previewStatus = document.getElementById('previewPanelStatus');
    const compactStatus = document.getElementById('previewActionStatus');
    if (status) status.textContent = text;
    if (previewStatus) previewStatus.textContent = text;
    if (compactStatus) compactStatus.textContent = text;
    document.querySelectorAll('[data-lgmdm-status]').forEach((node) => {
      node.textContent = text;
      node.dataset.statusType = String(type || 'info');
      if (progress != null) node.dataset.progress = String(progress);
      else delete node.dataset.progress;
      if (stage != null) node.dataset.stage = String(stage);
      else delete node.dataset.stage;
    });
  }

  function getContent() {
    // BUGFIX: antes devolvía #content (el shell exterior que envuelve TODO
    // el workspace de pestañas), así que cualquier cosa insertada acá
    // (waveform, resultados de análisis, panel perceptual) quedaba fuera de
    // las pestañas, siempre visible, y desacomodaba el layout entero.
    // Ahora prioriza el contenedor que vive DENTRO de la pestaña "Analysis".
    return document.getElementById('analysisDynamicContent')
      || document.getElementById('content')
      || document.querySelector('.content')
      || document.body;
  }

  function syncParallelBypass(input) {
    if (!input?.matches?.('[data-parallel-bypass]')) return;
    const off = !!input.checked;
    ['parallelMix','parallelThresh','parallelRatio','parallelAttack','parallelRelease'].forEach((id) => {
      const control = document.getElementById(id);
      if (!control) return;
      control.disabled = off;
      const row = control.closest('.param');
      if (row) row.classList.toggle('is-disabled-by-bypass', off);
    });
  }

  function initDeclarativeControls() {
    bindOnce(document, 'input', (event) => syncRangeDisplay(event.target), 'ui-declarative-range');
    bindOnce(document, 'change', (event) => {
      syncRangeDisplay(event.target);
      syncParallelBypass(event.target);
    }, 'ui-declarative-change');
    document.querySelectorAll('[data-display-target]').forEach(syncRangeDisplay);
    document.querySelectorAll('[data-parallel-bypass]').forEach(syncParallelBypass);
  }

  LG.ui = Object.assign(LG.ui || {}, { bindOnce, initDeclarativeControls, escapeHtml, safeAudioSrc, getContent, clearResults, showStatus });
  if (document.readyState === 'loading') bindOnce(document, 'DOMContentLoaded', initDeclarativeControls, 'ui-declarative-dom-ready', { once: true });
  else initDeclarativeControls();
})(window);
