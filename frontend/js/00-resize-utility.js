/* LGMDM — Resize utility (compartida)
 * ------------------------------------------------------------
 * Reemplaza la lógica repetida a mano en 36-header-resize.js,
 * 32-flex-layout.js y 35-console-shell.js (mousedown/mousemove/
 * mouseup + clamp + tocar una var CSS, copiado 3 veces con
 * pequeñas diferencias). Nuevos handles solo necesitan llamar a
 * LGMDM.ui.makeResizable(...) con sus opciones — no reescribir
 * el drag desde cero.
 *
 * No toca los 3 handles existentes (header/sidebar/consola):
 * siguen con su propio código, que ya funciona. Este helper es
 * para TODO lo nuevo que se agregue de acá en adelante.
 */
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  LGMDM.ui = LGMDM.ui || {};

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /**
   * LGMDM.ui.makeResizable(handleEl, options)
   *
   * options:
   *   axis        'x' | 'y'                 — eje que se arrastra (obligatorio)
   *   getSize()   → número actual en px      (obligatorio)
   *   setSize(v)  → aplica el nuevo tamaño    (obligatorio)
   *   min, max    números en px, o funciones () => número (default 100 / 800)
   *   invert      bool — true si arrastrar hacia la izquierda/arriba agranda
   *               (p.ej. un panel anclado a la derecha)
   *   onStart(), onEnd()  callbacks opcionales
   *
   * Devuelve una función destroy() para sacar los listeners si hiciera falta.
   */
  LGMDM.ui.makeResizable = function makeResizable(handleEl, options) {
    if (!handleEl || !options || typeof options.getSize !== 'function' ||
        typeof options.setSize !== 'function' || !options.axis) {
      return function destroy() {};
    }
    const axis = options.axis === 'y' ? 'y' : 'x';
    const invert = !!options.invert;
    const minOf = () => typeof options.min === 'function' ? options.min() : (options.min ?? 100);
    const maxOf = () => typeof options.max === 'function' ? options.max() : (options.max ?? 800);

    let dragging = false;
    let startPos = 0;
    let startSize = 0;

    function pointerPos(e) {
      const p = e.touches ? e.touches[0] : e;
      return axis === 'x' ? p.clientX : p.clientY;
    }

    function onMove(e) {
      if (!dragging) return;
      let delta = pointerPos(e) - startPos;
      if (invert) delta = -delta;
      const next = clamp(startSize + delta, minOf(), maxOf());
      options.setSize(next);
      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      handleEl.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      if (typeof options.onEnd === 'function') options.onEnd();
    }

    function onDown(e) {
      dragging = true;
      handleEl.classList.add('dragging');
      startPos = pointerPos(e);
      startSize = options.getSize();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      if (typeof options.onStart === 'function') options.onStart();
      e.preventDefault();
    }

    handleEl.addEventListener('mousedown', onDown);
    handleEl.addEventListener('touchstart', onDown, { passive: false });

    // Soporte de teclado (accesibilidad: flechas para redimensionar,
    // igual que el sidebarResizeHandle ya hace a mano con tabindex).
    handleEl.addEventListener('keydown', function (e) {
      const step = e.shiftKey ? 40 : 12;
      let delta = 0;
      if (axis === 'x' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        delta = e.key === 'ArrowRight' ? step : -step;
      } else if (axis === 'y' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        delta = e.key === 'ArrowDown' ? step : -step;
      } else {
        return;
      }
      if (invert) delta = -delta;
      const next = clamp(options.getSize() + delta, minOf(), maxOf());
      options.setSize(next);
      e.preventDefault();
    });

    return function destroy() {
      handleEl.removeEventListener('mousedown', onDown);
      handleEl.removeEventListener('touchstart', onDown);
    };
  };
})(window);
