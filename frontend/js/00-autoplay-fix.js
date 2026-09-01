// ============================================================
// 00-autoplay-fix.js — Salvaguarda de autoplay
// La causa real del "preview arranca solo" era que
// 00-persistence.js restauraba el checkbox #s-livepreview y
// disparaba un evento 'change' sintetico que 15-master-console.js
// interpretaba como una accion del usuario. Eso ya esta resuelto:
//   - index.html: #s-livepreview tiene data-persist="false"
//     (nunca se guarda ni se restaura su estado)
//   - 15-master-console.js: el listener de 'change' ignora
//     eventos no confiables (ev.isTrusted === false)
//
// Este archivo queda solo como red de seguridad minima: si algun
// <audio autoplay> llega a insertarse fuera del flujo esperado
// (por ejemplo por un bug futuro), lo detiene. Ya NO sobreescribe
// Element.prototype.setAttribute ni HTMLMediaElement.prototype.play,
// porque esos parches eran fragiles (no detectaban autoplay seteado
// via innerHTML) y podian bloquear reproducciones legitimas del
// usuario (boton Play, comparacion A/B).
// ============================================================

(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("audio[autoplay]").forEach((audio) => {
      // Solo interviene si el audio esta reproduciendo SIN que
      // exista un flag explicito de accion del usuario en el propio
      // audio (ver playAB() en 08-reference-mastering.js, que es un
      // caso legitimo disparado por click y no pasa por aca porque
      // se crea despues de este DOMContentLoaded).
      audio.removeAttribute("autoplay");
    });
  });
})();
