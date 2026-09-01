/* LGMDM — Console Shell
 * Layout controller para el grid de la consola: paneles laterales
 * (plugins disponibles / rack activo), franja de VU, alto de
 * waveform/analizador, y el split Gain Reduction / Laia — todos
 * redimensionables a mano. Además puentea el mini-chat hacia el
 * asistente real (aiPanel/aiInput/aiSend) — no duplica lógica de
 * IA, no simula nada.
 */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /**
   * Handle de resize genérico.
   * root: elemento cuyo CSS custom property se ajusta.
   * cssVar: variable a mutar (siempre en px).
   * axis: 'x' (ancho, drag horizontal) | 'y' (alto, drag vertical).
   * invert: true si arrastrar hacia la izquierda/arriba debe AUMENTAR
   *   el valor (paneles anclados al lado derecho/abajo).
   */
  function setupHandle(handleId, root, cssVar, axis, min, max, invert) {
    const handle = byId(handleId);
    if (!handle || !root) return;

    let dragging = false;
    let start = 0;
    let startSize = 0;

    function currentSize() {
      const val = getComputedStyle(root).getPropertyValue(cssVar).trim();
      return parseFloat(val) || 0;
    }
    function pointerPos(e) {
      const p = e.touches ? e.touches[0] : e;
      return axis === 'x' ? p.clientX : p.clientY;
    }
    function onMove(e) {
      if (!dragging) return;
      let delta = pointerPos(e) - start;
      if (invert) delta = -delta;
      const next = clamp(startSize + delta, min, max);
      root.style.setProperty(cssVar, next + 'px');
      e.preventDefault();
    }
    function onUp() {
      dragging = false;
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    }
    function onDown(e) {
      dragging = true;
      handle.classList.add('dragging');
      start = pointerPos(e);
      startSize = currentSize();
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      e.preventDefault();
    }
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
  }

  function setupAllHandles() {
    const shell = document.querySelector('.cns-shell');
    const console_ = byId('cnsConsole');
    const lower = document.querySelector('.cns-zone-lower');
    if (!shell) return;

    // Paneles laterales (plugins disponibles / rack activo)
    setupHandle('cnsHandleLeft', shell, '--cns-left-w', 'x', 200, 420, false);
    setupHandle('cnsHandleRight', shell, '--cns-right-w', 'x', 220, 420, true);

    // Franja de VU (columna izquierda de la consola)
    if (console_) {
      setupHandle('cnsVHandle', console_, '--cns-vu-w', 'x', 56, 220, false);
      setupHandle('cnsHHandleWave', console_, '--cns-wave-h', 'y', 120, 520, false);
      setupHandle('cnsHHandleAna', console_, '--cns-ana-h', 'y', 80, 400, false);
    }

    // Split Gain Reduction / Laia dentro de la fila inferior
    if (lower) {
      setupHandle('cnsHandleGr', lower, '--cns-gr-w', 'x', 160, 640, false);
    }
  }

  function setupAgentBridge() {
    const quickInput = byId('cnsAgentQuickInput');
    const quickSend = byId('cnsAgentQuickSend');
    const preview = byId('cnsAgentPreview');
    const fab = byId('aiFab');
    const realInput = byId('aiInput');
    const realSend = byId('aiSend');
    const realPanel = byId('aiPanel');
    const realMessages = byId('aiMessages');
    if (!quickInput || !quickSend) return;

    function forward() {
      const text = quickInput.value.trim();
      if (!text || !realInput || !realSend || !fab) return;
      if (realPanel && realPanel.classList.contains('hidden')) fab.click();
      realInput.value = text;
      realInput.dispatchEvent(new Event('input', { bubbles: true }));
      realSend.click();
      quickInput.value = '';
    }
    quickSend.addEventListener('click', forward);
    quickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); forward(); }
    });

    // Espeja el último mensaje del asistente real en la preview de la consola,
    // así el card no queda con el texto fijo apenas hay conversación.
    if (realMessages && preview && 'MutationObserver' in window) {
      const mirror = () => {
        const last = realMessages.lastElementChild;
        const text = last ? last.textContent.trim() : '';
        if (text) preview.textContent = text;
      };
      new MutationObserver(mirror).observe(realMessages, { childList: true, subtree: true });
    }
  }

  function install() {
    if (!document.querySelector('.cns-shell')) return;
    setupAllHandles();
    setupAgentBridge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
