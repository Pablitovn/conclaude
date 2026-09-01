(function (global) {
  "use strict";
  const MAX_FILE_MB = window.LGMDM?.config?.maxFileMb ?? 200;
  const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
  const LGMDM = global.LGMDM = global.LGMDM || {};
// ============================================================
// 04-file-handling.js — Carga de archivo, librería persistente, referencia
// ============================================================
      const dropZone = document.getElementById("dropZone");
      const fileInput = document.getElementById("fileInput");
      let uppy = null;
      if (window.Uppy && window.Uppy.Uppy && window.Uppy.FileInput) {
        // Q13 (audit): antes se seteaba fileInput.style.pointerEvents = 'none'
        // para que Uppy capturara el click. Eso dejaba el input INACCESIBLE
        // para usuarios de teclado (no se podía tabular hasta él ni
        // activarlo con Enter). Ahora se hace al revés: Uppy no necesita
        // bloquear el input porque ya tenemos el listener 'change' que
        // delega en setFile. Solo lo ocultamos visualmente con
        // `aria-hidden`/`tabindex=-1` si realmente hace falta, pero
        // idealmente queda 100% operativo para teclado y lector de pantalla.
        uppy = new window.Uppy.Uppy({
          autoProceed: false,
          allowMultipleUploads: false,
          restrictions: { maxNumberOfFiles: 1, allowedFileTypes: ["audio/*"] },
        });
        uppy.use(window.Uppy.FileInput, {
          target: "#uppyPicker",
          pretty: true,
          locale: { filesSelected: { 0: "Elegir archivo", 1: "1 archivo seleccionado" } },
        });
        uppy.on("file-added", (file) => {
          if (file && file.data) setFile(file.data);
        });
      }
      const bindOnce = LGMDM.ui?.bindOnce || ((el, type, fn, key, opts) => { el?.addEventListener(type, fn, opts); return true; });
      bindOnce(dropZone, "dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
      bindOnce(dropZone, "dragleave", () => dropZone.classList.remove("dragover"), "file-drop-leave");
      bindOnce(dropZone, "drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
      }, "file-drop-drop");
      bindOnce(fileInput, "change", () => {
        if (fileInput.files[0]) setFile(fileInput.files[0]);
      }, "file-input-change");

      function setFile(f, libraryId = null) {
        // Q16 (audit): validar que f sea un File/Blob antes de leer f.size.
        if (!(f instanceof Blob)) {
          const warn = document.getElementById("fileSizeWarn");
          if (warn) warn.textContent = '⚠ Archivo inválido';
          return;
        }
        const warn = document.getElementById("fileSizeWarn");
        if (f.size > MAX_FILE_BYTES) {
          if (warn) warn.textContent = `⚠ Archivo de ${(f.size / 1024 / 1024).toFixed(1)} MB — máximo ${MAX_FILE_MB} MB`;
          return;
        }
        if (warn) warn.textContent = "";
        selectedFile = f;
                window.dispatchEvent(new CustomEvent("lgmdm:file-selected", { detail: { name: f.name, libraryId } }));

        // Un archivo nuevo invalida el análisis anterior. Evita que Control Room
        // muestre métricas del track previamente seleccionado.
        window.LGMDM.ai.setContext(null);

        _previewSessionId = genUUID();
        _previewLibraryId = libraryId;
        if (document.getElementById("fileName")) document.getElementById("fileName").textContent = `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`;
        ["btnMaster", "btnAnalyze", "btnAdvice", "btnAnalyzeGrid", "btnAdviceGrid", "btnSpectrum", "btnStems", "btnAB", "btnAutoMaster", "btnAiSuggest"].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.disabled = false;
        });
        window.LGMDM.reference.updateButtonState();
        document.getElementById("btnDownload")?.style.setProperty("display", "none");
        document.getElementById("btnReport")?.style.setProperty("display", "none");
        const trackNameInputEl = document.getElementById("trackNameInput");
        if (trackNameInputEl) {
          trackNameInputEl.value = "";
          trackNameInputEl.style.display = "none";
        }
        LGMDM.ui.clearResults();

        cachedFileBuffer = null;
        if (previewAudioUrl) {
          URL.revokeObjectURL(previewAudioUrl);
          previewAudioUrl = null;
        }
        window.LGMDM?.previewController?.stop?.({ silent: true, cancelSource: true });
        if (document.getElementById("previewAudioWrap")) document.getElementById("previewAudioWrap").replaceChildren();
        window.LGMDM?.spectrum?.clear?.();
        hideDynEqRecommendation();
        setPreviewStatus("Preview deshabilitado");

        if (typeof window.LGMDM?.meters?.teardownLiveMeters === 'function') window.LGMDM.meters.teardownLiveMeters();

        loadFileBuffer(f);
        // Cargar un archivo NO inicia el preview automaticamente.
        // El preview solo arranca por accion explicita del usuario.

        if (!libraryId && document.getElementById("saveToLibraryChk")?.checked) {
          uploadCurrentFileToLibrary(f);
        }
      }

      // ... resto del archivo sin cambios ...
      // ── Librería persistente (archivos guardados en el servidor) ────────────────
      async function refreshLibraryList() {
        const listEl = document.getElementById("libraryList");
        // V3 ya no renderiza la librería persistente en este módulo;
        // la UI de referencias se gestiona desde reference-library-picker.js.
        // Evitamos promesas rechazadas si el contenedor legacy no existe.
        if (!listEl) {
          return;
        }
        try {
          const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/library`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          renderLibraryList(data.files || []);
        } catch (e) {
          console.error("[librería] error al listar:", e);
          if (listEl) {
            listEl.innerHTML = `<div class="library-empty-state">No se pudo cargar la librería.</div>`;
          }
        }
      }

      function _formatLibraryDuration(sec) {
        if (sec == null) return "";
        const m = Math.floor(sec / 60);
        const s = Math.round(sec % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
      }

      function renderLibraryList(files) {
        const listEl = document.getElementById("libraryList");
        if (!listEl) return;
        if (!files.length) {
          listEl.innerHTML = `<div class="library-empty-state">Todavía no guardaste ningún archivo.</div>`;
          return;
        }
        listEl.innerHTML = "";
        for (const f of files) {
          const row = document.createElement("div");
          row.className = "library-row";
          const info = document.createElement("div");
          info.className = "library-row__info";
          info.title = f.original_filename;
          info.textContent = `${f.original_filename} — ${_formatLibraryDuration(f.duration_sec)}`;
          info.addEventListener("click", () => useLibraryFile(f.id, f.original_filename));
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.textContent = "🗑";
          delBtn.title = "Borrar de la librería";
          delBtn.style.cssText = "background:none;border:none;color:inherit;opacity:.6;cursor:pointer;flex-shrink:0;";
          delBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            // S7 (audit): sanitizar el nombre antes de meterlo en confirm().
            // confirm() muestra texto plano, no es vector XSS, pero un
            // nombre con \n o caracteres de control confunde el diálogo
            // y permite DoS visual. Acotamos a 80 chars en una sola línea.
            const safeName = String(f.original_filename || '')
              .replace(/[\r\n\t]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80);
            if (!confirm(`¿Borrar "${safeName}" de la librería?`)) return;
            await deleteLibraryFile(f.id);
          });
          row.appendChild(info);
          row.appendChild(delBtn);
          listEl.appendChild(row);
        }
      }

      async function uploadCurrentFileToLibrary(f) {
        try {
          const fd = new FormData();
          fd.append("file", f);
          const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/library/upload`, { method: "POST", body: fd });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await refreshLibraryList();
        } catch (e) {
          // No es crítico para el flujo principal (mastering/preview siguen
          // funcionando con el archivo local) — solo se loguea.
          console.error("[librería] error al guardar:", e);
        }
      }

      async function useLibraryFile(fileId, filename) {
        const listEl = document.getElementById("libraryList");
        try {
          setPreviewStatus("Trayendo archivo de la librería…");
          const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/library/${fileId}/download`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const file = new File([blob], filename, { type: blob.type });
          setFile(file, fileId); // libraryId != null → no se vuelve a subir en el preview
        } catch (e) {
          console.error("[librería] error al usar archivo:", e);
          alert("No se pudo traer el archivo de la librería.");
        }
      }

      async function deleteLibraryFile(fileId) {
        try {
          const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/library/${fileId}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
          await refreshLibraryList();
        } catch (e) {
          console.error("[librería] error al borrar:", e);
        }
      }

      document.getElementById("btnRefreshLibrary")?.addEventListener("click", refreshLibraryList);
      // La librería es protegida: cargarla únicamente cuando exista sesión.
      // Si el módulo se inicializa antes del login, esperamos al evento de auth.
      const loadLibraryWhenAuthenticated = () => {
        if (!!LGMDM.api.authToken()) {
          refreshLibraryList();
        }
      };
      window.addEventListener("lgmdm:authenticated", refreshLibraryList);
      loadLibraryWhenAuthenticated();

      async function loadFileBuffer(f) {
        // P6 (audit): el patrón original cacheaba el ArrayBuffer
        // completo del archivo (hasta 200MB) en `cachedFileBuffer`
        // para que `09-visualizers.js:setupABPlayer` pudiera
        // reconstruir el Blob original para A/B comparison.
        // Resultado: 2x memoria (el File + el ArrayBuffer).
        //
        // 09-visualizers.js ya no usa `cachedFileBuffer` — lee
        // directamente de `selectedFile`. Por lo tanto podemos
        // decodificar y soltar la referencia sin afectar A/B.
        //
        // `decodeAudioData` requiere ArrayBuffer (no acepta Blob),
        // así que la copia sigue siendo inevitable, pero ahora
        // vive solo en una variable local que se libera al
        // terminar la función.
        const ab = await f.arrayBuffer();
        cachedFileBuffer = null; // P6: ya no se cachea
        const buf = await LGMDM.audio.decode(ab);
        drawWaveform(buf);
        // Un único contexto Web Audio compartido; no crear/cerrar contextos locales.
      }

      // ── Referencia (track de referencia para matching) ──────────────────────────
      const referenceState = (window.LGMDM.state.reference || (window.LGMDM.state.reference = { file: null, libraryId: null }));
      const dropZoneRef = document.getElementById("dropZoneRef");
      const refFileInput = document.getElementById("refFileInput");
      bindOnce(dropZoneRef, "dragover", (e) => {
        e.preventDefault();
        dropZoneRef.classList.add("dragover");
      }, "ref-drop-dragover");
      bindOnce(dropZoneRef, "dragleave", () => dropZoneRef.classList.remove("dragover"), "ref-drop-leave");
      bindOnce(dropZoneRef, "drop", (e) => {
        e.preventDefault();
        dropZoneRef.classList.remove("dragover");
        if (e.dataTransfer.files[0]) setRefFile(e.dataTransfer.files[0]);
      }, "ref-drop-drop");
      bindOnce(refFileInput, "change", () => {
        if (refFileInput.files[0]) setRefFile(refFileInput.files[0]);
      }, "ref-file-change");

      function setRefFile(f, fromLibraryId = null) {
        // Q16 (audit): validar que f sea un File/Blob. Sin esto, si llega
        // un string o un objeto mal formado, f.size tira TypeError y la
        // función entera falla sin feedback al usuario.
        if (!(f instanceof Blob)) {
          if (document.getElementById("refFileName")) document.getElementById("refFileName").textContent =
            '⚠ Referencia inválida (no es un archivo)';
          return;
        }
        if (f.size > MAX_FILE_BYTES) {
          if (document.getElementById("refFileName")) document.getElementById("refFileName").textContent =
            `⚠ Archivo de ${(f.size / 1024 / 1024).toFixed(1)} MB — máximo ${MAX_FILE_MB} MB`;
          return;
        }
        referenceState.file = f;
        referenceState.libraryId = fromLibraryId || null;
        if (document.getElementById("refFileName")) document.getElementById("refFileName").textContent = `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`;
        window.LGMDM.reference.updateButtonState();
        // Si viene de la librería, no hay nada que subir/guardar de nuevo.
        if (!fromLibraryId && document.getElementById("saveRefToLibraryChk")?.checked) {
          uploadRefFileToLibrary(f);
        }
      }
      const referenceApi = window.LGMDM.reference = window.LGMDM.reference || {};
      referenceApi.updateButtonState = function updateRefButtonState() {
        const button = document.getElementById("btnMasterRef");
        if (button) button.disabled = !(selectedFile && referenceState.file);
      };

      async function uploadRefFileToLibrary(f) {
        if (typeof LGMDM.library?.saveLocalFile === 'function') {
          await LGMDM.library.saveLocalFile(f, { kind: 'reference' });
        }
      }

      // La selección de referencias persistentes en V3 está centralizada en
      // reference-library-picker.js; no mantener aquí el handler legacy que
      // dependía de #toggleRefLibraryList/#libraryListRef.

      // ── EQ Curve ─────────────────────────────────────────────────────────────────

})(window);
