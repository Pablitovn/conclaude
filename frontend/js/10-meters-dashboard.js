(function (global) {
  "use strict";
  const LGMDM = global.LGMDM = global.LGMDM || {};
// ============================================================
// 10-meters-dashboard.js — Dashboard, medidores en vivo, multiband GR/VU, espectrómetro
// ============================================================

// DOM cache centralizado en 00-api.js.
// ── Enlazar eventos de preview ──────────────────────────────
const previewTriggerIds = [
  "s-ingain",
  "s-peak",
  "s-uselufs",
  "s-lufstarget",
  "s-thresh",
  "s-ratio",
  "s-cattack",
  "s-crelease",
  "s-cmakeup",
  "s-comp-link",
  "s-oversample",
  "s-glue-bypass",
  "s-glue-thresh",
  "s-glue-ratio",
  "s-glue-attack",
  "s-glue-release",
  "s-glue-makeup",
  "s-glue-pdr",
  "s-glue-pdr-hold",
  "s-hp",
  "s-air",
  "s-shelf-freq",
  "s-lowshelf",
  "s-lowshelf-freq",
  "s-comp-pdr",
  "s-comp-pdr-hold",
  "s-mb-pdr",
  "s-mb-pdr-hold",
  "s-mscomp-pdr",
  "s-mscomp-pdr-hold",
  "s-mb-sw-lowx",
  "s-mb-sw-highx",
  "s-mb-sw-low",
  "s-mb-sw-mid",
  "s-mb-sw-high",
  "s-eq1freq",
  "s-eq1gain",
  "s-eq1q",
  "s-eq2freq",
  "s-eq2gain",
  "s-eq2q",
  "s-eq3freq",
  "s-eq3gain",
  "s-eq3q",
  "s-eq4freq",
  "s-eq4gain",
  "s-eq4q",
  "s-eq5freq",
  "s-eq5gain",
  "s-eq5q",
  "s-eq6freq",
  "s-eq6gain",
  "s-eq6q",
  "s-tatt",
  "s-tsus",
  "s-satdrive",
  "s-satmode",
  "s-satmix",
  "s-mgain",
  "s-sgain",
  "s-width",
  "s-enhancer",
  "s-haas",
  "s-bassmono",
  "s-rsize",
  "s-rwet",
  "s-ceiling",
  "s-lrelease",
  "s-format",
  "s-mb-lowx",
  "s-mb-highx",
  "s-mb-low-th",
  "s-mb-low-ratio",
  "s-mb-low-att",
  "s-mb-low-rel",
  "s-mb-low-mu",
  "s-mb-mid-th",
  "s-mb-mid-ratio",
  "s-mb-mid-att",
  "s-mb-mid-rel",
  "s-mb-mid-mu",
  "s-mb-high-th",
  "s-mb-high-ratio",
  "s-mb-high-att",
  "s-mb-high-rel",
  "s-mb-high-mu",
  "mb-bypass",
  "s-dyneq-bypass",
  "s-dyneq-freq",
  "s-dyneq-q",
  "s-dyneq-thresh",
  "s-dyneq-ratio",
  "s-dyneq-attack",
  "s-dyneq-release",
  "s-dyneq-maxred",
  "s-reso-bypass",
  "s-reso-freq",
  "s-reso-q",
  "s-reso-thresh",
  "s-reso-ratio",
  "s-reso-attack",
  "s-reso-release",
  "s-reso-maxred",
  "s-mono-freq",
  "s-mono-amount",
  "s-eq-mode",
  "s-lp-taps",
  "s-tonalbal-bypass",
  "s-tonalbal-amount",
  "s-tonalbal-boost",
  "s-tonalbal-cut",
  "s-tonalbal-bands",
  "parallelBypass",
  "parallelMix",
  "parallelThresh",
  "parallelRatio",
  "parallelAttack",
  "parallelRelease",
  "mb-stereo-bypass",
  "s-clip-bypass",
  "s-clip-mode",
  "s-clip-ceiling",
  "s-clip-drive",
  "s-lp-bypass",
  "s-lp-cutoff",
  "s-mseq-bypass",
  "s-mseq-mid-freq",
  "s-mseq-side-freq",
  "s-mscomp-bypass",
  "s-nr-bypass",
  "s-nr-strength",
  "s-nr-noise-sample-sec",
];

previewTriggerIds.forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const evt = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
  const bind = window.LGMDM.ui.bindOnce;
  bind(el, evt, () => window.LGMDM?.previewController?.request?.(), `preview-${evt}`);
});

// ── Dashboard ─────────────────────────────────────────────────
let dashboardWS = null,
  dashboardPollTimer = null;

function renderDashboard(stats) {
  LGMDM.dom.cachedEl("dashCpu").textContent = stats.cpu_percent.toFixed(1) + "%";
  LGMDM.dom.cachedEl("dashCpuBar").style.width = Math.min(100, stats.cpu_percent) + "%";
  LGMDM.dom.cachedEl("dashRam").textContent = stats.ram_percent.toFixed(1) + "%";
  LGMDM.dom.cachedEl("dashRamBar").style.width = Math.min(100, stats.ram_percent) + "%";
  LGMDM.dom.cachedEl("dashQueueTotal").textContent = stats.queue.total;
  LGMDM.dom.cachedEl("dashQueued").textContent = `en cola: ${stats.queue.queued}`;
  LGMDM.dom.cachedEl("dashProcessing").textContent = `procesando: ${stats.queue.processing}`;
  if (stats.active_job) {
    const eta = stats.active_job.eta_sec;
    LGMDM.dom.cachedEl("dashEta").textContent = eta != null ? `~${eta}s restante` : "Procesando…";
    LGMDM.dom.cachedEl("dashActiveFile").textContent = stats.active_job.filename || "";
  } else {
    LGMDM.dom.cachedEl("dashEta").textContent = "Inactivo";
    LGMDM.dom.cachedEl("dashActiveFile").textContent = "";
  }
}

function startDashboardPolling() {
  stopDashboard();
  dashboardPollTimer = setInterval(async () => {
    try {
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/dashboard`);
      if (!res.ok) return;
      renderDashboard(await res.json());
    } catch (e) {}
  }, 5000);
}

function stopDashboard() {
  if (dashboardWS) {
    try {
      dashboardWS.close();
    } catch (e) {}
    dashboardWS = null;
  }
  if (dashboardPollTimer) {
    clearInterval(dashboardPollTimer);
    dashboardPollTimer = null;
  }
}

async function startDashboard() {
  stopDashboard();
  if (!LGMDM.api.authToken?.()) return;

  // V3: el dashboard usa polling por defecto. El endpoint WebSocket puede
  // estar ausente o ser cerrado por instalaciones/backend que no exponen
  // /ws/dashboard. Evitamos abrir una conexión que sabemos que terminaría
  // en un error de consola y mantenemos el panel funcional cada 5 s.
  const wrap = document.getElementById('dashboardWrap');
  const wsEnabled = wrap?.dataset?.dashboardWebsocket === 'true';
  if (!wsEnabled) {
    startDashboardPolling();
    return;
  }

  try {
    const wsUrl = await LGMDM.api.wsAuthUrl('/ws/dashboard');
    dashboardWS = new WebSocket(wsUrl);
    dashboardWS.onmessage = (ev) => {
      try {
        renderDashboard(JSON.parse(ev.data));
      } catch (e) {}
    };
    dashboardWS.onerror = () => {
      stopDashboard();
      startDashboardPolling();
    };
    dashboardWS.onclose = () => {
      if (!dashboardPollTimer) startDashboardPolling();
    };
  } catch (e) {
    startDashboardPolling();
  }
}

const dashboardBindOnce = window.LGMDM.ui.bindOnce;
dashboardBindOnce(LGMDM.dom.cachedEl('dashToggle'), 'click', () => {
  const body = LGMDM.dom.cachedEl("dashboardBody");
  const hidden = body.style.display === "none";
  body.style.display = hidden ? "block" : "none";
  LGMDM.dom.cachedEl("dashToggle").textContent = hidden ? "ocultar" : "mostrar";
}, 'dashboard-toggle');
dashboardBindOnce(window, 'lgmdm:authenticated', startDashboard, 'dashboard-authenticated');
startDashboard();

// ── Metrics Store → meters principales ───────────────────────
(function () {
  const store = window.LGMDM?.metrics;
  if (!store?.subscribe) return;
  const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  const fill = (id, value, floor, ceiling = 0) => {
    const el = document.getElementById(id);
    if (!el) return;
    const n = Number(value);
    el.style.width = `${clamp01((n - floor) / (ceiling - floor)) * 100}%`;
  };
  const text = (id, value, suffix = '') => {
    const el = document.getElementById(id);
    if (!el) return;
    const n = Number(value);
    el.textContent = Number.isFinite(n) ? `${n.toFixed(1)}${suffix}` : `-∞${suffix}`;
  };
  const update = ({ metrics }) => {
    const m = metrics || {};
    const peak = Number(m.peak_db);
    const rms = Number(m.rms_db);
    const lufs = Number(m.lufs_momentary ?? m.lufs);
    const truePeak = Number(m.true_peak_db);
    const corr = Number(m.stereo_correlation);
    const mono = Number(m.mono_compatibility_db);
    fill('meterPeakFill', peak, -60, 0);
    fill('meterRmsFill', rms, -60, 0);
    fill('meterLufsFill', lufs, -40, 0);
    fill('meterTruePeakFill', truePeak, -60, 0);
    text('meterPeakReadout', peak, ' dB');
    text('meterRmsReadout', rms, ' dB');
    text('meterLufsReadout', lufs, ' LUFS');
    text('meterTruePeakReadout', truePeak, ' dBTP');
    const stereoFill = document.getElementById('stereoMeterFill');
    if (stereoFill && Number.isFinite(corr)) {
      stereoFill.style.width = `${clamp01((corr + 1) / 2) * 100}%`;
    }
    if (Number.isFinite(corr)) {
      const el = document.getElementById('stereoMeterReadout');
      if (el) el.textContent = `corr: ${corr.toFixed(2)}`;
    }
    if (Number.isFinite(mono)) {
      const el = document.getElementById('monoCompatReadout');
      if (el) el.textContent = `mono: ${mono.toFixed(1)} dB`;
    }
    const bands = Array.isArray(m.spectrum) ? m.spectrum : [];
    const bandIds = ['sub','bass','lowmid','mid','highmid','air'];
    bandIds.forEach((id, i) => {
      const v = Number(bands[i]);
      const bar = document.getElementById(`fb-${id}`);
      const read = document.getElementById(`fbv-${id}`);
      if (bar && Number.isFinite(v)) bar.style.width = `${clamp01((v + 80) / 80) * 100}%`;
      if (read && Number.isFinite(v)) read.textContent = `${v.toFixed(0)} dB`;
    });

    // ── Reducción de ganancia multibanda + dinámica/paralela/glue ──────────
    // BUGFIX: este panel (#mbGrSection) tenía class="hidden-panel" fija en el
    // HTML y ninguna función lo alimentaba ni lo mostraba — quedaba muerto
    // pese a que el backend sí manda mb_meters/comp_meters/glue_meters/
    // parallel_meters en cada frame del preview en vivo.
    const mb = m.mb_meters || {};
    const compM = m.comp_meters || {};
    const glueM = m.glue_meters || {};
    const parM = m.parallel_meters || {};
    const hasGrData = [mb.low_gr_db, mb.mid_gr_db, mb.high_gr_db, compM.gr_db].some(Number.isFinite);
    const grSection = document.getElementById('mbGrSection');
    if (grSection && hasGrData) grSection.classList.remove('hidden-panel');

    const grBar = (barId, readId, grDb, { bypassLabel } = {}) => {
      const bar = document.getElementById(barId);
      const read = document.getElementById(readId);
      const v = Number(grDb);
      // gr_db en el backend es magnitud de reducción (0 = sin reducir, más
      // negativo/positivo = más reducción según el stage) — normalizamos a
      // "cuánto se comió" en dB positivos para la barra, tope visual 18dB.
      const reducedDb = Number.isFinite(v) ? Math.abs(v) : 0;
      if (bar) bar.style.width = `${clamp01(reducedDb / 18) * 100}%`;
      if (read) read.textContent = Number.isFinite(v) ? `${reducedDb.toFixed(1)} dB` : (bypassLabel || '0.0 dB');
    };
    grBar('grBarLow', 'grReadLow', mb.low_gr_db);
    grBar('grBarMid', 'grReadMid', mb.mid_gr_db);
    grBar('grBarHigh', 'grReadHigh', mb.high_gr_db);
    grBar('grBarComp', 'grReadComp', compM.gr_db);
    grBar('grBarGlue', 'grReadGlue', glueM.bypass ? null : glueM.gr_db, { bypassLabel: 'bypass' });
    grBar('grBarParallel', 'grReadParallel', parM.bypass ? null : parM.gr_db, { bypassLabel: 'bypass' });
  };
  store.subscribe(update);
})();

// ── Live Meters ──────────────────────────────────────────────
function teardownLiveMeters() {
  if (metersRafId) {
    cancelAnimationFrame(metersRafId);
    metersRafId = null;
  }
  if (metersSourceNode) {
    try {
      metersSourceNode.stop();
    } catch (e) {}
    metersSourceNode = null;
  }
  if (metersAudioCtx) {
    try {
      metersAudioCtx.close();
    } catch (e) {}
    metersAudioCtx = null;
  }
}


  LGMDM.meters = LGMDM.meters || {};
  LGMDM.meters.stopDashboard = stopDashboard;
  LGMDM.meters.teardownLiveMeters = teardownLiveMeters;
})(window);
