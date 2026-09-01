// ============================================================
// 00-memory-cleanup.js — Cleanup registry para listeners
//
// HISTÓRICO:
//   Antes este archivo parcheaba `window.fetch` con un timeout
//   de 30s y exponía `safeListener` / `removeListener` /
//   `cleanupAllListeners` que NUNCA se usaron en el proyecto.
//   Eso se quitó en la auditoría (S2 del audit + Q9):
//     - El wrap de fetch duplicaba lo que ya hace 00-api.js
//       (auth/CSRF/timeout/retry). Generaba comportamiento
//       dependiente del orden de carga.
//     - El registry de listeners era teatro: el `beforeunload`
//       limpiaba listeners de un registry que los módulos no
//       usaban, así que no se limpiaba nada real.
//
// QUEDA:
//   - Un helper de cleanup opcional. Por ahora NO se exporta
//     nada a `window` — si en el futuro hace falta un
//     registry de listeners, que se construya acá, no en
//     archivos sueltos.
// ============================================================

(function () {
  "use strict";

  // Placeholder: si en el futuro hace falta un registry real
  // (e.g. para liberar listeners de canvas/workers al cambiar
  // de workspace), se implementa acá. Hoy no hay nada que
  // limpiar a nivel global — `LGMDM.cleanup` (de 00-cleanup.js)
  // ya cubre los recursos de audio.
})();
