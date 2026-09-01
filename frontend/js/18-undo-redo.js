// ============================================================
// 18-undo-redo.js — Historial de cambios (undo/redo)
// ============================================================
// Q10 (audit): el clon vía JSON.parse(JSON.stringify(state)) fallaba
// en silencio con File, Blob, AudioBuffer, Map, Set, etc. — al
// serializar se perdían o tiraban excepciones. Ahora usamos un
// clonador seguro que:
//   1) Para objetos planos → structuredClone si está disponible
//      (Node 17+, todos los browsers modernos), con fallback a
//      JSON para los casos donde structuredClone no pueda.
//   2) Para tipos no serializables (File, Blob, AudioBuffer, Map,
//      Set, etc.) → mantener la referencia (no clonar profundo)
//      para que al menos no se rompa. El estado "vivo" entre
//      cambios de undo/redo es responsabilidad del caller: si
//      el undo cambia un File, el `applyMasteringState` debe
//      re-derivar el File desde otra fuente.
(function () {
  "use strict";

  // Tipos que NO se clonan profundo — se mantienen como referencia
  // viva. Si el caller quiere persistir algo no-clonable entre
  // estados, debe re-derivar la referencia desde el id/URL/etc.
  const NON_CLONABLE_TYPES = new Set([
    'File', 'Blob', 'ArrayBuffer', 'AudioBuffer', 'ImageBitmap',
    'HTMLImageElement', 'HTMLVideoElement', 'HTMLAudioElement',
    'HTMLCanvasElement', 'OffscreenCanvas', 'WebGLTexture',
    'MediaStream', 'MessagePort',
  ]);

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function safeClone(value, seen = new WeakMap()) {
    // Primitivos: retorno tal cual.
    if (value === null || typeof value !== 'object') return value;

    // Funciones y symbols: no se clonan.
    if (typeof value === 'function' || typeof value === 'symbol') return value;

    // Tipos no clonables: mantener referencia.
    if (NON_CLONABLE_TYPES.has(value.constructor?.name)) return value;

    // Cycles: devolver la referencia cacheada.
    if (seen.has(value)) return seen.get(value);

    // Arrays.
    if (Array.isArray(value)) {
      const out = [];
      seen.set(value, out);
      for (const item of value) out.push(safeClone(item, seen));
      return out;
    }

    // Date, RegExp, etc.: clonar con su constructor.
    if (value instanceof Date) return new Date(value.getTime());
    if (value instanceof RegExp) return new RegExp(value.source, value.flags);

    // Map: clonar keys/values.
    if (value instanceof Map) {
      const out = new Map();
      seen.set(value, out);
      for (const [k, v] of value) out.set(safeClone(k, seen), safeClone(v, seen));
      return out;
    }

    // Set: clonar valores.
    if (value instanceof Set) {
      const out = new Set();
      seen.set(value, out);
      for (const v of value) out.add(safeClone(v, seen));
      return out;
    }

    // Plain object: clonar keys/values.
    if (isPlainObject(value)) {
      const out = {};
      seen.set(value, out);
      for (const k of Object.keys(value)) out[k] = safeClone(value[k], seen);
      return out;
    }

    // Cualquier otro objeto (clase custom, etc.): mantener referencia.
    return value;
  }

  class UndoRedoManager {
    constructor(maxStates = 50) {
      this.maxStates = maxStates;
      this.undoStack = [];
      this.redoStack = [];
      this.currentState = null;
      this.listeners = [];
    }

    // Guardar estado actual
    saveState(state, label = 'Change') {
      const next = safeClone(state);
      if (this.currentState !== null) {
        this.undoStack.push({
          state: safeClone(this.currentState),
          label,
          timestamp: Date.now(),
        });
        if (this.undoStack.length > this.maxStates) this.undoStack.shift();
      }
      this.redoStack = [];
      this.currentState = next;
      this.notifyListeners();
    }

    undo() {
      if (this.undoStack.length === 0) return null;
      this.redoStack.push({
        state: safeClone(this.currentState),
        label: 'Redo',
        timestamp: Date.now(),
      });
      const previousState = this.undoStack.pop();
      this.currentState = safeClone(previousState.state);
      this.notifyListeners();
      return previousState;
    }

    redo() {
      if (this.redoStack.length === 0) return null;
      this.undoStack.push({
        state: safeClone(this.currentState),
        label: 'Undo',
        timestamp: Date.now(),
      });
      const nextState = this.redoStack.pop();
      this.currentState = safeClone(nextState.state);
      this.notifyListeners();
      return nextState;
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    getHistory() {
      return {
        undo: this.undoStack.map(s => ({ label: s.label, timestamp: s.timestamp })),
        redo: this.redoStack.map(s => ({ label: s.label, timestamp: s.timestamp })),
      };
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
      this.currentState = null;
      this.notifyListeners();
    }

    onChange(callback) {
      this.listeners.push(callback);
    }

    notifyListeners() {
      this.listeners.forEach(cb => {
        try {
          cb({
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            history: this.getHistory(),
          });
        } catch (err) {
          console.error('Error in undo/redo listener:', err);
        }
      });
    }
  }

  // ── Crear instancia global ──
  window.LGMDM.undo = window.LGMDM.undo || {};
  window.LGMDM.undo.manager = new UndoRedoManager();

  // ── Funciones auxiliares ──
  window.LGMDM.undo.undoLastChange = function() {
    const result = window.LGMDM.undo.manager.undo();
    if (result) {
      window.LGMDM.ui.showToast?.(`Deshacer: ${result.label}`, 'info', 2000);
      window.LGMDM?.a11y?.announce?.(`Deshacer: ${result.label}`, 'assertive');
      window.applyMasteringState?.(result.state);
    }
  };

  window.LGMDM.undo.redoLastChange = function() {
    const result = window.LGMDM.undo.manager.redo();
    if (result) {
      window.LGMDM.ui.showToast?.(`Rehacer: ${result.label}`, 'info', 2000);
      window.LGMDM?.a11y?.announce?.(`Rehacer: ${result.label}`, 'assertive');
      window.applyMasteringState?.(result.state);
    }
  };

  // ── Rastrear cambios en parámetros ──
  function trackParameterChange(paramName, newValue) {
    // Obtener estado actual (esto requiere que exista buildMasteringParams)
    if (typeof window.LGMDM?.params?.build === 'function') {
      const currentState = window.LGMDM.params.build();
      window.LGMDM.undo.manager.saveState(currentState, `Cambiar ${paramName}`);
    }
  };

  // ── UI para historial ──
  function createHistoryPanel() {
    const panel = document.createElement('div');
    panel.id = 'history-panel';
    panel.className = "history-panel";
  /* remaining runtime styles are defined in lgmdm.css */
  panel.dataset.historyPanel = "true";
  panel.style.cssText = `
      position: fixed;
      top: 60px;
      right: 0;
      width: 280px;
      max-height: 400px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-left: 2px solid var(--accent);
      border-radius: 8px;
      padding: 12px;
      z-index: 8999;
      box-shadow: -4px 4px 12px rgba(0, 0, 0, 0.3);
      font-family: var(--sans);
      font-size: 0.85em;
      color: var(--text);
      display: none;
    `;

    panel.innerHTML = `
      <div class="history-panel__header">
        <strong>Historial</strong>
        <button id="closeHistoryPanel" class="history-panel__close">✕</button>
      </div>
      <div id="historyList" class="history-panel__list"></div>
    `;

    document.body.appendChild(panel);

    document.getElementById('closeHistoryPanel')?.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    // Actualizar lista de historial
    window.LGMDM.undo.manager.onChange(({ history }) => {
      const list = document.getElementById('historyList');
      if (!list) return;

      list.innerHTML = '';

      // Undo stack
      if (history.undo.length > 0) {
        const undoTitle = document.createElement('div');
        undoTitle.textContent = '🔙 Deshacer';
        undoTitle.className = 'undo-history-title';
        list.appendChild(undoTitle);

        history.undo.slice().reverse().forEach(item => {
          const li = document.createElement('div');
          li.style.cssText = `
            padding: 4px 8px;
            background: var(--surface3);
            border-radius: 4px;
            margin-bottom: 4px;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 0.8em;
          `;
          li.textContent = `• ${item.label}`;
          li.addEventListener('click', window.LGMDM.undo.undoLastChange);
          li.addEventListener('mouseenter', () => {
            li.style.background = 'var(--border)';
          });
          li.addEventListener('mouseleave', () => {
            li.style.background = 'var(--surface3)';
          });
          list.appendChild(li);
        });
      }

      // Redo stack
      if (history.redo.length > 0) {
        const redoTitle = document.createElement('div');
        redoTitle.textContent = '🔜 Rehacer';
        redoTitle.style.cssText = 'font-weight: 600; margin: 12px 0 4px 0; color: var(--vu-green);';
        list.appendChild(redoTitle);

        history.redo.slice().reverse().forEach(item => {
          const li = document.createElement('div');
          li.style.cssText = `
            padding: 4px 8px;
            background: var(--surface3);
            border-radius: 4px;
            margin-bottom: 4px;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 0.8em;
          `;
          li.textContent = `• ${item.label}`;
          li.addEventListener('click', window.LGMDM.undo.redoLastChange);
          li.addEventListener('mouseenter', () => {
            li.style.background = 'var(--border)';
          });
          li.addEventListener('mouseleave', () => {
            li.style.background = 'var(--surface3)';
          });
          list.appendChild(li);
        });
      }

      if (history.undo.length === 0 && history.redo.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'Sin historial aún';
        empty.style.cssText = 'color: var(--muted); text-align: center; padding: 16px 0;';
        list.appendChild(empty);
      }
    });

    return panel;
  }

  // ── Toggle history panel ──
  window.LGMDM.undo.toggleHistoryPanel = function() {
    const panel = document.getElementById('history-panel') || createHistoryPanel();
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    window.LGMDM?.a11y?.announce?.('Panel de historial ' + (panel.style.display === 'none' ? 'cerrado' : 'abierto'), 'polite');
  };

  // ── Agregar botón al header ──
  function addHistoryToggleButton() {
    const header = document.querySelector('header');
    if (!header) return;

    const historyBtn = document.createElement('button');
    historyBtn.id = 'historyToggleBtn';
    historyBtn.textContent = '⏱️ Historial';
    historyBtn.setAttribute('aria-label', 'Mostrar historial de cambios (Ctrl+H)');
    historyBtn.style.cssText = `
      background: none;
      border: none;
      color: var(--text);
      cursor: pointer;
      padding: 8px 12px;
      font-size: 0.9em;
      font-weight: 500;
      transition: color 0.2s;
    `;
    historyBtn.addEventListener('click', window.LGMDM.undo.toggleHistoryPanel);
    historyBtn.addEventListener('mouseenter', () => {
      historyBtn.style.color = 'var(--accent)';
    });
    historyBtn.addEventListener('mouseleave', () => {
      historyBtn.style.color = 'var(--text)';
    });

    header.appendChild(historyBtn);
  }

  // ── Agregar atajo Ctrl+H para mostrar historial ──
  const originalKeydownHandler = document.onkeydown;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      e.preventDefault();
      window.LGMDM.undo.toggleHistoryPanel();
    }
  });

  // ── Inicializar ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createHistoryPanel();
      addHistoryToggleButton();
    });
  } else {
    createHistoryPanel();
    addHistoryToggleButton();
  }

})();
