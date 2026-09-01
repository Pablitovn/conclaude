// 13-mixer-library.js — Stem library service and persistence orchestration
(function(){
  "use strict";
  const LG = window.LGMDM = window.LGMDM || {};
  const LGMDM = LG;

  function createMixerLibraryService(ctx) {
    const { mixerState, apiFetch, cachedEl, defaultStemParams, addChannelToDOM, renderMixerSidePanel, decodeStemForPreview, scheduleServerPreview, handleClientError } = ctx;
    function normalizeStemName(name, fallback) {
      const base = (name || fallback || "stem").replace(/\.[^.]+$/, "").trim();
      return base || "stem";
    }
    async function refreshStemLibrary(force) {
      if (mixerState.stemLibraryLoaded && !force) return mixerState.stemLibrary;
      try {
        const res = await LGMDM.api.apiFetch("/mix/stem-library");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        mixerState.stemLibrary = data.files || [];
        mixerState.stemLibraryLoaded = true;
      } catch (err) {
        console.warn("No se pudo cargar la librería de stems:", err);
        mixerState.stemLibrary = [];
      }
      renderMixerSidePanel();
      return mixerState.stemLibrary;
    }
    async function addStemFromLibrary(item) {
      const stemName = normalizeStemName(item.original_filename, item.id);
      if (mixerState.stems[stemName] && !confirm(`Ya existe "${stemName}". ¿Reemplazar?`)) return;
      mixerState.stems[stemName] = { file:null, params:defaultStemParams(stemName), uploaded:true, duration:item.duration_sec, libraryId:item.id, libraryName:item.original_filename };
      addChannelToDOM(stemName);
      try {
        const res = await LGMDM.api.apiFetch(`/mix/stem-library/${item.id}/download`);
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        blob.name = item.original_filename || `${stemName}.wav`;
        await decodeStemForPreview(stemName, blob);
        const submitBtn = cachedEl("mixerSubmitBtn");
        if (submitBtn) submitBtn.removeAttribute("disabled");
        scheduleServerPreview();
      } catch (err) {
        console.warn("No se pudo preparar preview local del stem guardado:", err);
      }
    }
    async function deleteStemFromLibrary(item) {
      if (!confirm(`¿Borrar "${item.original_filename}" de la librería de stems?`)) return;
      try {
        const res = await LGMDM.api.apiFetch(`/mix/stem-library/${item.id}`, { method:"DELETE" });
        if (!res.ok) throw new Error(await res.text());
        mixerState.stemLibrary = mixerState.stemLibrary.filter(x => x.id !== item.id);
        renderMixerSidePanel();
      } catch (err) {
        handleClientError?.(err, "No se pudo borrar el stem.", { context:"mixer-stem-delete" });
      }
    }
    return Object.freeze({ normalizeStemName, refreshStemLibrary, addStemFromLibrary, deleteStemFromLibrary });
  }

  LG.createMixerLibraryService = createMixerLibraryService;
})();
