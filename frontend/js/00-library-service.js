// ============================================================
// 00-library-service.js — único dueño de uploads persistentes locales
// No renderiza selector ni modal: reference-library-picker es el dueño de la selección.
// ============================================================
(function (global) {
  "use strict";
  const LG = global.LGMDM = global.LGMDM || {};
  const service = LG.library = LG.library || {};
  service.saveLocalFile = async function saveLocalFile(file, options = {}) {
    if (!(file instanceof File)) throw new TypeError('saveLocalFile requiere un File');
    // S10 (audit): usar LGMDM.api (namespace correcto). Antes referenciaba
    // LG.api.apiFetch / LG.api.apiBase, que no existen — el método fallaba
    // silenciosamente con "LG.api is undefined". LGMDM.api es el namespace
    // canónico expuesto por 00-api.js.
    const api = LG.api;
    if (!api || typeof api.apiFetch !== 'function') {
      throw new Error('LGMDM.api no está disponible (00-api.js no cargó)');
    }
    const form = new FormData();
    form.append('file', file);
    const response = await api.apiFetch(`${api.apiBase()}/library/upload`, { method: 'POST', body: form });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    global.dispatchEvent(new CustomEvent('lgmdm:library-updated', { detail: { kind: options.kind || 'track', file: file.name, payload } }));
    return payload;
  };
})(window);

