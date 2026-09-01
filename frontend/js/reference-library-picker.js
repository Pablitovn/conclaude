// reference-library-picker.js
// Selector de referencias permanentes desde /reference-library
// Integrar al final de 08-reference-mastering.js o cargarlo como script separado.

(function (global) {
  "use strict";
  const LGMDM = global.LGMDM = global.LGMDM || {};
  // ── Estado ────────────────────────────────────────────────────────────────
  let _entries = [];       // lista de referencias indexadas
  let _filtered = [];      // resultado del filtro de búsqueda
  let _selected = null;    // entry seleccionada actualmente

  // ── Elementos DOM (se crean al llamar init()) ─────────────────────────────
  let _modal, _searchInput, _listEl, _statusEl;

  // ── Cargar índice desde el servidor ──────────────────────────────────────
  async function loadLibrary({retryOnAuth=false} = {}) {
    // Nunca disparamos una llamada protegida sin sesión disponible.
    const token = LGMDM.api.authToken();
    if (!token) {
      if (_statusEl) _statusEl.textContent = "Iniciá sesión para cargar la biblioteca.";
      return;
    }
    try {
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/reference-library`);
      if (res.status === 401 && retryOnAuth) {
        await new Promise(r => setTimeout(r, 100));
        return loadLibrary({retryOnAuth:false});
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      _entries = data.entries || [];
      _filtered = [..._entries];
      _renderList();
      _statusEl.textContent = _entries.length
        ? `${_entries.length} referencia${_entries.length !== 1 ? "s" : ""} disponible${_entries.length !== 1 ? "s" : ""}`
        : "La carpeta reference_library/ está vacía. Agregá WAV/MP3/FLAC.";
    } catch (e) {
      _statusEl.textContent = "Error cargando la biblioteca: " + e.message;
    }
  }

  // ── Filtrar por búsqueda ──────────────────────────────────────────────────
  function _applySearch(q) {
    q = q.trim().toLowerCase();
    _filtered = q
      ? _entries.filter((e) => e.filename.toLowerCase().includes(q))
      : [..._entries];
    _renderList();
  }

  // ── Renderizar lista ──────────────────────────────────────────────────────
  function _renderList() {
    _listEl.innerHTML = "";
    if (!_filtered.length) {
      _listEl.innerHTML = `<div class="lgjs-centered-empty">Sin resultados</div>`;
      return;
    }
    _filtered.forEach((entry) => {
      const isSelected = _selected && _selected.id === entry.id;
      const dur = entry.duration_sec != null
        ? Math.floor(entry.duration_sec / 60) + ":" + String(Math.floor(entry.duration_sec % 60)).padStart(2, "0")
        : "--";
      const lufs = entry.lufs != null ? entry.lufs.toFixed(1) + " LUFS" : "--";
      const peak = entry.peak_db != null ? entry.peak_db.toFixed(1) + " dBFS" : "--";

      const row = document.createElement("div");
      row.className = "ref-lib-row" + (isSelected ? " ref-lib-row--selected" : "");
      const nameEl = document.createElement("div");
      nameEl.className = "ref-lib-name";
      nameEl.textContent = entry.filename || "Referencia sin nombre";
      const metaEl = document.createElement("div");
      metaEl.className = "ref-lib-meta";
      for (const value of [dur, lufs, peak, entry.sr ? (entry.sr / 1000).toFixed(1) + "kHz" : ""]) {
        const span = document.createElement("span");
        span.textContent = value;
        metaEl.appendChild(span);
      }
      row.append(nameEl, metaEl);
      const bindOnce = LGMDM.ui?.bindOnce || ((el, type, fn, key, opts) => { el?.addEventListener(type, fn, opts); return true; });
      bindOnce(row, "click", () => _selectEntry(entry), `ref-row-${entry.id}`);
      _listEl.appendChild(row);
    });
  }

  // ── Seleccionar una referencia ────────────────────────────────────────────
  function _selectEntry(entry) {
    _selected = entry;

    // Actualizar variable global que usa 08-reference-mastering.js
    LGMDM.state = LGMDM.state || {}; LGMDM.state.reference = LGMDM.state.reference || { file: null, libraryId: null };
    LGMDM.state.reference.libraryId = entry.id;
    LGMDM.state.reference.file = null;       // anular el File subido a mano

    // Mostrar nombre seleccionado en el label del input de referencia
    const label = document.getElementById("refFileLabel") || document.getElementById("ref-file-label");
    if (label) label.textContent = "📌 " + entry.filename;

    // Invalidar caché de sesión del WS de ref-preview
    if (typeof LGMDM.reference?.onRefFileSelected === "function") LGMDM.reference?.onRefFileSelected();

    // Cerrar modal
    _closeModal();

    // Actualizar botón de preview/submit
    if (typeof LGMDM.reference?.updateRefPreviewBtn === "function") LGMDM.reference.updateRefPreviewBtn();
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function _buildModal() {
    if (_modal) return;
    _modal = document.createElement("div");
    _modal.id = "refLibModal";
    _modal.innerHTML = `
      <div class="ref-lib-backdrop"></div>
      <div class="ref-lib-dialog">
        <div class="ref-lib-header">
          <span>📚 Biblioteca de referencias</span>
          <button class="ref-lib-close" id="refLibClose" title="Cerrar">✕</button>
        </div>
        <div class="ref-lib-toolbar">
          <input type="text" id="refLibSearch" placeholder="Buscar por nombre…" autocomplete="off" />
          <button class="btn btn-secondary btn-sm" id="refLibRescan" title="Re-escanear carpeta">↺ Actualizar</button>
        </div>
        <div class="ref-lib-status" id="refLibStatus">Cargando…</div>
        <div class="ref-lib-list" id="refLibList"></div>
        <div class="ref-lib-footer">
          <span class="lgjs-s-8e359722">
            Poné tus tracks de referencia en <code>reference_library/</code> en el servidor.
            Se indexan automáticamente.
          </span>
        </div>
      </div>
    `;
    document.body.appendChild(_modal);

    _searchInput = _modal.querySelector("#refLibSearch");
    _listEl      = _modal.querySelector("#refLibList");
    _statusEl    = _modal.querySelector("#refLibStatus");

    const bindOnce = LGMDM.ui?.bindOnce || ((el, type, fn, key, opts) => { el?.addEventListener(type, fn, opts); return true; });
    bindOnce(_modal.querySelector("#refLibClose"), "click", _closeModal, "ref-lib-close");
    bindOnce(_modal.querySelector(".ref-lib-backdrop"), "click", _closeModal, "ref-lib-backdrop-close");
    bindOnce(_searchInput, "input", (e) => _applySearch(e.target.value), "ref-lib-search");
    bindOnce(_modal.querySelector("#refLibRescan"), "click", async () => {
      _statusEl.textContent = "Re-escaneando…";
      try {
        await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/reference-library/rescan`, { method: "POST" });
        await loadLibrary();
      } catch (e) {
        _statusEl.textContent = "Error: " + e.message;
      }
    }, "ref-lib-rescan");

  }

  function _openModal() {
    _buildModal();
    _modal.style.display = "flex";
    _searchInput.value = "";
    _filtered = [..._entries];
    _renderList();
    loadLibrary({retryOnAuth:true});              // refrescar lista al abrir
    setTimeout(() => _searchInput.focus(), 80);
  }

  function _closeModal() {
    if (_modal) _modal.style.display = "none";
  }

  // ── Botón que abre el modal (se inserta junto al input de referencia) ──────
  function _injectButton() {
    // El index actual ya declara el botón canónico #btnOpenRefLib.
    // Nunca crear otro elemento con el mismo id: además de duplicar el DOM,
    // eso rompe el quick action y deja dos owners del mismo flujo.
    const existing = document.getElementById("btnOpenRefLib");
    const bindOnce = LGMDM.ui?.bindOnce || ((el, type, fn, key, opts) => { el?.addEventListener(type, fn, opts); return true; });
    if (existing) {
      bindOnce(existing, "click", (e) => { e.preventDefault(); _openModal(); }, "ref-lib-open");
      return;
    }

    const refInput = document.getElementById("refFileInput") || document.querySelector("input[id*='ref'][type='file']");
    if (!refInput) return;

    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-sm ref-lib-open-button";
    btn.type = "button";
    btn.dataset.lgmdmReferenceLibraryTrigger = "true";
    btn.textContent = "📚 Elegir desde biblioteca de referencias";
    bindOnce(btn, "click", (e) => { e.preventDefault(); _openModal(); }, "ref-lib-open-injected");

    const wrapper = refInput.closest(".file-drop-zone, .file-input-wrap, .param") || refInput.parentElement;
    wrapper?.insertAdjacentElement("afterend", btn);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    _injectButton();
    const bindOnce = LGMDM.ui?.bindOnce || ((el, type, fn, key, opts) => { el?.addEventListener(type, fn, opts); return true; });
    // Solo pre-cargamos cuando hay sesión. Si el login ocurre después,
    // el evento de autenticación dispara la carga una sola vez.
    const maybeLoad = () => {
      const token = LGMDM.api.authToken();
      if (token) loadLibrary({retryOnAuth:true}).catch(() => {});
    };
    maybeLoad();
    bindOnce(window, "lgmdm:authenticated", maybeLoad, "reference-library-authenticated");
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }

  // API pública (por si se necesita desde afuera)
  LGMDM.reference = LGMDM.reference || {};
  LGMDM.reference.libraryPicker = { open: _openModal, reload: loadLibrary };
})(window);
