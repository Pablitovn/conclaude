// ============================================================
// 00-auth.js — Login, registro y panel de admin
// Bloquea el acceso hasta que haya una sesión válida en sessionStorage.
// ============================================================

(function () {
  'use strict';

  const LG = window.LGMDM = window.LGMDM || {};
  const TOKEN_KEY = 'master_auth_token';
  const USER_KEY  = 'master_auth_user';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function clearRetiredSessionKeys() {
    try {
      LGMDM.storage.remove(TOKEN_KEY);
      LGMDM.storage.remove(USER_KEY);
    } catch (_) {}
  }

  function saveSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    clearRetiredSessionKeys();
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    clearRetiredSessionKeys();
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function getUser()  {
    try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  }

  // La autenticación de transporte vive en 00-api.js (apiFetch/authHeaders).
  // ── UI ────────────────────────────────────────────────────────────────────

  function renderAuthOverlay() {
    // index.html ya aporta el contenedor canónico; reutilizarlo evita IDs
    // duplicados y garantiza que el CSS #auth-overlay gobierne el login.
    const div = document.getElementById('auth-overlay') || document.createElement('div');
    div.id = 'auth-overlay';
    div.classList.remove('hidden');
    div.innerHTML = `
      <div class="auth-box">
        <div class="auth-logo">🎚 MASTER Studio</div>
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login">Iniciar sesión</button>
          <button class="auth-tab" id="tab-register">Registrarse</button>
        </div>

        <!-- Login -->
        <div id="form-login" class="auth-form">
          <input type="email" id="login-email" placeholder="Email" autocomplete="email">
          <input type="password" id="login-pwd" placeholder="Contraseña" autocomplete="current-password">
          <button class="auth-submit" id="login-btn">Ingresar</button>
          <div id="login-msg" class="auth-msg lgjs-hidden"></div>
        </div>

        <!-- Registro -->
        <div id="form-register" class="auth-form lgjs-hidden">
          <input type="text" id="reg-name" placeholder="Nombre completo">
          <input type="email" id="reg-email" placeholder="Email" autocomplete="email">
          <input type="password" id="reg-pwd" placeholder="Contraseña (mín. 8 caracteres)" autocomplete="new-password">
          <button class="auth-submit" id="register-btn">Crear cuenta</button>
          <div id="reg-msg" class="auth-msg lgjs-hidden"></div>
        </div>
      </div>
    `;
    if (!div.parentNode) document.body.appendChild(div);
    bindAuthEvents();
  }

  function renderUserBar(user) {
    const name = String(user?.name || user?.email || 'usuario').trim() || 'usuario';
    const headerName = document.getElementById('authHeaderUser');
    const headerLogout = document.getElementById('logoutBtn');

    if (headerName) {
      headerName.textContent = name;
      headerName.title = user?.email ? String(user.email) : name;
    }

    if (headerLogout) {
      const bindOnce = window.LGMDM.ui.bindOnce;
      bindOnce(headerLogout, 'click', () => {
        clearSession();
        location.reload();
      }, 'auth-header-logout');
      return;
    }

    /* Fallback only for older/custom shells that have no integrated header. */
    const bar = document.createElement('div');
    bar.id = 'auth-user-bar';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'auth-user-name';
    nameSpan.textContent = `👤 ${name}`;
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'auth-logout-btn';
    logoutBtn.id = 'logout-btn';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Cerrar sesión';
    bar.append(nameSpan, logoutBtn);
    (document.querySelector('header') || document.body).appendChild(bar);
    const bindOnce = window.LGMDM.ui.bindOnce;
    bindOnce(logoutBtn, 'click', () => {
      clearSession();
      location.reload();
    }, 'auth-userbar-logout');
  }

  function renderAdminButton() {
    const btn = document.createElement('button');
    btn.id = 'admin-panel-btn';
    btn.textContent = '⚙ Admin';
    document.body.appendChild(btn);
    btn.addEventListener('click', openAdminPanel);
  }

  async function openAdminPanel() {
    let overlay = document.getElementById('admin-overlay');
    if (overlay) { overlay.classList.remove('hidden'); loadAdminUsers(); return; }

    overlay = document.createElement('div');
    overlay.id = 'admin-overlay';
    overlay.innerHTML = `
      <div class="admin-box">
        <div class="admin-title">
          <span>⚙ Panel de administración</span>
          <button class="admin-close" id="admin-close-btn">✕</button>
        </div>
        <div id="admin-users-list">Cargando…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
    document.getElementById('admin-close-btn')?.addEventListener('click', () => overlay.classList.add('hidden'));
    loadAdminUsers();
  }

  async function loadAdminUsers() {
    const list = document.getElementById('admin-users-list');
    if (!list) return;
    list.textContent = 'Cargando…';
    try {
      const res = await LGMDM.api.apiFetch(`/auth/admin/users`);
      if (!res.ok) throw new Error(await res.text());
      const users = await res.json();
      if (!users.length) {
        list.innerHTML = '<div class="lgjs-centered-empty">Sin usuarios registrados</div>';
        return;
      }

      list.innerHTML = users.map(u => {
        const id = LG.ui.escapeHtml(String(u.id ?? ''));
        const email = LG.ui.escapeHtml(String(u.email ?? ''));
        const name = LG.ui.escapeHtml(String(u.name ?? ''));
        const status = LG.ui.escapeHtml(String(u.status ?? 'unknown'));
        const role = String(u.role ?? '');
        const statusClass = ['pending', 'approved', 'rejected'].includes(String(u.status)) ? String(u.status) : 'pending';
        return `
        <div class="user-row" data-id="${id}">
          <div class="user-info">
            <div class="user-email">${email}</div>
            <div class="user-name">${name}</div>
          </div>
          <span class="badge badge-${statusClass}">${status}</span>
          ${role === 'admin' ? '<span class="badge badge-admin">admin</span>' : ''}
          <div class="admin-actions">
            ${u.status !== 'approved' ? `<button type="button" class="admin-btn btn-approve" data-action="approve" data-id="${id}">✓ Aprobar</button>` : ''}
            ${u.status !== 'rejected' && role !== 'admin' ? `<button type="button" class="admin-btn btn-reject" data-action="reject" data-id="${id}">✗ Rechazar</button>` : ''}
            ${role !== 'admin' ? `<button type="button" class="admin-btn btn-delete" data-action="delete" data-id="${id}">🗑</button>` : ''}
          </div>
        </div>`;
      }).join('');

      if (!list.dataset.bound) {
        list.dataset.bound = '1';
        list.addEventListener('click', async e => {
          const btn = e.target.closest('[data-action]');
          if (!btn || !list.contains(btn)) return;
          const { action, id } = btn.dataset;
          btn.disabled = true;
          try {
            let res;
            if (action === 'approve') res = await LGMDM.api.apiFetch(`/auth/admin/approve/${encodeURIComponent(id)}`, { method: 'POST' });
            else if (action === 'reject') res = await LGMDM.api.apiFetch(`/auth/admin/reject/${encodeURIComponent(id)}`, { method: 'POST' });
            else if (action === 'delete') {
              if (!confirm('¿Eliminar este usuario?')) { btn.disabled = false; return; }
              res = await LGMDM.api.apiFetch(`/auth/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
            }
            if (!res?.ok) throw new Error(await res?.text());
            await loadAdminUsers();
          } catch (err) {
            alert('Error: ' + err.message);
            btn.disabled = false;
          }
        });
      }
    } catch (err) {
      list.innerHTML = '<div class="auth-msg error"></div>';
      const errorEl = list.firstElementChild;
      if (errorEl) errorEl.textContent = `Error: ${err.message}`;
    }
  }

  function showMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `auth-msg ${type}`;
    el.classList.remove('lgjs-hidden');
  }

  function bindAuthEvents() {
    // Tabs
    document.getElementById('tab-login')?.addEventListener('click', () => {
      document.getElementById('form-login').classList.remove('lgjs-hidden');
      document.getElementById('form-register').classList.add('lgjs-hidden');
      document.getElementById('tab-login').classList.add('active');
      document.getElementById('tab-register').classList.remove('active');
    });
    document.getElementById('tab-register')?.addEventListener('click', () => {
      document.getElementById('form-login').classList.add('lgjs-hidden');
      document.getElementById('form-register').classList.remove('lgjs-hidden');
      document.getElementById('tab-login').classList.remove('active');
      document.getElementById('tab-register').classList.add('active');
    });

    // Login
    const loginBtn = document.getElementById('login-btn');
    async function doLogin() {
      const email = document.getElementById('login-email')?.value?.trim();
      const pwd   = document.getElementById('login-pwd')?.value;
      if (!email || !pwd) { showMsg('login-msg', 'Completá todos los campos', 'error'); return; }
      loginBtn.disabled = true;
      try {
        const res = await LGMDM.api.apiFetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pwd }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error de login');
        saveSession(data.access_token, data.user);
        document.getElementById('auth-overlay').classList.add('hidden');
        onAuthenticated(data.user);
      } catch (err) {
        showMsg('login-msg', err.message, 'error');
      } finally { loginBtn.disabled = false; }
    }
    loginBtn?.addEventListener('click', doLogin);
    document.getElementById('login-pwd')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // Registro
    const regBtn = document.getElementById('register-btn');
    regBtn?.addEventListener('click', async () => {
      const name  = document.getElementById('reg-name')?.value?.trim();
      const email = document.getElementById('reg-email')?.value?.trim();
      const pwd   = document.getElementById('reg-pwd')?.value;
      if (!email || !pwd) { showMsg('reg-msg', 'Completá todos los campos', 'error'); return; }
      regBtn.disabled = true;
      try {
        const res = await LGMDM.api.apiFetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pwd, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Error de registro');
        showMsg('reg-msg', '✓ Cuenta creada. Esperá la aprobación del administrador.', 'success');
        document.getElementById('reg-name').value = '';
        document.getElementById('reg-email').value = '';
        document.getElementById('reg-pwd').value = '';
      } catch (err) {
        showMsg('reg-msg', err.message, 'error');
      } finally { regBtn.disabled = false; }
    });
  }

  function onAuthenticated(user) {
    renderUserBar(user);
    if (user.role === 'admin') renderAdminButton();
    window.dispatchEvent(new CustomEvent('lgmdm:authenticated', { detail: { user } }));
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // El login debe ser visible de inmediato. Nunca dejamos la aplicación
    // en una pantalla vacía mientras se valida una sesión anterior.
    renderAuthOverlay();

    const token = getToken();
    const user  = getUser();

    if (!token || !user) return;

    // Validar una sesión previa sin bloquear visualmente el arranque.
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);

    LGMDM.api.apiFetch('/auth/me', { signal: controller.signal })
      .then(async res => {
        if (res.ok) {
          onAuthenticated(user);
          document.getElementById('auth-overlay')?.classList.add('hidden');
          return;
        }
        clearSession();
      })
      .catch(() => {
        // Backend caído/lento: la pantalla de login ya está visible.
        // Se limpia la sesión vieja para evitar que el siguiente arranque
        // vuelva a quedar esperando una validación imposible.
        clearSession();
      })
      .finally(() => window.clearTimeout(timeoutId));
  }

  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
