/* LGMDM — Server Preview Controller
 * Contract:
 *   1) Preview is enabled only by #s-livepreview.
 *   2) The server generates a complete preview for an existing mastering job.
 *   3) Parameter changes cancel the active render immediately, then debounce 1500 ms.
 *   4) The server returns the finished audio; playback is allowed only after it arrives.
 *   5) No WebSocket / PCM chunk playback / client-side preview processing.
 */
(function (global) {
  'use strict';

  const LG = global.LGMDM = global.LGMDM || {};
  const DEBOUNCE_MS = 1500;
  const DEFAULT_PREVIEW_DURATION_SEC = 25;

  let running = false;
  let activePromise = null;
  let renderSession = null;
  let sessionSeq = 0;
  let requestTimer = null;
  let ready = false;
  let previewUrl = null;
  let previewTelemetry = null;
  let wired = false;

  const checkbox = () => document.getElementById('s-livepreview');
  const audioWrap = () => document.getElementById('previewAudioWrap');
  const chainPane = () => document.getElementById('pasoCadena');
  const outputPane = () => document.getElementById('pasoSalida');

  function setState(state, text, progress = null) {
    global.dispatchEvent(new CustomEvent('lgmdm:preview-state', {
      detail: { state, text, progress }
    }));
  }

  function isEnabled() {
    return checkbox()?.checked === true;
  }

  function getPreviewDurationSec() {
    const configured = Number(LG.config?.previewDurationSec);
    if (Number.isFinite(configured) && configured > 0) {
      return Math.min(configured, DEFAULT_PREVIEW_DURATION_SEC);
    }
    return DEFAULT_PREVIEW_DURATION_SEC;
  }

  function clearPreviewAudio() {
    const wrap = audioWrap();
    if (wrap) {
      wrap.querySelectorAll('audio').forEach((audio) => {
        try { audio.pause(); } catch (_) {}
        try {
          audio.removeAttribute('src');
          audio.load();
        } catch (_) {}
      });
      wrap.replaceChildren();
    }
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl); } catch (_) {}
      previewUrl = null;
    }
    ready = false;
    global.dispatchEvent(new CustomEvent('lgmdm:preview-ready', {
      detail: { ready: false }
    }));
  }

  function renderAudio(blob) {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error('El servidor devolvió un Preview vacío');
    }
    const wrap = audioWrap();
    if (!wrap) {
      throw new Error('Contrato DOM roto: #previewAudioWrap no existe');
    }

    clearPreviewAudio();
    previewUrl = URL.createObjectURL(blob);

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = previewUrl;
    audio.dataset.previewReady = 'true';
    audio.setAttribute('aria-label', `Preview de ${getPreviewDurationSec()} segundos renderizado por el servidor`);
    wrap.appendChild(audio);

    ready = true;
    global.dispatchEvent(new CustomEvent('lgmdm:preview-ready', {
      detail: { ready: true, audio }
    }));
  }

  function isRenderActive(candidate) {
    return candidate && renderSession === candidate && !candidate.cancelled;
  }

  async function generateJobPreview(jobId, signal) {
    const params = new URLSearchParams({
      preview_seconds: String(getPreviewDurationSec()),
      format: 'wav',
    });
    const res = await LG.api.apiFetch(
      `${LG.api.apiBase()}/jobs/${encodeURIComponent(jobId)}/preview/generate?${params}`,
      { method: 'POST', signal, timeout: 120000, maxRetries: 0 },
    );
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const text = await res.text();
        if (text) detail += `: ${text}`;
      } catch (_) {}
      throw new Error(`El servidor no pudo generar el Preview del job: ${detail}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('audio/') && !contentType.includes('application/octet-stream')) {
      throw new Error('El endpoint del job no devolvió un archivo de audio para el Preview');
    }
    renderAudio(await res.blob());
    setState('ready', `Preview de ${getPreviewDurationSec()} s listo para reproducir`, 100);
    return true;
  }

  function cancelRender() {
    const current = renderSession;
    if (current) {
      current.cancelled = true;
      try { current.controller.abort(); } catch (_) {}
    }
    renderSession = null;
    running = false;
    activePromise = null;
  }

  function stop(options = {}) {
    clearTimeout(requestTimer);
    requestTimer = null;
    cancelRender();
    clearPreviewAudio();
    if (!options.silent) setState('disabled', 'Preview detenido');
  }

  async function start() {
    if (!isEnabled()) {
      setState('disabled', 'Preview deshabilitado');
      return false;
    }
    if (!global.selectedFile) {
      setState('error', 'Cargá un archivo para generar el Preview');
      return false;
    }
    const jobId = global.currentJobId;
    if (!jobId) {
      setState('waiting', 'El Preview del servidor se habilita después de enviar el track a masterizar');
      return false;
    }
    if (running && activePromise) return activePromise;

    clearPreviewAudio();

    const current = {
      id: ++sessionSeq,
      cancelled: false,
      controller: new AbortController(),
      startedAt: performance.now(),
      sourceId: null,
    };
    renderSession = current;
    running = true;
    setState('processing', `Procesando Preview de ${getPreviewDurationSec()} s en el servidor…`, 0);

    activePromise = (async () => {
      try {
        return await generateJobPreview(jobId, current.controller.signal);
      } catch (error) {
        if (error?.name === 'AbortError' || !isRenderActive(current)) return false;
        clearPreviewAudio();
        setState('error', `Error de Preview: ${error.message}`);
        throw error;
      } finally {
        if (renderSession === current) {
          renderSession = null;
          running = false;
          activePromise = null;
        }
      }
    })();

    return activePromise;
  }

  function scheduleRender(reason = 'parameter-change') {
    clearTimeout(requestTimer);
    requestTimer = null;

    if (!isEnabled() || !global.selectedFile) return;

    requestTimer = setTimeout(() => {
      requestTimer = null;
      start().catch((error) => {
        console.error(`[preview] render failed (${reason})`, error);
      });
    }, DEBOUNCE_MS);

    setState('waiting', `Esperando ${DEBOUNCE_MS / 1000} s sin cambios…`);
  }

  function handleParameterChange() {
    if (!isEnabled() || !global.selectedFile) return;
    clearTimeout(requestTimer);
    requestTimer = null;
    cancelRender();
    clearPreviewAudio();
    scheduleRender('parameter-change');
  }

  function handleToggle(event) {
    if (event && event.isTrusted === false) return;
    if (!isEnabled()) {
      stop({ cancelSource: true });
      return;
    }
    cancelRender();
    clearPreviewAudio();
    scheduleRender('preview-enabled');
  }

  function handleFileSelected() {
    clearTimeout(requestTimer);
    requestTimer = null;
    cancelRender();
    clearPreviewAudio();
    if (isEnabled()) {
      scheduleRender('file-selected');
    } else {
      setState('disabled', 'Preview deshabilitado');
    }
  }

  function isParameterControl(target) {
    if (!(target instanceof Element)) return false;
    if (!target.matches('input, select, textarea')) return false;
    if (target.id === 's-livepreview') return false;
    return Boolean(target.closest('#pasoCadena, #pasoSalida'));
  }

  function onParameterEvent(event) {
    if (!isParameterControl(event.target)) return;
    handleParameterChange();
  }

  function bindWorkspace() {
    if (wired) return;
    wired = true;
    const toggle = checkbox();
    const bind = LG.ui?.bindOnce;
    if (typeof bind !== 'function') throw new Error('Preview Controller requiere LGMDM.ui.bindOnce');
    if (!toggle) throw new Error('Contrato DOM roto: #s-livepreview no existe');
    if (!audioWrap()) throw new Error('Contrato DOM roto: #previewAudioWrap no existe');

    bind(toggle, 'change', handleToggle, 'server-preview-toggle');
    bind(global, 'lgmdm:file-selected', handleFileSelected, 'server-preview-file-selected');

    const chain = chainPane();
    const output = outputPane();
    [chain, output].forEach((pane, index) => {
      if (!pane) {
        throw new Error(`Contrato DOM roto: panel de parámetros #${index === 0 ? 'pasoCadena' : 'pasoSalida'} no existe`);
      }
      bind(pane, 'input', onParameterEvent, `server-preview-param-input-${index}`);
      bind(pane, 'change', onParameterEvent, `server-preview-param-change-${index}`);
    });
  }

  LG.previewController = Object.assign(LG.previewController || {}, {
    start,
    stop,
    request: scheduleRender,
    isEnabled,
    isRunning: () => running,
    isReady: () => ready,
    getAudio: () => audioWrap()?.querySelector('audio[data-preview-ready="true"]') || null,
    setServerState: setState,
    getDurationSec: getPreviewDurationSec,
    getSourceId: () => null,
    getSourceMeta: () => null,
    debounceMs: DEBOUNCE_MS,
  });

  LG.previewWorkspace = { startPreview: start, stopPreview: stop };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindWorkspace, { once: true });
  } else {
    bindWorkspace();
  }
})(window);
