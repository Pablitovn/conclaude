// ============================================================
// 00-button-handlers.js — Manejadores de botones faltantes
// ============================================================

(function() {
  "use strict";

  console.log("🔘 Inicializando manejadores de botones...");

  // Helper para encontrar elementos seguramente
  const $ = (id) => document.getElementById(id);



  // BOTÓN: Help
  const helpBtn = $('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      alert('MASTER Audio Studio v1.0\n\n1. ANÁLISIS: Carga archivos y analiza\n2. CONSOLA: Ajusta parámetros\n3. PREVIEW: Escucha resultados\n4. PRESETS: Guarda configuraciones');
    });
  }

  // BOTÓN: Logout
  const logoutBtn = $('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('¿Salir de la sesión?')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  // BOTÓN: Analizar Audio
  const analyzeBtn = $('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      const fileInput = $('fileInput');
      if (!fileInput || !fileInput.files.length) {
        alert('Por favor carga un archivo primero');
        return;
      }

      console.log('📊 Analizando audio...');
      // Trigger evento para que otros módulos lo procesen
      const event = new CustomEvent('analyze-audio', {
        detail: { file: fileInput.files[0] }
      });
      document.dispatchEvent(event);
    });
  }

  // BOTÓN: IA Sugiere
  const aiSuggestBtn = $('btnAiSuggest');
  if (aiSuggestBtn) {
    aiSuggestBtn.addEventListener('click', () => {
      console.log('🤖 Pidiendo sugerencias de IA...');
      const event = new CustomEvent('ai-suggest');
      document.dispatchEvent(event);
    });
  }

  // BOTÓN: Preview Play
  const previewPlayBtn = $('previewPlayBtn');
  if (previewPlayBtn) {
    previewPlayBtn.addEventListener('click', () => {
      const event = new CustomEvent('preview-toggle');
      document.dispatchEvent(event);
    });
  }

  // BOTÓN: Play A (Original)
  const btnPlayA = $('btnPlayA');
  if (btnPlayA) {
    btnPlayA.addEventListener('click', () => {
      console.log('▶️ Reproduciendo A (Original)');
      const event = new CustomEvent('play-ab', { detail: { slot: 'A' } });
      document.dispatchEvent(event);
    });
  }

  // BOTÓN: Play B (Masterizado)
  const btnPlayB = $('btnPlayB');
  if (btnPlayB) {
    btnPlayB.addEventListener('click', () => {
      console.log('▶️ Reproduciendo B (Masterizado)');
      const event = new CustomEvent('play-ab', { detail: { slot: 'B' } });
      document.dispatchEvent(event);
    });
  }

  // BOTÓN: Guardar Preset
  const btnSavePreset = $('btnSavePreset');
  if (btnSavePreset) {
    btnSavePreset.addEventListener('click', () => {
      const presetNameInput = $('presetNameInput');
      if (!presetNameInput || !presetNameInput.value.trim()) {
        alert('Por favor ingresa un nombre para el preset');
        return;
      }

      console.log('💾 Guardando preset:', presetNameInput.value);
      const event = new CustomEvent('save-preset', {
        detail: { name: presetNameInput.value }
      });
      document.dispatchEvent(event);

      presetNameInput.value = '';
    });
  }

  // BOTÓN: Reset Mixer
  const resetMixerBtn = $('resetMixerBtn');
  if (resetMixerBtn) {
    resetMixerBtn.addEventListener('click', () => {
      if (confirm('¿Resetear todos los parámetros a valores por defecto?')) {
        console.log('↻ Reseteando mixer...');
        const event = new CustomEvent('reset-mixer');
        document.dispatchEvent(event);
      }
    });
  }

  // BOTÓN: Descargar
  const downloadBtn = $('downloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const trackNameInput = $('trackNameInput');
      const trackName = (trackNameInput?.value || 'master').replace(/[^a-z0-9_-]/gi, '_');

      console.log('⬇️ Descargando master:', trackName);
      const event = new CustomEvent('download-master', {
        detail: { trackName }
      });
      document.dispatchEvent(event);
    });
  }

  // CONFIGURACIÓN: Auto-Analyze
  const cfgAutoAnalyze = $('cfgAutoAnalyze');
  if (cfgAutoAnalyze) {
    cfgAutoAnalyze.addEventListener('change', () => {
      localStorage.setItem('cfg-auto-analyze', cfgAutoAnalyze.checked);
      console.log('⚙️ Auto-analyze:', cfgAutoAnalyze.checked ? 'ON' : 'OFF');
    });
  }

  // CONFIGURACIÓN: Auto-Master
  const cfgAutoMaster = $('cfgAutoMaster');
  if (cfgAutoMaster) {
    cfgAutoMaster.addEventListener('change', () => {
      localStorage.setItem('cfg-auto-master', cfgAutoMaster.checked);
      console.log('⚙️ Auto-master:', cfgAutoMaster.checked ? 'ON' : 'OFF');
    });
  }

  // CONFIGURACIÓN: High Quality
  const cfgHighQuality = $('cfgHighQuality');
  if (cfgHighQuality) {
    cfgHighQuality.addEventListener('change', () => {
      localStorage.setItem('cfg-high-quality', cfgHighQuality.checked);
      console.log('⚙️ High quality:', cfgHighQuality.checked ? 'ON' : 'OFF');
    });
  }

  // FILE INPUT: Cargar archivo
  const fileInput = $('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        console.log('📁 Archivo cargado:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        
        const event = new CustomEvent('file-loaded', { detail: { file } });
        document.dispatchEvent(event);
      }
    });
  }

  // DRAG & DROP
  const dropZone = $('dropZone');
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent, #00ff88)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border-color, #333)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-color, #333)';

      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  // SESSION NOTES: Auto-save
  const sessionNotes = $('sessionNotes');
  if (sessionNotes) {
    sessionNotes.addEventListener('input', () => {
      localStorage.setItem('session-notes', sessionNotes.value);
    });

    // Restore
    const savedNotes = localStorage.getItem('session-notes');
    if (savedNotes) sessionNotes.value = savedNotes;
  }

  console.log("✅ Manejadores de botones inicializados");
})();
