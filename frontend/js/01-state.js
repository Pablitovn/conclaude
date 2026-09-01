// ============================================================
// 01-state.js — Estado global, cache de colores, tema, IA estado
// ============================================================
      // ── State ─────────────────────────────────────────────────────────────────────
      const MAX_FILE_BYTES = window.LGMDM?.config?.maxFileBytes ?? (200 * 1024 * 1024);
      const MAX_FILE_MB = window.LGMDM?.config?.maxFileMb ?? 200;

      // crypto.randomUUID() sólo existe en contextos seguros (HTTPS o localhost).
      // Serví por HTTP+IP (ej. http://104.128.64.125:5500) rompe esa función, así que
      // acá usamos randomUUID si está disponible y si no generamos un UUID v4 a mano.
      function genUUID() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          return window.crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }

      function formatDbValue(value, digits = 1) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "—";
        return `${n >= 0 ? "+" : ""}${n.toFixed(digits)} dB`;
      }
      function formatLinearThresholdToDb(value, digits = 1) {
        const db = 20 * Math.log10(Math.max(Number(value), 1e-9));
        return `${db >= 0 ? "+" : ""}${db.toFixed(digits)} dB`;
      }

      let selectedFile = null;
      // P6 (audit): cachedFileBuffer se eliminó. Antes se cacheaba
      // el ArrayBuffer completo (hasta 200MB) para A/B comparison;
      // 09-visualizers.js ahora lee directamente de selectedFile
      // (que ya es un Blob). loadFileBuffer() hace arrayBuffer()
      // localmente y lo libera al terminar.
      let _previewSessionId = null; // UUID que identifica el archivo actual en el caché del servidor
      let _previewLibraryId = null; // id del archivo en la librería persistente del servidor, si se eligió de ahí
      let currentJobId = null;
      let downloadUrl = null;

      // ── Cache de colores del tema ────────────────────────────────────────────────
      // P4 (audit): el comentario original decía "no hay theme switcher,
      // las variables son fijas". 00-theme-manager.js tiene 11 temas
      // y un switcher (#theme-switcher-btn) que SÍ cambia los CSS vars.
      // El cache se invalidaba solo en page reload, así que al cambiar
      // tema, todos los canvas (EQ curve, waveform, FFT) seguían
      // dibujando con los colores del tema anterior.
      //
      // Fix: invalidar el cache cuando cambian los atributos del <html>
      // que controlan el tema. Usamos MutationObserver acotado al
      // <html> con attributeFilter, que es mucho más barato que
      // observar todo el DOM.
      let _themeColorsCache = null;
      function themeColors() {
        if (_themeColorsCache) return _themeColorsCache;
        const styles = getComputedStyle(document.documentElement);
        const read = (name) => styles.getPropertyValue(name).trim();
        _themeColorsCache = {
          bg: read("--bg"),
          surface: read("--surface"),
          surface2: read("--surface2"),
          border: read("--border"),
          accent: read("--accent"),
          accent2: read("--accent2"),
          green: read("--green"),
          yellow: read("--yellow"),
          red: read("--red"),
          text: read("--text"),
          muted: read("--muted"),
          get: (varName) => read(varName), // fallback para nombres arbitrarios tipo '--foo'
        };
        return _themeColorsCache;
      }
      function invalidateThemeColors() {
        _themeColorsCache = null;
      }
      // P4: invalidar el cache cuando cambia el tema en el <html>.
      // 00-theme-manager.js setea 'data-theme' y opcionalmente
      // 'data-studio-theme'/'data-studio-variant'. attributeFilter
      // hace que el observer solo dispare para esos 3 atributos.
      if (typeof MutationObserver !== 'undefined') {
        const themeObserver = new MutationObserver(invalidateThemeColors);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme', 'data-studio-theme', 'data-studio-variant'],
        });
      }

      // ── Nombre del tema para la descarga ────────────────────────────────────────
      function currentTrackNameParam() {
        const input = document.getElementById("trackNameInput");
        const val = ((input && input.value) || "").trim();
        return val ? `?name=${encodeURIComponent(val)}` : "";
      }
      function getTrackBaseName() {
        const input = document.getElementById("trackNameInput");
        const val = ((input && input.value) || "").trim();
        if (val) return val;
        if (selectedFile) return selectedFile.name.replace(/\.[^/.]+$/, "");
        return "reporte";
      }
      async function downloadReport(jobId) {
        try {
          const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/report/${jobId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${getTrackBaseName()}_reporte.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (e) {
          window.LGMDM?.errors?.handleClientError?.(e, "No se pudo descargar el reporte.", { context: "report-download" });
        }
      }
      function prefillTrackNameFromFile() {
        const input = document.getElementById("trackNameInput");
        if (!input || input.value.trim() || !selectedFile) return;
        const base = selectedFile.name.replace(/\.[^/.]+$/, "");
        input.value = base;
      }
      let previewDebounceTimer = null,
        previewAbortController = null,
        previewAudioUrl = null,
        previewWS = null;
      let metersAudioCtx = null,
        metersSourceNode = null,
        metersAnalyserL = null,
        metersAnalyserR = null,
        metersRafId = null,
        metersSplitter = null;
      let metersLufsRingBuffer = [];
      const METERS_LUFS_WINDOW = 60;

      // ── Asistente de IA: estado ─────────────────────────────────────────────────
      let lastAnalysisData = null; // último dict de análisis (lufs, peak_db, spectrum, mix_advice, ...)
      let aiChatHistory = []; // [{role:'user'|'assistant', content:str}, ...]
      let aiAvailable = null; // null=sin chequear, true/false luego de /ai/status

      // Public state bridge: one canonical owner with backwards-compatible window access.
      // Existing modules may still read window.selectedFile / window.lastAnalysisData,
      // but the values are now owned by LGMDM.state instead of being copied around.
      const _publicState = window.LGMDM?.state || (window.LGMDM = window.LGMDM || {}, window.LGMDM.state = {});
      _publicState.reference = _publicState.reference || { file: null, libraryId: null };
      _publicState.runtime = _publicState.runtime || { preview: {}, reference: _publicState.reference, audio: {} };
      // S11 (audit): el puente de LGMDM.state → window.X ahora cubre TODAS
      // las variables de estado del módulo, no solo selectedFile/lastAnalysisData.
      // Si una clave nueva se agrega, sumarla a BRIDGED_KEYS. 00-state-simple.js
      // envuelve los setters para emitir notify() en las claves críticas.
      //
      // P6 (audit): 'cachedFileBuffer' ya no se cachea (loadFileBuffer
      // lo lee localmente y lo libera). Lo sacamos del BRIDGED_KEYS y
      // del switch para no exponer una propiedad siempre-null.
      const BRIDGED_KEYS = [
        'selectedFile',
        'lastAnalysisData',
        'previewSessionId',
        'previewLibraryId',
        'currentJobId',
        'downloadUrl',
      ];
      for (const key of BRIDGED_KEYS) {
        let backing;
        switch (key) {
          case 'selectedFile': backing = () => selectedFile; break;
          case 'lastAnalysisData': backing = () => lastAnalysisData; break;
          case 'previewSessionId': backing = () => _previewSessionId; break;
          case 'previewLibraryId': backing = () => _previewLibraryId; break;
          case 'currentJobId': backing = () => currentJobId; break;
          case 'downloadUrl': backing = () => downloadUrl; break;
          default: continue;
        }
        Object.defineProperty(_publicState, key, {
          configurable: true,
          enumerable: true,
          get: backing,
          set: (value) => {
            switch (key) {
              case 'selectedFile': selectedFile = value; break;
              case 'lastAnalysisData': lastAnalysisData = value; break;
              case 'previewSessionId': _previewSessionId = value; break;
              case 'previewLibraryId': _previewLibraryId = value; break;
              case 'currentJobId': currentJobId = value; break;
              case 'downloadUrl': downloadUrl = value; break;
              default: break;
            }
          },
        });
        // Backwards-compat: window.selectedFile, window.lastAnalysisData, etc.
        const existing = Object.getOwnPropertyDescriptor(window, key);
        if (!existing || existing.configurable) {
          Object.defineProperty(window, key, {
            configurable: true,
            get: () => _publicState[key],
            set: (value) => { _publicState[key] = value; },
          });
        }
      }

      // ── Sliders ──────────────────────────────────────────────────────────────────
