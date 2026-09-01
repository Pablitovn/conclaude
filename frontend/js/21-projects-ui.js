/**
 * 21-projects-ui.js
 * Gestión de proyectos, versiones y exportes en la app de mastering.
 * Permite ver historial de proyectos, descargar exportes, y crear nuevos proyectos.
 */

(function() {
  'use strict';

  const LG = window.LGMDM = window.LGMDM || {};

  // ────────────────────────────────────────────────────────────────────────────
  // State: Proyectos y versiones
  // ────────────────────────────────────────────────────────────────────────────

  const PROJECT_STATE = {
    projects: [],
    currentProject: null,
    loading: false,
    error: null,
  };

  // ────────────────────────────────────────────────────────────────────────────
  // API: Llamadas a backend
  // ────────────────────────────────────────────────────────────────────────────

  const encodePath = (value) => encodeURIComponent(String(value));

  async function apiListProjects() {
    try {
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/projects`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Error listando proyectos:', err);
      return { projects: [] };
    }
  }

  async function apiGetProject(projectId) {
    try {
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/projects/${encodePath(projectId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Error obteniendo proyecto:', err);
      return null;
    }
  }

  async function apiCreateProject(title, artist, metadata) {
    try {
      const params = new URLSearchParams({
        title: title || 'Sin título',
        artist: artist || 'Unknown',
      });
      if (metadata) {
        Object.entries(metadata).forEach(([k, v]) => {
          params.append(k, v);
        });
      }
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/projects?${params}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Error creando proyecto:', err);
      return null;
    }
  }

  async function apiCreateVersion(projectId, versionName, jobId, presetSnapshot) {
    try {
      const params = new URLSearchParams({
        version_name: versionName,
        job_id: jobId || '',
        preset_snapshot: JSON.stringify(presetSnapshot || {}),
      });
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/projects/${encodePath(projectId)}/versions?${params}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Error creando versión:', err);
      return null;
    }
  }

  async function apiListExports(projectId, versionName) {
    try {
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/projects/${encodePath(projectId)}/versions/${encodePath(versionName)}/exports`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('Error listando exportes:', err);
      return { exports: [] };
    }
  }

  async function apiDownloadExport(projectId, versionName, exportId, fileName) {
    try {
      const params = new URLSearchParams({
        name: fileName,
      });
      const url = `${LGMDM.api.apiBase()}/projects/${encodePath(projectId)}/versions/${encodePath(versionName)}/download/${encodePath(exportId)}?${params}`;
      await LGMDM.api.downloadAuthenticated(url, { filename: `${fileName}_${versionName}.wav` });
    } catch (err) {
      console.error('Error descargando exportación:', err);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UI: Render projects list
  // ────────────────────────────────────────────────────────────────────────────

  function renderProjectsList() {
    const container = document.getElementById('projects-list-container');
    if (!container) return;

    if (PROJECT_STATE.projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No hay proyectos aún. Masteriza una canción para crear uno.</p>
        </div>
      `;
      return;
    }

    const html = PROJECT_STATE.projects.map((project) => {
      const projectId = LG.ui.escapeHtml(project.project_id);
      const title = LG.ui.escapeHtml(project.title || 'Sin título');
      const artist = LG.ui.escapeHtml(project.artist || 'Unknown');
      const status = LG.ui.escapeHtml(project.status || 'unknown');
      const versionCount = Number(project.versions?.length || 0);

      return `
        <div class="project-card" data-project-id="${projectId}">
          <div class="project-header">
            <h3>${title}</h3>
            <span class="artist">${artist}</span>
          </div>
          <div class="project-meta">
            <span class="version-count">${versionCount} versiones</span>
            <span class="status ${status}">${status}</span>
          </div>
          <div class="project-actions">
            <button class="btn-view-project" data-project-id="${projectId}">
              Ver detalles
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    // Event listeners
    document.querySelectorAll('.btn-view-project').forEach((btn) => {
      btn.addEventListener('click', () => {
        const projectId = btn.dataset.projectId;
        showProjectDetail(projectId);
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UI: Render project detail
  // ────────────────────────────────────────────────────────────────────────────

  async function showProjectDetail(projectId) {
    PROJECT_STATE.loading = true;
    PROJECT_STATE.currentProject = projectId;

    const project = await apiGetProject(projectId);
    if (!project) {
      alert('No se pudo cargar el proyecto.');
      return;
    }

    const container = document.getElementById('project-detail-container');
    if (!container) return;

    const versionsHtml = (project.versions || []).map((version) => {
      const versionName = LG.ui.escapeHtml(version.version_name || 'Sin versión');
      const versionDate = Number.isFinite(Number(version.created_at))
        ? new Date(Number(version.created_at) * 1000).toLocaleDateString()
        : 'Fecha desconocida';
      const description = version.description ? `<p>${LG.ui.escapeHtml(version.description)}</p>` : '';
      const exportsHtml = (version.exports || []).map((exp) => {
        const exportId = LG.ui.escapeHtml(exp.export_id);
        const format = LG.ui.escapeHtml(exp.format || 'unknown');
        const bitrate = LG.ui.escapeHtml(exp.bitrate || exp.bit_depth || '');
        return `
          <div class="export-item">
            <span class="export-format">${format}</span>
            <span class="export-bitrate">${bitrate}</span>
            <button class="btn-download-export"
                    data-project-id="${LG.ui.escapeHtml(projectId)}"
                    data-version-name="${versionName}"
                    data-export-id="${exportId}">
              Descargar
            </button>
          </div>
        `;
      }).join('');

      return `
        <div class="version-card" data-version-name="${versionName}">
          <div class="version-header">
            <h4>${versionName}</h4>
            <span class="version-date">${LG.ui.escapeHtml(versionDate)}</span>
          </div>
          <div class="version-description">
            ${description}
          </div>
          <div class="exports-list">
            ${exportsHtml}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="project-detail">
        <div class="detail-header">
          <button class="btn-back" id="btn-back-to-list">← Atrás</button>
          <h2>${LG.ui.escapeHtml(project.title || 'Sin título')}</h2>
          <span class="artist">${LG.ui.escapeHtml(project.artist || 'Unknown')}</span>
        </div>
        <div class="detail-body">
          <div class="versions-section">
            <h3>Versiones</h3>
            ${versionsHtml || '<p>No hay versiones aún.</p>'}
          </div>
        </div>
      </div>
    `;

    // Event listeners
    document.getElementById('btn-back-to-list')?.addEventListener('click', () => {
      PROJECT_STATE.currentProject = null;
      loadAndRenderProjects();
    });

    document.querySelectorAll('.btn-download-export').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { projectId, versionName, exportId } = btn.dataset;
        apiDownloadExport(projectId, versionName, exportId, project.title);
      });
    });

    PROJECT_STATE.loading = false;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Load and render
  // ────────────────────────────────────────────────────────────────────────────

  async function loadAndRenderProjects() {
    if (PROJECT_STATE.currentProject) {
      return showProjectDetail(PROJECT_STATE.currentProject);
    }

    PROJECT_STATE.loading = true;
    const data = await apiListProjects();
    PROJECT_STATE.projects = data.projects || [];
    PROJECT_STATE.loading = false;

    renderProjectsList();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', () => {
    const tabProjects = document.querySelector('[data-pane="pane-proyectos"]');
    if (tabProjects) {
      tabProjects.addEventListener('click', loadAndRenderProjects);
    }
  });

  // Export para uso interno
  window.LGMDM.projects = {
    loadAndRenderProjects,
    apiCreateProject,
    apiCreateVersion,
    apiListExports,
    apiDownloadExport,
  };
})();
