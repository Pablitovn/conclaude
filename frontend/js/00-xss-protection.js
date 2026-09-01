// ============================================================
// 00-xss-protection.js — Helpers de sanitización HTML
//
// HISTÓRICO (S3 del audit):
//   Antes este archivo parchaba `Element.prototype.setAttribute`
//   para rechazar URLs que no fueran http/https. Eso era un
//   side-effect global que rompía usos legítimos (mailto:, tel:,
//   anclas internas, etc.) y dependía del orden de carga. El
//   parche se eliminó: ahora `XSSProtection.isSafeUrl` es un
//   helper explícito que los módulos llaman cuando corresponde.
//
// CAMBIOS:
//   - S5: cuando un módulo decida bloquear una URL, el log
//     muestra un hash SHA-256 truncado, no la URL completa
//     (que puede contener tokens o info sensible).
//   - S6: `sanitizeHTML` ahora limpia URLs peligrosas en
//     `href`/`src`/`xlink:href`/`formaction` (javascript:,
//     data: no-imagen, vbscript:, file:), además de scripts
//     y atributos on*.
// ============================================================

(function () {
  "use strict";

  // Esquemas seguros para href/src.
  // - http/https: navegación web estándar.
  // - mailto/tel: comunicación.
  // - #/relative: anclas internas.
  // - blob: URLs de objeto (preview audio).
  // NO se permite: javascript:, data: (excepto imágenes),
  // vbscript:, file:, about:.
  const SAFE_URL_RE = /^(https?:|mailto:|tel:|\/\/|#|\.{0,2}\/)/i;
  const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i;

  // Hash SHA-256 truncado (8 chars) para no loguear URLs con
  // tokens. Usa SubtleCrypto si está disponible, si no un
  // fallback simple.
  async function shortHash(input) {
    const value = String(input ?? '');
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        const arr = Array.from(new Uint8Array(buf));
        return arr.slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) { /* fallback */ }
    let h = 0;
    for (let i = 0; i < value.length; i += 1) h = ((h << 5) - h + value.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).slice(0, 8);
  }

  function isSafeUrl(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (SAFE_URL_RE.test(trimmed)) return true;
    if (SAFE_DATA_IMAGE_RE.test(trimmed)) return true;
    return false;
  }

  // Lista de atributos URL-bearing. Cualquier valor que no pase
  // `isSafeUrl` se remueve (no se reemplaza por "#", porque eso
  // cambia el comportamiento esperado del caller).
  const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'formaction', 'poster', 'action']);

  const XSSProtection = {
    isSafeUrl,
    shortHash,

    // Sanitizar texto para HTML
    sanitize(dirty) {
      if (typeof dirty !== 'string') return '';
      const div = document.createElement('div');
      div.textContent = dirty;
      return div.innerHTML;
    },

    // S6: sanitizeHTML además limpia URLs peligrosas en
    // href/src/xlink:href/formaction/poster/action.
    sanitizeHTML(dirty) {
      if (typeof dirty !== 'string') return '';
      const temp = document.createElement('div');
      temp.innerHTML = dirty;

      // 1) Remover <script> y <style> (este último puede exfiltrar via CSS url()).
      temp.querySelectorAll('script, style').forEach((el) => el.remove());

      // 2) Remover event handlers y URLs peligrosas en TODOS los elementos.
      const all = temp.querySelectorAll('*');
      for (const el of all) {
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (URL_ATTRS.has(name) && !isSafeUrl(attr.value)) {
            // Logueamos el hash, no la URL completa (S5).
            shortHash(attr.value).then((h) => {
              console.warn(`⚠️ URL sospechosa removida (atributo ${name}, hash ${h})`);
            }).catch(() => { /* noop */ });
            el.removeAttribute(attr.name);
          }
        }
      }

      return temp.innerHTML;
    },

    // Escapar HTML entities
    escape(unsafe) {
      return String(unsafe ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },
  };

  window.XSSProtection = XSSProtection;

  // Helper para setHTML seguro. Los módulos que quieran
  // sanitizar antes de asignar innerHTML lo llaman explícito;
  // no se parchea el prototipo.
  window.safeSetInnerHTML = function (element, html, allowUnsafe = false) {
    if (!element) return false;
    if (!allowUnsafe) {
      html = XSSProtection.sanitizeHTML(html);
    }
    element.innerHTML = html;
    return true;
  };

  console.log('✅ XSS Protection cargado (sin parches de prototipo)');
})();
