// ============================================================
// 00-bug-fixes.js — Shims defensivos para IDs faltantes
//
// Q17 (audit): este archivo antes parcheaba cuatro APIs globales
// (HTMLMediaElement.prototype.play, window.setTimeout,
// window.setInterval, document.getElementById, window.fetch) y
// exponía cuatro helpers (safeInnerHTML, safeAudioPlay, safeGet,
// safeEventListener) que NADIE usaba en el proyecto.
//
//   - Los patches de prototipo (play/setTimeout/setInterval/
//     getElementById/fetch) son FRÁGILES: cualquier dependencia
//     externa que asuma semántica nativa rompe, y todos ellos
//     duplicaban lógica que ya vivía en 00-api.js / 00-no-autoplay.js.
//
//   - Los helpers "safe*" eran CÓDIGO MUERTO: cero call-sites
//     en el proyecto. Su presencia daba una falsa sensación de
//     cobertura.
//
// QUEDA:
//   - Únicamente el chequeo de IDs críticos que el HTML debe
//     tener para que el bootstrap funcione. Si falta alguno,
//     se loguea un warning (no se intenta crear dinámicamente
//     sin entender el contrato visual del header).
// ============================================================

(function () {
  'use strict';

  // IDs que el frontend asume existentes. Si falta alguno,
  // logueamos para que el dev lo note — antes se creaban
  // elementos a ciegas (e.g. `apiUrl` se creaba como `<div>`
  // sin uso real).
  const CRITICAL_IDS = [
    'a11y-announcements',
    'sidebarTabs',
    'theme-switcher-btn',
    'dropZone',
    'fileInput',
    'consoleStatus',
    'previewAudioWrap',
  ];

  CRITICAL_IDS.forEach((id) => {
    if (!document.getElementById(id)) {
      console.warn(`[00-bug-fixes] ID crítico faltante: #${id} — revisá el HTML`);
    }
  });

  console.log('✅ 00-bug-fixes cargado (chequeo de IDs críticos solamente)');
})();
