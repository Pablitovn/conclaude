// ============================================================
// 14-pitch-correction.js — Pitch Correction UI
// Interfaz para aplicar corrección automática de pitch
// ============================================================

(function () {
  const PC_PANEL_ID = 'pitchCorrectionPanel';
  const PC_MODES = ['OFF', 'LIGHT', 'MEDIUM', 'STRONG'];


  function createPitchCorrectionPanel() {
    return `
      <div id="${PC_PANEL_ID}" class="lgjs-s-3065b8f6">
        <div class="lgjs-s-70c54dae">
          <h3 class="lgjs-s-11696618">🎵 Pitch Correction</h3>
          <button id="pitchCorrectionClose" class="lgjs-s-db626d22">✕</button>
        </div>

        <div class="lgjs-s-363cdaa2">
          <label class="lgjs-s-a4c301cf">📄 Input (File/Library)</label>
          <input type="file" id="pitchCorrectionFile" accept="audio/*" class="lgjs-s-2adc874c">
          <div class="lgjs-s-3fcfadef">o seleccionar de librería de stems</div>
          <select id="pitchCorrectionLibrary" class="lgjs-s-ca90bd64">
            <option value="">— No seleccionada —</option>
          </select>
        </div>

        <div class="lgjs-s-363cdaa2">
          <label class="lgjs-s-a4c301cf" id="pcModeLabel">Mode</label>
          <div class="lgjs-s-de2ef6e2" role="radiogroup" aria-labelledby="pcModeLabel">
            ${PC_MODES.map(m => `
              <button type="button" data-mode="${m}" role="radio" aria-checked="${m === 'MEDIUM' ? 'true' : 'false'}" aria-label="Pitch correction mode: ${m}" style="padding:.5rem;background:var(--surface2);border:2px solid var(--border);border-radius:4px;color:var(--text);cursor:pointer;font-weight:${m==='MEDIUM'?'bold':'normal'};transition:all 200ms"
                ${m==='MEDIUM'?' class="lgjs-s-65dc0d12"':''}>
                ${m}
              </button>
            `).join('')}
          </div>
          <div class="lgjs-s-3fcfadef">
            OFF=desactivado | LIGHT=±20¢ | MEDIUM=±50¢ | STRONG=±100¢
          </div>
        </div>

        <div class="lgjs-s-363cdaa2">
          <label class="lgjs-s-a4c301cf">Tonalidad (Scale)</label>
          <select id="pitchCorrectionScale" class="lgjs-s-2adc874c">
            <option value="">— Auto-detect —</option>
            <option value="C_major">C Major</option>
            <option value="G_major">G Major</option>
            <option value="D_major">D Major</option>
            <option value="A_major">A Major</option>
            <option value="E_major">E Major</option>
            <option value="F_major">F Major</option>
            <option value="A_minor">A Minor</option>
            <option value="E_minor">E Minor</option>
            <option value="D_minor">D Minor</option>
          </select>
        </div>

        <div class="lgjs-s-363cdaa2">
          <label class="lgjs-s-a4c301cf">Glide Time (ms)</label>
          <input type="range" id="pitchCorrectionGlide" min="0" max="200" value="50" class="lgjs-s-0466783d">
          <div class="lgjs-s-bec2fe95">
            <span>0ms</span>
            <span id="pitchCorrectionGlideVal">50ms</span>
            <span>200ms</span>
          </div>
        </div>

        <div class="lgjs-s-363cdaa2">
          <label class="lgjs-s-a4c301cf">Output Format</label>
          <select id="pitchCorrectionFormat" class="lgjs-s-2adc874c">
            <option value="wav">WAV (24-bit)</option>
            <option value="flac">FLAC</option>
            <option value="mp3">MP3 (320kbps)</option>
          </select>
        </div>

        <div class="lgjs-s-363cdaa2">
          <button id="pitchCorrectionApply" class="lgjs-s-6058516f">
            ✓ Aplicar Pitch Correction
          </button>
        </div>

        <div id="pitchCorrectionStatus" class="lgjs-s-b09c5975"></div>

        <div id="pitchCorrectionProgress" class="lgjs-s-6682d399">
          <div class="lgjs-s-33de6e62">
            <div id="pitchCorrectionProgressBar" class="lgjs-s-789146fb"></div>
          </div>
          <div class="lgjs-s-3fcfadef">Processing...</div>
        </div>
      </div>
    `;
  }

  function showPitchCorrectionPanel() {
    const panel = document.getElementById(PC_PANEL_ID);
    if (!panel) return;

    panel.style.display = 'block';
    for (const id of [
      'pitchCorrectionClose', 'pitchCorrectionLibrary', 'pitchCorrectionScale',
      'pitchCorrectionGlide', 'pitchCorrectionGlideVal', 'pitchCorrectionFormat',
      'pitchCorrectionApply', 'pitchCorrectionStatus', 'pitchCorrectionProgress',
      'pitchCorrectionProgressBar'
    ]) {
      LGMDM.dom.requireById(id, '14-pitch-correction');
    }

    // Cargar librería de stems
    loadPitchCorrectionLibrary();

    // Listeners
    document.getElementById('pitchCorrectionClose')?.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    document.querySelectorAll('.pc-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.pc-mode-btn').forEach(b => {
          b.style.borderColor = 'var(--border)';
          b.style.color = 'var(--text)';
          b.setAttribute('aria-checked', 'false'); // A5: sincronizar aria-checked
        });
        e.target.style.borderColor = 'var(--amber)';
        e.target.style.color = 'var(--amber)';
        e.target.setAttribute('aria-checked', 'true');
      });
    });

    document.getElementById('pitchCorrectionGlide')?.addEventListener('input', (e) => {
      LGMDM.dom.requireById('pitchCorrectionGlideVal', '14-pitch-correction:glide').textContent = e.target.value + 'ms';
    });

    document.getElementById('pitchCorrectionApply')?.addEventListener('click', applyPitchCorrection);
  }

  function loadPitchCorrectionLibrary() {
    const select = document.getElementById('pitchCorrectionLibrary');
    if (!select) return;

    const api = LGMDM.api.apiBase();

    LGMDM.api.apiFetch(`${api}/library`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data.files)) {
          const esc = (typeof LGMDM?.ui?.escapeHtml === 'function')
            ? LGMDM.ui.escapeHtml
            : (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
          // FIX XSS: el nombre de archivo provenía del backend y se inyectaba
          // directo en innerHTML. Si la API devolvía un filename con "<script>" o
          // comillas, se ejecutaba en la página. Se escapa antes de interpolar.
          select.innerHTML = '<option value="">— No seleccionada —</option>' +
            data.files.slice(0, 20).map(item =>
              `<option value="${esc(String(item.id ?? ''))}">${esc(String(item.original_filename ?? ''))}</option>`
            ).join('');
        }
      })
      .catch(e => console.error('Error loading library:', e));
  }

  async function applyPitchCorrection() {
    LGMDM.ui.showStatus('pitchCorrectionStatus', '⏳ Iniciando...', 'info');

    const file = document.getElementById('pitchCorrectionFile')?.files[0];
    const libraryId = document.getElementById('pitchCorrectionLibrary')?.value;
    const mode = document.querySelector('.pc-mode-btn[data-selected="true"]')?.dataset.mode || 'MEDIUM';
    const scale = document.getElementById('pitchCorrectionScale')?.value || null;
    const glideTime = parseFloat(document.getElementById('pitchCorrectionGlide')?.value || 50);
    const format = document.getElementById('pitchCorrectionFormat')?.value || 'wav';

    if (!file && !libraryId) {
      LGMDM.ui.showStatus('pitchCorrectionStatus', '❌ Selecciona archivo o biblioteca', 'error');
      return;
    }

    const formData = new FormData();
    if (file) formData.append('file', file);
    if (libraryId) formData.append('library_id', libraryId);
    formData.append('mode', mode);
    if (scale) formData.append('scale', scale);
    formData.append('glide_time_ms', glideTime);
    formData.append('output_format', format);

    const token = LGMDM.api.authToken();
    const api = LGMDM.api.apiBase();

    try {
      LGMDM.ui.showStatus('pitchCorrectionStatus', '⏳ Procesando pitch correction...', 'info');
      LGMDM.dom.requireById('pitchCorrectionProgress', '14-pitch-correction:progress').style.display = 'block';

      const response = await LGMDM.api.apiFetch(`${api}/pitch-correct`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Error desconocido');
      }

      // Extraer metadata del header
      const detectedKey = response.headers.get('X-Detected-Key') || 'desconocida';
      const confidence = parseFloat(response.headers.get('X-Confidence') || 0);

      // Descargar resultado
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `corrected.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      LGMDM.ui.showStatus('pitchCorrectionStatus', `✓ Completado: tonalidad=${detectedKey} (conf=${(confidence*100).toFixed(0)}%)`, 'success');
      LGMDM.dom.requireById('pitchCorrectionProgress', '14-pitch-correction:progress').style.display = 'none';

    } catch (err) {
      LGMDM.ui.showStatus('pitchCorrectionStatus', `❌ Error: ${err.message}`, 'error');
      console.error(err);
      LGMDM.dom.requireById('pitchCorrectionProgress', '14-pitch-correction:progress').style.display = 'none';
    }
  }

  // Exportar API global
  const pitchCorrectionUI = {
    show: showPitchCorrectionPanel,
    createPanel: createPitchCorrectionPanel,
  };

  // Auto-init: Agregar panel al body
  document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const div = document.createElement('div');
    div.innerHTML = createPitchCorrectionPanel();
    body.appendChild(div.firstElementChild);

    const trigger = document.getElementById('btnPitchCorrection');
    if (trigger) {
      trigger.addEventListener('click', () => showPitchCorrectionPanel());
    }
  });

})();
