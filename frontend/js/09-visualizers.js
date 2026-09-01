// ============================================================
// 09-visualizers.js — FFT, EQ dinámico en vivo, Preview, FFT Web Worker
// ============================================================

// DOM cache centralizado en 00-api.js.
// ── FFT ──────────────────────────────────────────────────────
// ── Visualizador de espectro en tiempo real (streaming chunk a chunk) ─────────
// Recibe el array bands_db (32 bandas log) que viene en metrics.spectrum
// y dibuja un bar graph animado sobre el canvas jobSpectrumCanvas.
// función de más abajo (canvas, dataL, dataR, sampleRate) que dibuja el
// espectro del monitor de entrada en vivo. Al haber DOS declaraciones
// "function drawLiveSpectrum" en el mismo scope global, la segunda
// pisaba a la primera (hoisting), y la llamada de acá (con 1 solo
// argumento, bandsDb) terminaba ejecutando la función equivocada —
// tratando el array bandsDb como si fuera un elemento <canvas>, lo que
// tiraba "canvas.getContext is not a function" cada vez que llegaba
// espectro por streaming durante el render. Se renombra a drawJobSpectrum
// para que ambas funciones convivan sin pisarse.
// ── Dynamic EQ — recomendación en vivo (resonancias / sibilancia) ───────────
// El servidor puede devolver recomendaciones de EQ junto con el análisis completo.
// (ver streaming_engine.py). Se recalcula cada ~6s de audio, no en cada chunk,
// así que comparamos por "summary" para no re-renderizar (y resetear el botón
// "Aplicado") en cada uno de los chunks que repiten la misma detección.
let _lastDynEqRec = null;
let _lastDynEqRecSummary = null;

function renderDynEqRecommendation(rec) {
  if (!rec) return;
  _lastDynEqRec = rec;
  if (rec.summary === _lastDynEqRecSummary) return;
  _lastDynEqRecSummary = rec.summary;

  const wrap = document.getElementById("dynEqRecWrap");
  const body = document.getElementById("dynEqRecBody");
  if (!wrap || !body) return;
  wrap.style.display = "block";

  const resonances = rec.resonances || [];
  const sib = rec.sibilance || {};

  let html = `<div class="lgjs-s-e9520ddd">${LGMDM.ui.escapeHtml(rec.summary || "")}</div>`;

  if (resonances.length) {
    html += `<div class="lgjs-s-a4f22f28"><b>Resonancias detectadas:</b><ul class="lgjs-s-5acdf251">`;
    resonances.slice(0, 4).forEach((r, i) => {
      html += `<li>${Number(r.freq_hz).toFixed(0)} Hz (+${Number(r.excess_db).toFixed(1)} dB)${i === 0 ? ' — <span class="lgjs-s-581bc0b4">se usará para Reso</span>' : ""}</li>`;
    });
    html += `</ul></div>`;
  }

  if (sib.present) {
    html += `<div class="lgjs-s-a4f22f28"><b>Sibilancia:</b> ${Number(sib.band_hz?.[0] ?? 0).toFixed(0)}-${Number(sib.band_hz?.[1] ?? 0).toFixed(0)} Hz, severidad ${Number(sib.severity_db ?? 0).toFixed(1)} dB (${Number(sib.frames_flagged_pct ?? 0).toFixed(1)}% de cuadros)</div>`;
  }

  if (!resonances.length && !sib.present) {
    html += `<div class="lgjs-s-57f9e31d">Sin problemas relevantes detectados en este momento del track.</div>`;
  }

  html += `<div class="lgjs-s-bde49a8d">
    <button id="dynEqApplyBtn" class="lgjs-s-97445a8d">✓ Aplicar a Reso / De-esser</button>
  </div>`;

  body.innerHTML = html;

  const applyBtn = document.getElementById("dynEqApplyBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      if (!_lastDynEqRec || !_lastDynEqRec.recommended_params) return;
      applyPresetToUI(_lastDynEqRec.recommended_params);
      applyBtn.textContent = "✓ Aplicado";
      applyBtn.disabled = true;
    });
  }
}

function hideDynEqRecommendation() {
  const wrap = document.getElementById("dynEqRecWrap");
  if (wrap) wrap.style.display = "none";
  const body = document.getElementById("dynEqRecBody");
  if (body) body.innerHTML = "";
  _lastDynEqRec = null;
  _lastDynEqRecSummary = null;
}

// ── FFT rendering ────────────────────────────────────────────
function drawFFTOnCanvas(canvas, series) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 600,
    cssHeight = 220;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const allDb = series.flatMap((s) => s.data.magnitudes_db);
  const minDb = Math.min(...allDb, -80),
    maxDb = Math.max(...allDb, -10);
  const padL = 36,
    padB = 18,
    padT = 8,
    padR = 8;
  const plotW = cssWidth - padL - padR,
    plotH = cssHeight - padT - padB;
  const theme = themeColors();
  const colorOf = (c) => {
    if (!c) return theme.accent;
    const m = c.match(/var\((--[a-z0-9-]+)\)/);
    return m ? theme.get(m[1]) : c;
  };
  const borderColor = theme.border,
    mutedColor = theme.muted;
  ctx.strokeStyle = borderColor;
  ctx.fillStyle = mutedColor;
  ctx.font = "10px monospace";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const db = maxDb - (i / 4) * (maxDb - minDb);
    const y = padT + (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(Math.round(db) + "dB", 2, y + 3);
  }
  const freqs = series[0].data.frequencies_hz;
  const fMin = Math.max(freqs[0], 20),
    fMax = freqs[freqs.length - 1];
  const xForFreq = (f) =>
    padL + ((Math.log10(f) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin))) * plotW;
  [20, 100, 1000, 10000, 20000].forEach((f) => {
    if (f < fMin || f > fMax) return;
    const x = xForFreq(f);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillText(f >= 1000 ? f / 1000 + "k" : f, x - 8, cssHeight - 4);
  });
  series.forEach((s) => {
    const freqs = s.data.frequencies_hz,
      mags = s.data.magnitudes_db;
    ctx.beginPath();
    ctx.strokeStyle = colorOf(s.color);
    ctx.lineWidth = 2;
    freqs.forEach((f, i) => {
      const x = xForFreq(Math.max(f, fMin));
      const norm = (mags[i] - minDb) / (maxDb - minDb);
      const y = padT + plotH - Math.max(0, Math.min(1, norm)) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  let lx = padL + 6,
    ly = padT + 6;
  series.forEach((s) => {
    ctx.fillStyle = colorOf(s.color);
    ctx.fillRect(lx, ly - 7, 8, 8);
    ctx.fillStyle = mutedColor;
    ctx.fillText(s.label, lx + 12, ly);
    lx += 12 + ctx.measureText(s.label).width + 16;
  });
}

function renderFFT(series) {
  const wrap = document.createElement("div");
  wrap.className = "fft-wrap";
  const legendHtml = series
    .map(
      (s) =>
        `<span style="color:${s.color || "var(--accent)"}">■</span> <span class="lgjs-s-e8faeec7">${s.label}</span>`,
    )
    .join("");
  wrap.innerHTML = `<h3>Spectrum Analyzer (FFT)</h3><canvas></canvas><div class="lgjs-s-acef0958">${legendHtml}</div>`;
  LGMDM.ui.getContent().appendChild(wrap);
  drawFFTOnCanvas(wrap.querySelector("canvas"), series);
}

function renderSpectrum(datasets, labels) {
  const wrap = document.createElement("div");
  wrap.className = "spectrum-wrap";
  const bandNames = {
    sub_bass: "Sub",
    bass: "Bass",
    low_mid: "Lo-Mid",
    mid: "Mid",
    upper_mid: "Hi-Mid",
    presence: "Pres",
    air: "Air",
  };
  const keys = Object.keys(bandNames);
  const FLOOR_DB = -80;
  const clamp = (v) => Math.max(v, FLOOR_DB);
  const allVals = datasets.flatMap((d) => keys.map((k) => clamp(d.spectrum[k] ?? FLOOR_DB)));
  const minV = Math.min(...allVals) - 5,
    maxV = Math.max(...allVals) + 5;
  const norm = (v) => Math.max(0, Math.min(100, ((clamp(v) - minV) / (maxV - minV)) * 100));
  const barsHtml = keys
    .map((k) => {
      const [d0, d1] = datasets;
      const v0 = norm(d0?.spectrum[k] ?? FLOOR_DB);
      const v1 = d1 ? norm(d1.spectrum[k] ?? FLOOR_DB) : null;
      return `<div class="bar-wrap"><div class="bar-track"><div class="bar-before" style="height:${v0}%"></div>${v1 != null ? `<div class="bar-after" style="height:${v1}%"></div>` : ""}</div><div class="bar-label">${bandNames[k]}</div></div>`;
    })
    .join("");
  const legendHtml =
    datasets.length === 2
      ? `<div class="legend"><span class="l-before">Antes</span><span class="l-after">Después</span></div>`
      : `<div class="legend"><span class="l-before">Espectro</span></div>`;
  wrap.innerHTML = `<h3>Espectro por bandas</h3><div class="spectrum-bars">${barsHtml}</div>${legendHtml}`;
  LGMDM.ui.getContent().appendChild(wrap);
}

function metricsHtml(a, b) {
  const rows = [
    [
      "LUFS",
      a.lufs,
      b?.lufs,
      (v) => `${v} LUFS`,
      (v) => (v >= -14 && v <= -8 ? "good" : v >= -18 && v < -14 ? "warn" : "bad"),
    ],
    ["RMS", a.rms_db, b?.rms_db, (v) => `${v} dB`, () => "neutral"],
    ["Peak", a.peak_db, b?.peak_db, (v) => `${v} dBFS`, (v) => (v > -0.5 ? "warn" : "good")],
    [
      "Rango dinámico",
      a.dynamic_range_db,
      b?.dynamic_range_db,
      (v) => `${v} dB`,
      (v) => (v < 6 ? "bad" : v <= 12 ? "good" : "warn"),
    ],
    ["BPM", a.bpm, b?.bpm, (v) => `${v}`, () => "neutral"],
    ["Duración", a.duration_sec, null, (v) => `${v} s`, () => "neutral"],
    ["Sample rate", a.sample_rate, null, (v) => `${v} Hz`, () => "neutral"],
    ["Canales", a.channels, null, (v) => (v === 1 ? "Mono" : "Estéreo"), () => "neutral"],
  ];
  return rows
    .map(
      ([label, va, vb, fmt, cls]) =>
        `<div class="metric-row"><span class="metric-label">${label}</span><span class="metric-value ${cls(va)}">${fmt(va)}${b && vb != null ? ' <span class="delta ' + (vb > va ? "up" : "down") + '">' + (vb > va ? "+" : "") + (vb - va).toFixed(1) + "</span>" : ""}</span></div>`,
    )
    .join("");
}

// ── Análisis perceptual ("oídos" de Laia) ────────────────────────
const PERCEPTUAL_LABELS = {
  clarity: "Claridad",
  dynamic_feel: "Dinámica",
  tonal_balance: "Balance tonal",
  stereo_coherence: "Coherencia estéreo",
  instrumental_definition: "Definición",
  presence_feel: "Presencia",
  mix_cohesion: "Cohesión de mezcla",
  frequency_balance: "Balance de frecuencias",
  headroom_feel: "Headroom",
};

// Qué valor de cada dimensión se considera "problemático" a simple vista
// (colorea la fila en rojo/amarillo); el resto queda neutral (no hay un
// valor objetivamente "malo" — depende del género).
const PERCEPTUAL_BAD_VALUES = {
  clarity: ["muddy", "harsh"],
  stereo_coherence: ["phase_issues"],
  mix_cohesion: ["over_compressed", "disconnected"],
  headroom_feel: ["cramped"],
};
const PERCEPTUAL_WARN_VALUES = {
  presence_feel: ["in_your_face"],
};

function perceptualValueClass(key, value) {
  if (PERCEPTUAL_BAD_VALUES[key]?.includes(value)) return "bad";
  if (PERCEPTUAL_WARN_VALUES[key]?.includes(value)) return "warn";
  return "neutral";
}

function perceptualPanelHtml(a, titleSuffix) {
  if (!a || !a.perceptual) return "";
  const p = a.perceptual;
  const genre = a.genre_detected;
  const genreConf = a.genre_confidence != null ? Math.round(a.genre_confidence * 100) : null;
  const diagnosis = a.perceptual_diagnosis;
  const fatigue = Math.round((p.fatigue_risk ?? 0) * 100);
  const fatigueClass = fatigue >= 70 ? "bad" : fatigue >= 40 ? "warn" : "good";

  const rows = Object.entries(PERCEPTUAL_LABELS)
    .map(([key, label]) => {
      const val = p[key];
      if (val == null || val === "unknown") return "";
      const cls = perceptualValueClass(key, val);
      const text = String(val).replace(/_/g, " ");
      return `<div class="metric-row"><span class="metric-label">${label}</span><span class="metric-value ${cls}">${text}</span></div>`;
    })
    .join("");

  return `
    <div class="analysis-panel perceptual-panel">
      <h3>👂 Cómo suena${titleSuffix ? " " + titleSuffix : ""}</h3>
      ${genre ? `<div class="perceptual-genre"><span class="perceptual-genre-tag">${genre}</span>${genreConf != null ? `<span class="perceptual-genre-conf">${genreConf}% confianza</span>` : ""}</div>` : ""}
      ${diagnosis ? `<p class="perceptual-diagnosis">${diagnosis}</p>` : ""}
      <div class="perceptual-fatigue">
        <span class="metric-label">Riesgo de fatiga</span>
        <div class="perceptual-fatigue-bar">
          <div class="perceptual-fatigue-fill ${fatigueClass}" style="width:${fatigue}%"></div>
        </div>
        <span class="metric-value ${fatigueClass}">${fatigue}%</span>
      </div>
      ${rows}
    </div>`;
}

function renderPerceptualStandalone(a) {
  if (!a || !a.perceptual) return;
  const grid = document.createElement("div");
  grid.className = "analysis-grid";
  grid.innerHTML = perceptualPanelHtml(a);
  LGMDM.ui.getContent().appendChild(grid);
}

function renderAnalysisSingle(a) {
  const grid = document.createElement("div");
  grid.className = "analysis-grid";
  grid.innerHTML = `<div class="analysis-panel"><h3>Métricas del audio</h3>${metricsHtml(a, null)}</div>${perceptualPanelHtml(a)}`;
  const target = document.getElementById("analysisDynamicContent") || LGMDM.ui.getContent();
  target.appendChild(grid);
  renderProfessionalMeter(a);
  renderSpectrum([a], ["before"]);
}

function renderAnalysisComparison(before, after) {
  const grid = document.createElement("div");
  grid.className = "analysis-grid";
  grid.innerHTML = `<div class="analysis-panel"><h3>Antes</h3>${metricsHtml(before, null)}</div><div class="analysis-panel"><h3>Después</h3>${metricsHtml(after, before)}</div>${perceptualPanelHtml(after, "— Después")}`;
  const target = document.getElementById("analysisDynamicContent") || LGMDM.ui.getContent();
  target.appendChild(grid);
  renderProfessionalMeter(after);
  renderSpectrum([before, after], ["before", "after"]);
  if (before.fft_spectrum && after.fft_spectrum) {
    renderFFT([
      { label: "Antes", data: before.fft_spectrum, color: "var(--muted)" },
      { label: "Después", data: after.fft_spectrum, color: "var(--accent)" },
    ]);
  }
}

// ── A/B Player con waveforms superpuestas ────────────────────
const audioState = window.LGMDM.state.audio.visualizers || (window.LGMDM.state.audio.visualizers = { abGain: null, abNode: null, livePlayTime: 0 });
let _abOriginalBuf  = null;   // AudioBuffer del original decodificado
let _abMasterBuf    = null;   // AudioBuffer del master decodificado
let _abMode         = "master";
let _abNode         = null;   // AudioBufferSourceNode activo
let _abStartTime    = 0;      // AudioContext.currentTime cuando arrancó la reproducción
let _abOffset       = 0;      // posición en el buffer al momento de arrancar
let _abPlaying      = false;
let _abGain         = null;   // GainNode para fade suave en el toggle
let _abUiTimer      = null;

// ── Nueva función para dibujar waveforms superpuestas ────────
function drawOverlayWaveforms(originalBuffer, masterBuffer, canvas) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 600,
    H = 120;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const theme = themeColors();
  ctx.fillStyle = theme.surface2;
  ctx.fillRect(0, 0, W, H);

  // Función para dibujar un waveform con un color y opacidad
  function drawBufferWaveform(buffer, color, alpha, label) {
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / W);
    const resolvedColor = color.startsWith("var(") ? theme.get(color.slice(4, -1)) : color;
    ctx.strokeStyle = resolvedColor;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < W; i++) {
      let min = 1,
        max = -1;
      for (let j = 0; j < step; j++) {
        const v = data[i * step + j] || 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const yMin = (1 - (min + 1) / 2) * H,
        yMax = (1 - (max + 1) / 2) * H;
      if (i === 0) ctx.moveTo(i, yMin);
      else ctx.lineTo(i, yMin);
      ctx.lineTo(i, yMax);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Etiqueta en la esquina superior derecha
    ctx.fillStyle = resolvedColor;
    ctx.font = "10px monospace";
    ctx.fillText(label, W - 80, 14);
  }

  if (originalBuffer) drawBufferWaveform(originalBuffer, "var(--muted)", 0.6, "Original");
  if (masterBuffer) drawBufferWaveform(masterBuffer, "var(--accent2)", 0.9, "Master");
}

// ── A/B player existente con integración de waveforms ────────
function _abGetCtx() {
  const ctx = window.LGMDM.audio.getContext();
  if (!_abGain || _abGain.context !== ctx) {
    _abGain = ctx.createGain();
    _abGain.connect(ctx.destination);
  }
  return ctx;
}

function _abCurrentPosition() {
  const ctx = window.LGMDM.state.audio.context;
  if (!_abPlaying || !ctx) return _abOffset;
  return _abOffset + (ctx.currentTime - _abStartTime);
}

function _abStop() {
  if (_abNode) {
    try { _abNode.stop(); } catch(e) {}
    _abNode.disconnect();
    _abNode = null;
  }
  _abPlaying = false;
}

function _abPlay(buf, offset) {
  if (!buf) return;
  const ctx = _abGetCtx();
  if (ctx.state === "suspended") ctx.resume();
  _abStop();
  _abOffset = Math.max(0, Math.min(offset, buf.duration - 0.01));
  _abNode = ctx.createBufferSource();
  _abNode.buffer = buf;
  _abNode.connect(_abGain);
  _abNode.start(0, _abOffset);
  _abStartTime = ctx.currentTime;
  _abPlaying = true;
  _abNode.onended = () => {
    _abPlaying = false;
    _abOffset = 0;
    _updateABUI();
  };
}

function _abSetMode(mode) {
  if (mode !== "master" && mode !== "original") return;
  const pos = _abCurrentPosition();
  _abMode = mode;
  const buf = _abMode === "master" ? _abMasterBuf : _abOriginalBuf;
  if (_abPlaying && buf) {
    _abStop();
    _abPlay(buf, pos);
    const ctx = window.LGMDM.state.audio.context;
    if (_abGain && ctx) {
      _abGain.gain.cancelScheduledValues(ctx.currentTime);
      _abGain.gain.setValueAtTime(1, ctx.currentTime);
    }
  } else {
    _abOffset = buf ? Math.max(0, Math.min(pos, Math.max(0, buf.duration - 0.01))) : pos;
  }
  _updateABUI();
}

function _abToggle() {
  const pos = _abCurrentPosition();
  const ctx = window.LGMDM.state.audio.context;
  _abMode = _abMode === "master" ? "original" : "master";
  const buf = _abMode === "master" ? _abMasterBuf : _abOriginalBuf;
  if (_abPlaying) {
    // Fade out suave 30ms, cambia buffer, fade in — sin corte audible
    if (_abGain) {
      _abGain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      setTimeout(() => {
        _abPlay(buf, pos);
        const currentCtx = window.LGMDM.state.audio.context;
        if (currentCtx) _abGain.gain.setTargetAtTime(1, currentCtx.currentTime, 0.015);
        _updateABUI();
      }, 40);
    } else {
      _abPlay(buf, pos);
      _updateABUI();
    }
  } else {
    _abOffset = pos;
    _updateABUI();
  }
}

function _updateABUI() {
  const isMaster = _abMode === "master";
  const buf = isMaster ? _abMasterBuf : _abOriginalBuf;
  const label = isMaster ? "🎚 Master" : "🎵 Original";
  const toggleLabel = isMaster ? "⇄ Escuchar Original" : "⇄ Escuchar Master";
  const pos = _abCurrentPosition();
  const dur = buf ? buf.duration : 0;
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  const labelEl  = document.getElementById("abLabel");
  const toggleEl = document.getElementById("btnABToggle");
  const barEl    = document.getElementById("abProgressBar");
  const timeEl   = document.getElementById("abTimeReadout");
  const playEl   = document.getElementById("btnABPlay");

  if (labelEl)  labelEl.textContent = label;
  if (labelEl)  labelEl.style.color = isMaster ? "var(--accent)" : "var(--muted)";
  if (toggleEl) toggleEl.textContent = toggleLabel;
  if (barEl)    barEl.style.width = pct.toFixed(1) + "%";
  if (timeEl && dur > 0) {
    const fmt = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
    timeEl.textContent = fmt(pos) + " / " + fmt(dur);
  }
  if (playEl)   playEl.textContent = _abPlaying ? "⏸" : "▶";

  // Actualizar waveform overlay
  const waveformCanvas = document.getElementById("abWaveformCanvas");
  if (waveformCanvas && _abOriginalBuf && _abMasterBuf) {
    drawOverlayWaveforms(_abOriginalBuf, _abMasterBuf, waveformCanvas);
  }
}

window.LGMDM = window.LGMDM || {};
window.LGMDM.ab = window.LGMDM.ab || {};
window.LGMDM.ab.setMode = _abSetMode;

function _renderABPlayer() {
  const wrap = document.getElementById("previewAudioWrap");
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="lgjs-ab-wrap">
      <div class="lgjs-ab-row">
        <span id="abLabel" class="lgjs-ab-label">🎚 Master</span>
        <button id="btnABToggle" class="lgjs-ab-toggle">⇄ Escuchar Original</button>
        <span class="lgjs-ab-meta">toggle sin corte</span>
      </div>
      <div class="lgjs-s-d98eb85f">
        <button id="btnABPlay" class="lgjs-s-e7d3420f">▶</button>
        <button id="btnABStop" class="lgjs-s-7ed332e9">⏹</button>
        <div class="lgjs-s-e5af5485" id="abProgressWrap">
          <div id="abProgressBar" class="lgjs-s-5b664f9d"></div>
        </div>
        <span id="abTimeReadout" class="lgjs-s-cdc6f85e">0:00 / 0:00</span>
      </div>
      <div class="lgjs-s-edd2b65b">
        <canvas id="abWaveformCanvas" class="lgjs-s-13c00b3f"></canvas>
      </div>
    </div>`;

  document.getElementById("btnABToggle")?.addEventListener("click", _abToggle);
  document.getElementById("btnABPlay")?.addEventListener("click", () => {
    if (_abPlaying) {
      _abOffset = _abCurrentPosition();
      _abStop();
    } else {
      const buf = _abMode === "master" ? _abMasterBuf : _abOriginalBuf;
      _abPlay(buf, _abOffset);
    }
    _updateABUI();
  });
  document.getElementById("btnABStop")?.addEventListener("click", () => {
    _abOffset = 0;
    _abStop();
    _updateABUI();
  });
  document.getElementById("abProgressWrap")?.addEventListener("click", (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    const buf  = _abMode === "master" ? _abMasterBuf : _abOriginalBuf;
    if (!buf) return;
    const newPos = pct * buf.duration;
    if (_abPlaying) { _abPlay(buf, newPos); }
    else            { _abOffset = newPos; }
    _updateABUI();
  });

  if (!_abUiTimer) _abUiTimer = setInterval(() => { if (_abPlaying) _updateABUI(); }, 200);
  _updateABUI();
}

async function setupABPlayer(masterBlob) {
  // P6 (audit): antes reconstruía el Blob original desde
  // `cachedFileBuffer` (un ArrayBuffer de hasta 200MB cacheado en
  // 04-file-handling.js:loadFileBuffer). Eso implicaba tener el
  // archivo completo en RAM 2 veces: como File (selectedFile) y
  // como ArrayBuffer (cachedFileBuffer).
  //
  // Ahora usamos `selectedFile` (que YA es un Blob) directamente.
  // `cachedFileBuffer` queda deprecated para este consumer; en un
  // follow-up se puede eliminar completamente.
  if (!selectedFile) return;

  const ctx = _abGetCtx();

  // Decodificar ambos en paralelo. selectedFile.arrayBuffer() es
  // la única copia nueva que necesitamos — decodeAudioData
  // transfiere la propiedad al AudioContext, así que después
  // podemos soltar la referencia.
  const [origAB, masterAB] = await Promise.all([
    selectedFile.arrayBuffer().then(ab => ctx.decodeAudioData(ab)),
    masterBlob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)),
  ]);

  _abOriginalBuf = origAB;
  _abMasterBuf   = masterAB;
  _abMode        = "master";
  _abOffset      = 0;
  _abPlaying     = false;

  _renderABPlayer();
}

function teardownABPlayer() {
  _abStop();
  if (_abUiTimer) { clearInterval(_abUiTimer); _abUiTimer = null; }
  // El contexto es compartido y su ciclo de vida pertenece a 00-audio-engine.js.

  _abOriginalBuf = null;
  _abMasterBuf   = null;
  _abMode = "master";
  _abOffset = 0;
}

// ── Estado y UI del preview ──────────────────────────────────
function setPreviewStatus(text) {
  const el = document.getElementById("previewStatus");
  if (el) el.textContent = text;
  const panel = document.getElementById("previewPanelStatus");
  if (panel) panel.textContent = text;
}
function renderProfessionalMeter(a) {
  if (!a) return;
  const existing = document.querySelector(".professional-meter");
  if (existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.className = "professional-meter";
  const rows = [
    {
      label: "True Peak",
      value: a.true_peak_db,
      unit: "dBTP",
      status: a.true_peak_db > -0.5 ? "bad" : a.true_peak_db > -1.2 ? "warn" : "good",
      hint: "Inter-sample peak real",
    },
    {
      label: "PLR",
      value: a.plr_db,
      unit: "dB",
      status: a.plr_db > 10 ? "good" : a.plr_db > 6 ? "warn" : "bad",
      hint: "Peak-to-Loudness Ratio",
    },
    {
      label: "Dinámica",
      value: a.dynamic_range_db,
      unit: "dB",
      status: a.dynamic_range_db >= 10 ? "good" : a.dynamic_range_db >= 6 ? "warn" : "bad",
      hint: "Rango dinámico global",
    },
    {
      label: "Correlación estéreo",
      value: a.stereo_correlation,
      unit: "",
      status: a.stereo_correlation < 0.85 ? "warn" : "good",
      hint: "L/R total",
    },
    {
      label: "Mono compatibilidad",
      value: a.mono_compatibility_db,
      unit: "dB",
      status: a.mono_compatibility_db < -5 ? "bad" : a.mono_compatibility_db < -3 ? "warn" : "good",
      hint: "Pérdida al sumar L+R",
    },
    {
      label: "Loudness",
      value: a.lufs,
      unit: "LUFS",
      status: a.lufs >= -14 && a.lufs <= -9 ? "good" : a.lufs >= -18 && a.lufs < -14 ? "warn" : "bad",
      hint: "LUFS integrado",
    },
  ];
  const cards = rows
    .map((item) => {
      const suffix = item.unit ? ` ${item.unit}` : "";
      return `<div class="professional-meter-card"><strong>${item.label}</strong><span class="metric-value ${item.status}">${item.value != null ? item.value.toFixed(item.unit === "" ? 3 : 1) + suffix : "--"}</span><em>${item.hint}</em></div>`;
    })
    .join("");
  const warnings = [];
  if (a.true_peak_db != null && a.true_peak_db > -0.5) warnings.push("True peak peligroso: ajustá el ceiling para evitar clipping inter-sample.");
  if (a.mono_compatibility_db != null && a.mono_compatibility_db < -5) warnings.push("Compatibilidad mono baja: el mix puede colapsar al sumarlo a mono.");
  if (a.stereo_correlation != null && a.stereo_correlation < 0.8) warnings.push("Correlación estéreo baja: el paneo o los efectos pueden generar huecos o cancelaciones.");
  if (a.dynamic_range_db != null && a.dynamic_range_db < 6) warnings.push("Dinámica muy comprimida: cuidado con el limiteador para no aplastar el groove.");
  if (a.lufs != null && a.lufs > -9) warnings.push("El loudness ya es alto para streaming, mantené el ceiling conservador.");
  wrap.innerHTML = `
    <h3>Professional Metering</h3>
    <div class="professional-meter-grid">${cards}</div>
    ${warnings.length ? `<div class="professional-meter-warning">${warnings.map((line) => `• ${line}`).join("<br>")}</div>` : ""}
  `;
  LGMDM.ui.getContent().appendChild(wrap);
}





// ── Array de IDs que disparan preview (se usa en 10) ────────
