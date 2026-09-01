// ============================================================
// 00-no-autoplay.js — Bloqueo de autoplay no solicitado
//
// HISTÓRICO (S3/S4 del audit):
//   Antes este archivo parchaba:
//     - `document.createElement` para que los <audio> creados
//       no pudieran tener `autoplay`.
//     - `Element.prototype.innerHTML` para remover el atributo
//       `autoplay` de cualquier HTML string asignado.
//     - `Element.prototype.setAttribute` para rechazar
//       setAttribute('autoplay', ...).
//   Esos 3 parches globales eran FRÁGILES: cualquier librería
//   que asumiera semántica nativa de esos prototipos (incluida
//   la propia 00-persistence.js al rehidratar formularios)
//   podía tener side-effects raros.
//
// QUEDA:
//   - Un único MutationObserver acotado a `document.body` que
//     observa solo `addedNodes` (sin `subtree`), en una sola
//     pasada al DOMContentLoaded. Mucho más barato y sin
//     tocar prototipos.
// ============================================================

(function () {
  "use strict";

  function stripAutoplay(root) {
    if (!root) return;
    if (root.tagName === 'AUDIO' && root.hasAttribute('autoplay')) {
      root.removeAttribute('autoplay');
      try { root.pause(); } catch (_) { /* noop */ }
    }
    if (root.querySelectorAll) {
      root.querySelectorAll('audio[autoplay]').forEach((audio) => {
        audio.removeAttribute('autoplay');
        try { audio.pause(); } catch (_) { /* noop */ }
      });
    }
  }

  function init() {
    stripAutoplay(document);
  }

  // 1) Limpieza inicial apenas el DOM está listo.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // 2) Cleanup reactivo a nuevos <audio> insertados. Se observa
  // `document` (no `document.body`) solo con `childList` (sin
  // `subtree`) para que el costo sea proporcional a las
  // inserciones top-level, no a cada mutación interna.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        stripAutoplay(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true });
})();
