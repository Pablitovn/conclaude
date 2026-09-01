// ============================================================
// 00-state-simple.js — Capa de pub/sub sobre LGMDM.state
//
// HISTÓRICO (S11 del audit):
//   Antes este módulo declaraba su propio objeto `state` con las
//   mismas claves que `01-state.js` (selectedFile, cachedFileBuffer,
//   previewSessionId, etc.). Resultado: dos fuentes de verdad para
//   el mismo estado. Las asignaciones a `LGMDM.state.selectedFile`
//   no disparaban el `notify('selectedFile')` del pub/sub, porque
//   01-state.js redefinía la propiedad como getter/setter y el
//   setter no llamaba al notifier.
//
// MODELO NUEVO:
//   - El estado canónico sigue siendo el de 01-state.js (que ya
//     expone los getters/setters hacia `window.selectedFile` y
//     `LGMDM.state.selectedFile`).
//   - Este archivo solo provee la API de subscripción
//     (`LGMDM.state.subscribe(key, fn)`) que cualquier módulo
//     puede usar para reaccionar a cambios.
//   - Para que `subscribe('selectedFile', fn)` funcione, este
//     archivo envuelve los setters conocidos para emitir la
//     notificación. Si una clave no está wrappeada, subscribe
//     sigue siendo válido pero no notifica (fallback silencioso,
//     documentado).
// ============================================================
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  const state = LGMDM.state = LGMDM.state || {};

  const subscribers = new Map();

  function subscribe(key, callback) {
    if (typeof callback !== 'function') return () => {};
    if (!subscribers.has(key)) subscribers.set(key, []);
    subscribers.get(key).push(callback);
    return () => {
      const list = subscribers.get(key);
      if (!list) return;
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  function notify(key, value) {
    const list = subscribers.get(key);
    if (!list) return;
    for (const cb of list) {
      try { cb(value); } catch (err) {
        console.error(`[State] Subscriber error for key "${key}":`, err);
      }
    }
  }

  // Wrappea un setter existente para que también notifique.
  // El descriptor actual puede ser:
  //   - undefined → la propiedad no existe, la creamos con valor inicial.
  //   - data descriptor (value/writable) → la reemplazamos por accessor.
  //   - accessor descriptor (get/set) → envolvemos el set.
  function wrapNotify(key) {
    const desc = Object.getOwnPropertyDescriptor(state, key);
    if (!desc) {
      let value = state[key];
      Object.defineProperty(state, key, {
        configurable: true,
        enumerable: true,
        get: () => value,
        set: (v) => { value = v; notify(key, v); },
      });
      return;
    }
    if (desc.set) {
      const prev = desc.set;
      Object.defineProperty(state, key, {
        configurable: true,
        enumerable: desc.enumerable !== false,
        get: desc.get,
        set: (v) => { prev.call(state, v); notify(key, v); },
      });
    }
  }

  // Claves que se persiguen con notify. Si en el futuro 01-state.js
  // agrega una clave nueva, hay que sumarla acá. El `subscribe`
  // sobre una clave desconocida es no-op silencioso (no rompe).
  const NOTIFY_KEYS = [
    'selectedFile',
    'lastAnalysisData',
    'currentJobId',
    'downloadUrl',
    'previewSessionId',
    'previewLibraryId',
  ];

  for (const key of NOTIFY_KEYS) wrapNotify(key);

  LGMDM.state.subscribe = subscribe;
  LGMDM.state.notify = notify;
  LGMDM.state.keysWithNotify = NOTIFY_KEYS.slice();
})();
