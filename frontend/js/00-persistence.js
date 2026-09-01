// filepath: js/00-persistence.js
//
// Persistencia de UI en IndexedDB + sync opcional al backend.
//
// CAMBIOS DE LA AUDITORÍA (S8, S12):
//   - S8: ahora la persistencia es OPT-IN. Antes el módulo
//     copiaba el `value` de TODO <input>/<select>/<textarea>
//     del documento (excepto type=file y type=password). Eso
//     era un riesgo estructural: si mañana se agrega un input
//     de API key, token o secreto, queda automáticamente
//     persistido en IndexedDB y sincronizado al backend.
//
//     Modelo nuevo:
//       - Por defecto NO se persiste nada.
//       - Solo se persisten los inputs que tengan el atributo
//         `data-persist="true"` en el HTML.
//       - Los inputs con `data-persist="false"` se siguen
//         respetando (escape hatch explícito).
//
//   - S12: la validación de versión usaba `snapshot.version !== 1`,
//     que es frágil: si en el futuro salta a version 2, todos
//     los snapshots existentes quedan huérfanos. Ahora se usa
//     un `SUPPORTED_VERSIONS` set: si la versión no está, se
//     intenta migrar; si no hay migrador, se descarta y se
//     arranca de nuevo.
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  const DB_NAME = 'lgmdm-ui';
  const DB_VERSION = 1;
  const STORE = 'snapshots';
  const SNAPSHOT_KEY = 'current';
  const SAVE_DEBOUNCE_MS = 1500;
  const AUTO_SAVE_MS = 30000;
  const CURRENT_VERSION = 1;
  // Versiones que podemos leer sin migración. Si el snapshot
  // guardado tiene una versión fuera de este set, se intenta
  // `migrateSnapshot(snapshot)`; si no existe, se descarta.
  const SUPPORTED_VERSIONS = new Set([1]);

  let dbPromise = null;
  let saveTimer = null;
  let autoSaveTimer = null;
  let started = false;

  function openDb() {
    if (!('indexedDB' in global)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error || new Error('IndexedDB no disponible'));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
    }).catch(() => null);
    return dbPromise;
  }

  // S8: opt-in. Solo se persiste lo marcado con data-persist="true".
  function shouldPersist(el) {
    if (!el || !el.id) return false;
    if (el.disabled) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return false;
    const type = (el.type || '').toLowerCase();
    if (type === 'file' || type === 'password' || type === 'hidden') return false;
    const flag = el.dataset?.persist;
    if (flag === 'false') return false;
    if (flag === 'true') return true;
    // Default: NO persistir. Hay que marcarlo explícitamente.
    return false;
  }

  function collectFormState() {
    const values = {};
    document.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!shouldPersist(el)) return;
      const type = (el.type || el.tagName).toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        values[el.id] = { type, checked: !!el.checked };
      } else {
        // S8: no persistir valores vacíos de inputs marcados —
        // si el campo quedó en blanco, no lo guardamos (evita
        // rehidratar forms con campos fantasma).
        const v = el.value;
        if (v === '' || v == null) return;
        values[el.id] = { type, value: String(v) };
      }
    });
    return values;
  }

  function collectSnapshot() {
    const state = LGMDM.state || {};
    return {
      version: CURRENT_VERSION,
      createdAt: Date.now(),
      workspace: LGMDM.storage.get('lgmdm.workspace') || null,
      activeTab: LGMDM.storage.get('active-tab') || null,
      theme: LGMDM.storage.get('lgmdm-theme') || null,
      expertMode: LGMDM.storage.get('lgmdm-expert-mode') || null,
      drawerWidth: LGMDM.storage.get('lgmdm.drawer-width') || null,
      state: {
        selectedFileName: state.selectedFile?.name || null,
      },
      form: collectFormState(),
    };
  }

  async function syncToBackend(snapshot) {
    const node = document.querySelector('meta[name="lgmdm-persistence-sync-endpoint"]');
    const target = node?.content?.trim() || '';
    if (!target || typeof LGMDM.api?.client?.post !== 'function') return false;
    try {
      const response = await LGMDM.api.client.post(target, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      return response.ok;
    } catch (_) { return false; }
  }

  async function save(reason = 'manual') {
    const db = await openDb();
    if (!db) return false;
    const snapshot = collectSnapshot();
    snapshot.reason = reason;
    syncToBackend(snapshot);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(snapshot, SNAPSHOT_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function scheduleSave(reason = 'debounced') {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { save(reason); }, SAVE_DEBOUNCE_MS);
  }

  // S12: migración opcional. Hook para que un futuro bump de
  // versión pueda transformar snapshots viejos sin perderlos.
  function migrateSnapshot(snapshot) {
    if (!snapshot) return null;
    if (SUPPORTED_VERSIONS.has(snapshot.version)) return snapshot;
    // Hoy no hay migradores: si llega una versión desconocida,
    // descartar y arrancar limpio.
    return null;
  }

  async function restore() {
    const db = await openDb();
    if (!db) return null;
    const snapshot = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(SNAPSHOT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    const migrated = migrateSnapshot(snapshot);
    if (!migrated) {
      // S12: si el snapshot es inválido o de una versión que
      // no podemos migrar, lo borramos para no acumular basura.
      if (snapshot) {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(SNAPSHOT_KEY);
        } catch (_) { /* noop */ }
      }
      return null;
    }
    // S12: si la versión migrada es anterior a CURRENT_VERSION,
    // bumpeamos en el snapshot restaurado para que el próximo
    // `save()` lo guarde en el formato nuevo.
    const form = migrated.form || {};
    for (const [id, data] of Object.entries(form)) {
      // S8: solo rehidratar inputs que AÚN están marcados
      // como persistibles (si el HTML cambió y removió el flag,
      // no pisamos el estado actual).
      const el = document.getElementById(id);
      if (!el || !shouldPersist(el)) continue;
      if (data?.type === 'file') continue;
      if (data.type === 'checkbox' || data.type === 'radio') el.checked = !!data.checked;
      else if ('value' in data) el.value = data.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    migrated.version = CURRENT_VERSION;
    return migrated;
  }

  function start() {
    if (started) return;
    started = true;
    const runRestore = () => restore().then(() => scheduleSave('restore-complete'));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', runRestore, { once: true });
    else runRestore();
    autoSaveTimer = setInterval(() => save('autosave'), AUTO_SAVE_MS);
    // P2 (audit): antes el listener se ataba a TODO `change`/`input`
    // en captura sobre document. Eso significaba que escribir en un
    // input NO persistible (e.g. un campo de texto cualquiera)
    // disparaba un `scheduleSave` gratuito — el debounce de 1500ms
    // filtraba los duplicados, pero el scheduling igual corría.
    // Ahora filtramos en captura: solo reagimos si el target es
    // un input que SÍ se persiste. Si el documento no tiene
    // inputs persistibles, ni siquiera se agenda el save.
    const scheduleIfPersistable = (e) => {
      if (!e.target || !shouldPersist(e.target)) return;
      scheduleSave('ui-change');
    };
    document.addEventListener('change', scheduleIfPersistable, { capture: true, passive: true });
    document.addEventListener('input', scheduleIfPersistable, { capture: true, passive: true });
    global.addEventListener('pagehide', () => save('pagehide'), { once: true });
    global.addEventListener('beforeunload', () => save('beforeunload'), { once: true });
  }

  LGMDM.persistence = {
    start, save, restore, scheduleSave, collectSnapshot, shouldPersist, DB_NAME,
    CURRENT_VERSION, SUPPORTED_VERSIONS,
  };
  start();
})(window);
