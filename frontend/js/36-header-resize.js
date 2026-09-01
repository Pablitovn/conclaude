/* LGMDM — Header Resize
 * Deja que el usuario arrastre el borde inferior del header para
 * cambiar su alto a gusto. Ajusta --lg-shell-header-h en :root,
 * que es la misma variable que ya usan .lg-app y .lg-header
 * (min/max-height) — así ambas quedan siempre sincronizadas.
 *
 * Q11 + Q12 (audit): reescrito para usar el helper compartido
 * LGMDM.ui.makeResizable (00-resize-utility.js) en vez de
 * reimplementar el drag a mano. Beneficios:
 *   - Cleanup correcto de listeners (removeEventListener en onUp)
 *   - No más getComputedStyle en cada onUp — makeResizable
 *     llama options.setSize(next) con el número en px listo.
 *   - Mismo patrón que 35-console-shell.js, código más chico.
 */
(function () {
  'use strict';

  const MIN_H = 40;
  const MAX_H = 140;

  function install() {
    const handle = document.getElementById('headerResizeHandle');
    const header = document.querySelector('.lg-header');
    if (!handle || !header) return;

    const root = document.documentElement;

    function getSize() {
      const val = getComputedStyle(root).getPropertyValue('--lg-shell-header-h').trim();
      const px = parseFloat(val);
      if (!isNaN(px)) return px;
      return header.getBoundingClientRect().height;
    }

    function setSize(next) {
      root.style.setProperty('--lg-shell-header-h', next + 'px');
    }

    function onEnd() {
      // Persistir al final del drag (no en cada onMove).
      const final = getComputedStyle(root).getPropertyValue('--lg-shell-header-h').trim();
      try { window.LGMDM?.storage?.set?.('lgmdm.headerHeight', final); } catch (_) { /* noop */ }
    }

    if (typeof window.LGMDM?.ui?.makeResizable !== 'function') {
      console.warn('36-header-resize: LGMDM.ui.makeResizable no disponible, header no se podrá redimensionar');
      return;
    }

    window.LGMDM.ui.makeResizable(handle, {
      axis: 'y',
      getSize,
      setSize,
      min: MIN_H,
      max: MAX_H,
      onEnd,
    });

    // Restaurar el último alto elegido por el usuario, si hay uno guardado.
    try {
      const saved = window.LGMDM?.storage?.get?.('lgmdm.headerHeight');
      if (saved) root.style.setProperty('--lg-shell-header-h', saved);
    } catch (_) { /* noop */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
