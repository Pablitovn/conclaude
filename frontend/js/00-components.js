// filepath: js/00-components.js
(function (global) {
  'use strict';
  const LGMDM = global.LGMDM = global.LGMDM || {};
  LGMDM.components = LGMDM.components || {};

  class LgmdmToast extends HTMLElement {
    constructor() {
      super();
      this.classList.add('toast');
      this._removeTimer = null;
      // Q21 (audit): trackear también el timer interno de la animación
      // de cierre, así disconnectedCallback puede limpiarlo y no queda
      // colgando si el toast se desconecta antes de los 300ms.
      this._closeAnimationTimer = null;
    }

    connectedCallback() {
      if (!this.hasAttribute('role')) this.setAttribute('role', 'status');
      this.render();
    }

    // Q21 (audit): si el toast se remueve del DOM (manual o porque
    // cambió el workspace), limpiamos los timers pendientes. Antes
    // quedaban vivos referenciando al elemento, evitando GC.
    disconnectedCallback() {
      if (this._removeTimer) {
        clearTimeout(this._removeTimer);
        this._removeTimer = null;
      }
      if (this._closeAnimationTimer) {
        clearTimeout(this._closeAnimationTimer);
        this._closeAnimationTimer = null;
      }
    }

    render() {
      const type = this.getAttribute('type') || 'info';
      const message = this.getAttribute('message') || '';
      const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ', loading: '⏳' };
      this.className = `toast toast-${type}`;
      this.replaceChildren();
      const icon = document.createElement('span');
      icon.className = `toast-icon toast-icon-${type}`;
      icon.textContent = icons[type] || icons.info;
      const text = document.createElement('span');
      text.className = 'toast-message';
      text.textContent = message;
      this.append(icon, text);
    }

    scheduleRemove(duration) {
      if (this._removeTimer) clearTimeout(this._removeTimer);
      if (this._closeAnimationTimer) clearTimeout(this._closeAnimationTimer);
      if (duration <= 0) return;
      this._removeTimer = setTimeout(() => {
        this._removeTimer = null;
        this.classList.add('toast-closing');
        this._closeAnimationTimer = setTimeout(() => {
          this._closeAnimationTimer = null;
          this.remove();
        }, 300);
      }, duration);
    }
  }

  if (!customElements.get('lgmdm-toast')) customElements.define('lgmdm-toast', LgmdmToast);
  LGMDM.components.Toast = LgmdmToast;
})(window);
