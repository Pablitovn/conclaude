// ============================================================
// 00-dom-safety.js — Acceso seguro al DOM bajo LGMDM.dom
//
// Q3 (audit): este archivo ahora también expone los helpers
// que vivían en 00-helpers.js (value/checked/text/setValue/
// parse/stringify/isMobile/isTablet/isDesktop). El archivo
// 00-helpers.js se va a borrar — el namespace `dom.helpers`
// nunca se usó en el proyecto, solo el `LGMDM.dom.byId` /
// `requireById` que ya vivía acá.
// ============================================================
(function (global) {
  'use strict';
  const LG = global.LGMDM = global.LGMDM || {};
  const dom = LG.dom = LG.dom || {};

  const api = {
    byId(id) { return typeof id === 'string' && id ? document.getElementById(id) : null; },
    requireById(id, owner = 'LGMDM') {
      const el = this.byId(id);
      if (!el) {
        const error = new Error(`[LGMDM DOM CONTRACT] ${owner}: required element #${id} is missing`);
        console.error(error);
        throw error;
      }
      return el;
    },
    query(selector, parent = document) {
      if (!selector || !parent) return null;
      try { return parent.querySelector(selector); } catch (_) { return null; }
    },
    queryAll(selector, parent = document) {
      if (!selector || !parent) return [];
      try { return Array.from(parent.querySelectorAll(selector)); } catch (_) { return []; }
    },
    setValue(selector, value, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.value = value; return true; },
    getText(selector, parent = document) { return this.query(selector, parent)?.textContent || ''; },
    setText(selector, text, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.textContent = text; return true; },
    addClass(selector, className, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.classList.add(className); return true; },
    removeClass(selector, className, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.classList.remove(className); return true; },
    toggleClass(selector, className, force, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.classList.toggle(className, force); return true; },
    getAttribute(selector, attr, parent = document) { return this.query(selector, parent)?.getAttribute(attr) || ''; },
    setAttribute(selector, attr, value, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.setAttribute(attr, value); return true; },
    on(selector, event, handler, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.addEventListener(event, handler); return true; },
    off(selector, event, handler, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.removeEventListener(event, handler); return true; },
    click(selector, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.click(); return true; },
    focus(selector, parent = document) { const el = this.query(selector, parent); if (!el) return false; el.focus(); return true; },
    batch(fn) {
      if (typeof fn !== 'function') return undefined;
      return document.startViewTransition ? document.startViewTransition(fn) : fn();
    },

    // Q3 (audit): absorbidos de 00-helpers.js. Helpers chiquitos
    // para evitar el `document.getElementById(...)?.value ?? default`
    // repetido por todos lados.
    value(id, defaultVal = '') { return this.byId(id)?.value ?? defaultVal; },
    checked(id, defaultVal = false) { return this.byId(id)?.checked ?? defaultVal; },
    text(id, defaultVal = '') { return this.byId(id)?.textContent ?? defaultVal; },
    setInputValue(id, value) {
      const el = this.byId(id);
      if (!el) return false;
      el.value = String(value);
      return true;
    },
    parse(json, defaultVal = null) {
      try { return JSON.parse(json); } catch (_) { return defaultVal; }
    },
    stringify(obj, defaultVal = '{}') {
      try { return JSON.stringify(obj); } catch (_) { return defaultVal; }
    },
    isMobile() { return global.innerWidth < 600; },
    isTablet() { return global.innerWidth >= 600 && global.innerWidth < 960; },
    isDesktop() { return global.innerWidth >= 960; },
  };
  Object.assign(dom, api);
})(window);
