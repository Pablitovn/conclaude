// 20-pro-upgrades.js — Pitch Pro, Pro Metering, AI Actions, Reference Compare, UX
(function () {
  'use strict';

  const qs = (s, root = document) => root.querySelector(s);
  const el = (id) => document.getElementById(id);

  function normalizeUiError(err) {
    return typeof err === 'string' ? err : (err?.message || err?.detail || 'Error inesperado');
  }


  const toast = (msg, type = 'info') => LGMDM.ui.showToast(msg, type, 2600);


  function injectShell() {
    // El header estático (#studioTitle, sección .lg-studio-head) ya cubre este
    // mismo panel "Control Room" — ver 34-shell-bridge.js, que conecta sus
    // botones quickPitch/quickMeter/quickReference/quickAI a las acciones
    // reales. Si ese header ya está en el DOM, no dupliques el panel viejo.
    if (el('proToolsShell') || el('studioTitle')) return;
    const shell = document.createElement('div');
    shell.id = 'proToolsShell';
    shell.innerHTML = `
      <section class="pro-tools-shell" aria-label="Herramientas Pro">
        <div class="pro-tools-head">
          <div>
            <div class="pro-eyebrow">STUDIO TOOLS</div>
            <h2>Control Room</h2>
            <p>Pitch, metering, AI y referencia en una sola vista.</p>
          </div>
          <div class="pro-tools-actions">
            <button class="pro-action-btn" id="proPitchBtn">◉ Pitch Pro</button>
            <button class="pro-action-btn" id="proMeterBtn">▥ Meter</button>
            <button class="pro-action-btn" id="proRefBtn">⇄ Reference</button>
            <button class="pro-action-btn" id="proAiBtn">✦ AI Insight</button>
          </div>
        </div>
        <div class="pro-status-strip">
          <div><span class="pro-dot"></span><span id="proTrackLabel">No hay track analizado</span></div>
          <div class="pro-mini-metrics" id="proMiniMetrics">
            <span>LUFS <b>—</b></span><span>TP <b>—</b></span><span>DR <b>—</b></span><span>ST <b>—</b></span>
          </div>
        </div>
      </section>
      <div id="proOverlayRoot"></div>
    `;
    const anchor = document.querySelector('main');
    // El layout es de altura fija (html/body con overflow:hidden y
    // `main{height:calc(100dvh - var(--lgmdm-header-safe))}`), pensado
    // para viewport unico sin scroll de pagina. Insertar este panel como
    // hermano de <main> (antes) suma su altura real por fuera de esa
    // cuenta: el total (header + shell + main) termina superando el
    // 100dvh, y como todo tiene overflow:hidden, la parte de abajo de
    // <main> (la forma de onda, meters, etc.) queda tapada/recortada sin
    // forma de scrollear hasta ahi. Insertarlo DENTRO de #content, como
    // primer hijo antes de .content-shell, lo mete en la columna que ya
    // tiene overflow:auto vertical — si no entra, scrollea, y no roba
    // altura calculada por <main>.
    const contentEl = document.getElementById('content');
    const workspaceShell = contentEl?.querySelector('.content-shell');
    if (workspaceShell) workspaceShell.before(shell);
    else if (contentEl) contentEl.prepend(shell);
    else if (anchor) anchor.before(shell);
    else document.body.prepend(shell);
  }

  function closeOverlay(id) {
    el(id)?.classList.remove('is-open');
  }

  const LG = window.LGMDM = window.LGMDM || {};
  const bindOnce = LG.ui.bindOnce;

  function overlayBase(id, title, subtitle, body) {
    const root = el('proOverlayRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="pro-overlay ${id}" id="${id}" role="dialog" aria-modal="true">
        <div class="pro-dialog">
          <div class="pro-dialog-head">
            <div><div class="pro-eyebrow">CONTROL ROOM</div><h3>${LG.ui.escapeHtml(title)}</h3><p>${LG.ui.escapeHtml(subtitle)}</p></div>
            <button class="pro-close" data-close="${id}" aria-label="Cerrar">×</button>
          </div>
          <div class="pro-dialog-body">${body}</div>
        </div>
      </div>`;
    bindOnce(qs(`[data-close="${id}"]`), 'click', () => closeOverlay(id), `pro-close-${id}`);
    bindOnce(qs(`.${id}`), 'click', (e) => { if (e.target.classList.contains('pro-overlay')) closeOverlay(id); }, `pro-overlay-${id}`);
  }

  async function postAnalyze(file) {
    if (file && window.selectedFile !== file) {
      throw new Error('El archivo solicitado para análisis no coincide con el archivo seleccionado');
    }
    const data = await LGMDM.analysis.request({ clear: false });
    if (!data) throw new Error('El análisis server-side fue invalidado por un cambio de archivo');
    return data;
  }

  function renderMetrics(data, refData = null) {
    const fmt = (v, suffix = '', digits = 1) => Number.isFinite(Number(v)) ? `${Number(v).toFixed(digits)}${suffix}` : '—';
    const metrics = [
      ['LUFS-I', fmt(data?.lufs, '', 1), 'Loudness integrado'],
      ['True Peak', fmt(data?.true_peak_db, ' dBTP', 1), 'Pico inter-sample'],
      ['LRA', fmt(data?.lra, ' LU', 1), 'Rango de loudness'],
      ['Dynamic', fmt(data?.dynamic_range_db ?? data?.crest_factor_db, ' dB', 1), 'Dinámica global'],
      ['Stereo', fmt(data?.stereo_correlation, '', 2), 'Correlación L/R'],
      ['Mono', fmt(data?.mono_compatibility_db, ' dB', 1), 'Pérdida al sumar'],
      ['PLR', fmt(data?.plr_db, ' dB', 1), 'True Peak − LUFS'],
      ['Clipping', fmt((data?.clipping_ratio ?? 0) * 100, '%', 2), 'Muestras clippeadas'],
    ];
    const cards = metrics.map(([name, value, help]) => `<div class="pro-meter-card"><span>${name}</span><strong>${value}</strong><small>${help}</small></div>`).join('');
    const compare = refData ? `
      <div class="pro-compare-block">
        <div class="pro-compare-head"><strong>Reference delta</strong><span>${LG.ui.escapeHtml(refData.filename || 'Referencia')}</span></div>
        ${[
          ['LUFS', data?.lufs, refData?.lufs, ' LUFS'],
          ['True Peak', data?.true_peak_db, refData?.true_peak_db, ' dBTP'],
          ['Dynamic', data?.dynamic_range_db ?? data?.crest_factor_db, refData?.dynamic_range_db ?? refData?.crest_factor_db, ' dB'],
          ['Stereo', data?.stereo_correlation, refData?.stereo_correlation, ''],
        ].map(([n, a, b, u]) => {
          const delta = Number(a) - Number(b);
          return `<div class="pro-delta-row"><span>${n}</span><b>${Number.isFinite(delta) ? (delta >= 0 ? '+' : '') + delta.toFixed(n === 'Stereo' ? 2 : 1) + u : '—'}</b><em>track vs ref</em></div>`;
        }).join('')}
      </div>` : '';
    return `<div class="pro-meters-grid">${cards}</div>${compare}`;
  }

  async function openMeter() {
    const file = window.selectedFile || null;
    overlayBase('proMeterOverlay', 'Professional Metering', 'Métricas de loudness, dinámica y compatibilidad estéreo.', `<div id="proMeterContent" class="pro-loading">Analizando señal…</div>`);
    el('proMeterOverlay')?.classList.add('is-open');
    if (!file) { el('proMeterContent').innerHTML = '<div class="pro-empty">Seleccioná un audio primero.</div>'; return; }
    try {
      const data = (window.lastAnalysisData) || await postAnalyze(file);
      window.LGMDM.ai.setContext(data);
      renderMini(data);
      el('proMeterContent').innerHTML = renderMetrics(data);
    } catch (e) {
      el('proMeterContent').innerHTML = `<div class="pro-error">No se pudo analizar: ${LG.ui.escapeHtml(e.message)}</div>`;
    }
  }

  function renderMini(data) {
    const label = el('proTrackLabel');
    const hasAnalysis = !!data && typeof data === 'object' && Object.keys(data).length > 0;
    if (label) label.textContent = hasAnalysis ? (window.selectedFile?.name || 'Track analizado') : 'No hay track analizado';
    const box = el('proMiniMetrics');
    if (!box) return;
    const val = (x, d = 1) => Number.isFinite(Number(x)) ? Number(x).toFixed(d) : '—';
    box.innerHTML = `<span>LUFS <b>${val(hasAnalysis ? data?.lufs : null)}</b></span><span>TP <b>${val(hasAnalysis ? data?.true_peak_db : null)}</b></span><span>DR <b>${val(hasAnalysis ? (data?.dynamic_range_db ?? data?.crest_factor_db) : null)}</b></span><span>ST <b>${val(hasAnalysis ? data?.stereo_correlation : null, 2)}</b></span>`;
  }

  function openPitch() {
    const content = `
      <div class="pitch-pro-grid">
        <div class="pitch-hero-card"><span>PROFILE</span><strong id="pitchProfileLabel">VOCAL</strong><small>Corrección musical con transiciones suaves.</small></div>
        <div class="pitch-hero-card"><span>KEY</span><strong id="pitchKeyLabel">AUTO</strong><small>La tonalidad detectada aparece tras procesar.</small></div>
      </div>
      <div class="pro-control-row"><label>Perfil</label><div class="pro-segment" id="pitchProfile"><button class="active" data-profile="VOCAL">Vocal</button><button data-profile="INSTRUMENT">Instrument</button></div></div>
      <div class="pro-control-row"><label>Correction</label><input id="pitchStrength" type="range" min="0" max="100" value="55"><output id="pitchStrengthOut">55%</output></div>
      <div class="pro-control-row"><label>Retune Speed</label><input id="pitchRetune" type="range" min="0" max="100" value="35"><output id="pitchRetuneOut">Natural</output></div>
      <div class="pro-control-row"><label>Scale</label><select id="pitchProScale"><option value="">Auto-detect</option><option>C_major</option><option>G_major</option><option>D_major</option><option>A_major</option><option>E_major</option><option>B_major</option><option>F_major</option><option>A_minor</option><option>E_minor</option><option>D_minor</option><option>B_minor</option></select></div>
      <div class="pro-control-row"><label>Output</label><select id="pitchProFormat"><option value="wav">WAV 24-bit</option><option value="flac">FLAC</option><option value="mp3">MP3 320k</option></select></div>
      <div class="pro-pitch-note"><b>Tip:</b> empezá en 40–60% de corrección y subí el Retune Speed solo cuando necesites más precisión.</div>
      <div class="pro-dialog-actions"><button class="pro-primary" id="pitchProApply">Aplicar Pitch Pro</button></div>
      <div id="pitchProStatus" class="pro-inline-status"></div>`;
    overlayBase('proPitchOverlay', 'Pitch Correction Pro', 'Más control sobre precisión y velocidad de corrección.', content);
    el('proPitchOverlay')?.classList.add('is-open');
    const strength = el('pitchStrength');
    const retune = el('pitchRetune');
    const update = () => {
      const s = Number(strength.value);
      el('pitchStrengthOut').textContent = `${s}%`;
      const labels = ['Natural', 'Smooth', 'Medium', 'Fast', 'Hard'];
      el('pitchRetuneOut').textContent = labels[Math.min(4, Math.floor(Number(retune.value) / 20))];
    };
    strength.addEventListener('input', update); retune.addEventListener('input', update); update();
    qs('#pitchProfile').addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      qs('#pitchProfile').querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); el('pitchProfileLabel').textContent = btn.dataset.profile;
    });
    qs('#pitchProApply').addEventListener('click', async () => {
      const file = window.selectedFile;
      if (!file) { el('pitchProStatus').textContent = 'Seleccioná un audio primero.'; return; }
      const s = Number(strength.value);
      const mode = s < 25 ? 'LIGHT' : s < 65 ? 'MEDIUM' : 'STRONG';
      const r = Number(retune.value);
      const glide = Math.max(8, 180 - r * 1.6);
      const fd = new FormData(); fd.append('file', file); fd.append('mode', mode); fd.append('glide_time_ms', glide); fd.append('output_format', el('pitchProFormat').value);
      const scale = el('pitchProScale').value; if (scale) fd.append('scale', scale);
      el('pitchProApply').disabled = true; el('pitchProStatus').textContent = 'Procesando…';
      try {
        const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/pitch-correct`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        const blob = await res.blob();
        const key = res.headers.get('X-Detected-Key') || 'AUTO'; el('pitchKeyLabel').textContent = key.replace('_', ' ');
        const format = el('pitchProFormat').value;
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `pitch-pro.${format}`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        el('pitchProStatus').textContent = `✓ Listo — ${key} · ${mode} · ${Math.round(glide)} ms`;
        toast('Pitch Pro procesado', 'success');
      } catch (e) { el('pitchProStatus').textContent = `Error: ${e.message}`; }
      finally { el('pitchProApply').disabled = false; }
    });
  }

  async function openReference() {
    const track = window.selectedFile;
    const ref = window.LGMDM?.state?.reference?.file;
    overlayBase('proRefOverlay', 'Reference Matching', 'Compará el track con una referencia antes de aplicar el match.', `<div id="proRefContent" class="pro-loading">Preparando comparación…</div>`);
    el('proRefOverlay')?.classList.add('is-open');
    if (!track || !ref) { el('proRefContent').innerHTML = '<div class="pro-empty">Seleccioná track y referencia en el módulo Reference Matching.</div>'; return; }
    try {
      const [a, b] = await Promise.all([postAnalyze(track), postAnalyze(ref)]);
      b.filename = ref.name;
      el('proRefContent').innerHTML = renderMetrics(a, b) + `<div class="pro-dialog-actions"><button class="pro-primary" id="openExistingRef">Abrir Reference Matching</button></div>`;
      el('openExistingRef').addEventListener('click', () => { closeOverlay('proRefOverlay'); el('btnMasterRef')?.scrollIntoView({behavior:'smooth', block:'center'}); });
    } catch (e) {
      const box = el('proRefContent');
      if (box) { box.innerHTML = '<div class="pro-error"></div>'; box.querySelector('.pro-error').textContent = `Error: ${normalizeUiError(e)}`; }
      handleClientError?.(e, 'No se pudo analizar la referencia.', { context: 'pro-reference', duration: 3500 });
    }
  }

  async function openAI() {
    const file = window.selectedFile;
    overlayBase('proAiOverlay', 'AI Mastering Insight', 'La IA analiza tu track y propone parámetros revisables antes de masterizar.', `<div id="proAiContent"><div class="pro-ai-intro">Ejecutá una recomendación para cargar parámetros en la cadena actual.</div><div class="pro-dialog-actions"><button class="pro-primary" id="proAiRun">✦ Analizar y recomendar</button><button class="pro-secondary" id="proAiChat">Abrir AI Chat</button></div><div id="proAiResult"></div></div>`);
    el('proAiOverlay')?.classList.add('is-open');
    el('proAiRun').addEventListener('click', async () => {
      if (!file) { el('proAiResult').innerHTML = '<div class="pro-empty">Seleccioná un audio primero.</div>'; return; }
      const btn = el('proAiRun'); btn.disabled = true; btn.textContent = 'Analizando…';
      try {
        const fd = new FormData(); fd.append('file', file);
        const res = await LGMDM.api.apiFetch('/ai/suggest', { method: 'POST', body: fd });
        if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
        const data = await res.json();
        if (typeof window.LGMDM.ai.setContext === 'function') window.LGMDM.ai.setContext(data.analysis || null);
        else {
                    window.dispatchEvent(new CustomEvent('analysis-updated', { detail: data.analysis || null }));
        }
        renderMini(data.analysis || {});
        const d = data.ai_decision || {}; const { platform, reasoning, ...params } = d;
        if (Object.keys(params).length && typeof window.LGMDM?.presets?.applyToUI === 'function') {
          window.LGMDM?.presets?.applyToUI(params);
          typeof window.LGMDM?.params?.renderPreview === 'function' && window.LGMDM.params.renderPreview(params, { title: '✦ AI Insight — revisá antes de masterizar', confirmLabel: 'Confirmar y masterizar', onConfirm: window.LGMDM?.mastering?.submitJob });
        }
        el('proAiResult').innerHTML = `<div class="pro-ai-result"><div class="pro-ai-badge">RECOMMENDED</div><h4>${LG.ui.escapeHtml(platform || 'Adaptive Mastering')}</h4><p>${LG.ui.escapeHtml(reasoning || 'La IA cargó una cadena adaptativa en tus controles. Revisala y escuchá el preview antes de confirmar.')}</p></div>`;
      } catch (e) {
        const box = el('proAiResult');
        if (box) { box.innerHTML = '<div class="pro-error"></div>'; box.querySelector('.pro-error').textContent = `Error: ${normalizeUiError(e)}`; }
        handleClientError?.(e, 'No se pudo obtener la recomendación de IA.', { context: 'pro-ai', duration: 3500 });
      }
      finally { btn.disabled = false; btn.textContent = '✦ Analizar y recomendar'; }
    });
    el('proAiChat').addEventListener('click', () => { closeOverlay('proAiOverlay'); el('aiFab')?.click(); });
  }

  function improveHistory() {
    const mgr = window.LGMDM?.undo?.manager;
    if (!mgr || mgr.__proFixed) return;
    mgr.__proFixed = true;
    const originalSave = mgr.saveState.bind(mgr);
    // Keep the public contract but make snapshots represent the state BEFORE a change.
    mgr.saveState = function (state, label = 'Change') {
      const next = JSON.parse(JSON.stringify(state));
      if (this.currentState !== null) {
        this.undoStack.push({ state: JSON.parse(JSON.stringify(this.currentState)), label, timestamp: Date.now() });
        if (this.undoStack.length > this.maxStates) this.undoStack.shift();
      }
      this.redoStack = [];
      this.currentState = next;
      this.notifyListeners();
    };
    mgr.undo = function () {
      if (!this.undoStack.length) return null;
      this.redoStack.push({ state: JSON.parse(JSON.stringify(this.currentState)), label: 'Redo', timestamp: Date.now() });
      const prev = this.undoStack.pop(); this.currentState = JSON.parse(JSON.stringify(prev.state)); this.notifyListeners(); return prev;
    };
    mgr.redo = function () {
      if (!this.redoStack.length) return null;
      this.undoStack.push({ state: JSON.parse(JSON.stringify(this.currentState)), label: 'Undo', timestamp: Date.now() });
      const next = this.redoStack.pop(); this.currentState = JSON.parse(JSON.stringify(next.state)); this.notifyListeners(); return next;
    };
  }

  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    injectShell();
    bindOnce(el('proPitchBtn'), 'click', openPitch, 'pro-pitch');
    bindOnce(el('proMeterBtn'), 'click', openMeter, 'pro-meter');
    bindOnce(el('proRefBtn'), 'click', openReference, 'pro-ref');
    bindOnce(el('proAiBtn'), 'click', openAI, 'pro-ai');
    improveHistory();
    bindOnce(window, "analysis-updated", (event) => {
      // detail=null también es significativo: limpia las métricas del track anterior.
      renderMini(event.detail || null);
    }, 'pro-analysis-updated');
    if (window.lastAnalysisData) renderMini(window.lastAnalysisData);
  }

  bindOnce(document, 'DOMContentLoaded', boot, 'pro-upgrades-dom-ready', { once: true });
  if (document.readyState !== 'loading') boot();
})();
