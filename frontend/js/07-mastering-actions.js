// ============================================================
// 07-mastering-actions.js — Master, Auto-Mastering IA, Analyze, Advice, Spectrum, Stems, Polling
// ============================================================

// Q6 (audit): pollInterval vivía como `var` global y colisionaba con
// el de 08-reference-mastering.js en hot-reload. Lo movimos a un
// namespace por módulo bajo LGMDM.polling. Cada módulo tiene el
// suyo, sin colisión.
window.LGMDM = window.LGMDM || {};
window.LGMDM.polling = window.LGMDM.polling || {};
window.LGMDM.polling.master = null;

// ── MASTER ────────────────────────────────────────────────────
async function submitMasterJob() {
  LGMDM.ui.clearResults();
  LGMDM.ui.showStatus(null, "Enviando archivo…", "queued");
  document.getElementById("btnMaster")?.setAttribute("disabled", "");

  const fd = new FormData();
  if (_previewLibraryId) {
    fd.append("library_id", _previewLibraryId);
  } else {
    fd.append("file", selectedFile);
  }

  try {
    const params = buildParams();
    const url = `${LGMDM.api.apiBase()}/master?${params.toString()}`;
    console.log("📤 Enviando a:", url);
    console.log("📁 Archivo:", selectedFile.name, selectedFile.size, "bytes");
    const res = await LGMDM.api.apiFetch(url, { method: "POST", body: fd });
    console.log("📥 Respuesta:", res.status, res.statusText);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    currentJobId = data.job_id;
    LGMDM.ui.showStatus(null, `Job ${currentJobId.slice(0, 8)}… en cola`, "queued");
    startPolling(currentJobId);
  } catch (e) {
    console.error("❌ Error al enviar:", e);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
    document.getElementById("btnMaster")?.removeAttribute("disabled");
  }
}

document.getElementById("btnMaster")?.addEventListener("click", () => {
  if (!selectedFile) {
    LGMDM.ui.showStatus(null, "Selecciona un archivo primero", "error");
    return;
  }
  LGMDM.ui.clearResults();
  const paramsObj = collectMasterParamsObj();
  window.LGMDM.params.renderPreview(paramsObj, { onConfirm: submitMasterJob });
});

document.getElementById("btnMasterAsync")?.addEventListener("click", () => {
  document.getElementById("btnMaster").click();
});

async function submitMasterSync() {
  if (!selectedFile) {
    LGMDM.ui.showStatus(null, "Selecciona un archivo primero", "error");
    return;
  }
  LGMDM.ui.clearResults();
  LGMDM.ui.showStatus(null, "Procesando (sync)…", "processing");
  const fd = new FormData();
  if (_previewLibraryId) fd.append("library_id", _previewLibraryId);
  else fd.append("file", selectedFile);
  try {
    const params = buildParams();
    const url = `${LGMDM.api.apiBase()}/master/sync?${params.toString()}`;
    const res = await LGMDM.api.apiFetch(url, { method: "POST", body: fd });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const blob = await res.blob();
    let filename = "mastered.wav";
    const cd = res.headers.get("content-disposition");
    if (cd) {
      const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename=\"?([^\";]+)\"?/);
      if (m) filename = decodeURIComponent(m[1]);
    }
    const link = document.createElement("a");
    const masterObjUrl = URL.createObjectURL(blob);
    link.href = masterObjUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(masterObjUrl), 1500);
    LGMDM.ui.showStatus(null, "Master sync completado ✓", "done");
  } catch (e) {
    console.error("Error en master sync:", e);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
  }
}

document.getElementById("btnMasterSync")?.addEventListener("click", async () => {
  if (!selectedFile) {
    LGMDM.ui.showStatus(null, "Selecciona un archivo primero", "error");
    return;
  }
  LGMDM.ui.clearResults();
  const paramsObj = collectMasterParamsObj();
  window.LGMDM.params.renderPreview(paramsObj, { onConfirm: submitMasterSync, confirmLabel: "Master (descarga)" });
});

// ── AUTO-MASTERING IA ────────────────────────────────────────
document.getElementById("btnAutoMaster")?.addEventListener("click", async () => {
  if (!selectedFile) {
    LGMDM.ui.showStatus(null, "Selecciona un archivo primero", "error");
    return;
  }
  LGMDM.ui.clearResults();
  LGMDM.ui.showStatus(null, "🤖 La IA está analizando tu track…", "processing");
  const autoBtn = document.getElementById("btnAutoMaster");
  const masterBtn = document.getElementById("btnMaster");
  autoBtn.disabled = true;
  if (masterBtn) masterBtn.disabled = true;

  const panel = LGMDM.dom.requireById("aiPanel", "07-mastering-actions:auto-master");
  if (!panel.classList.contains("open")) panel.classList.add("open");
  LGMDM.dom.requireById("aiSuggestions", "07-mastering-actions:auto-master").replaceChildren();
  aiShowTyping();

  const fd = new FormData();
  fd.append("file", selectedFile);
  try {
    const fmt = document.getElementById("s-format") ? document.getElementById("s-format").value : "wav";
    const params = new URLSearchParams({ output_format: fmt });
    const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/ai/auto-master?${params}`, { method: "POST", body: fd });
    aiHideTyping();
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    currentJobId = data.job_id;
    window.LGMDM.ai.setContext(data.analysis);

    const d = data.ai_decision || {};
    const platformLabel = d.platform ? d.platform : "sin target específico";
    aiAppendMessage(
      "assistant",
      `🤖 Auto-Mastering en marcha — la IA calculó los parámetros a medida de este track (no usó un preset fijo).\nPlataforma: ${platformLabel}` +
        (d.reasoning ? `\n\n${d.reasoning}` : ""),
    );
    const { platform, reasoning, ...aiParams } = d;
    if (Object.keys(aiParams).length) {
      window.LGMDM.params.renderPreview(aiParams, {
        readOnly: true,
        title: "🤖 Parámetros calculados por la IA para este track",
      });
    }

    LGMDM.ui.showStatus(null, `IA calculó los parámetros — procesando…`, "queued");
    startPolling(currentJobId);
  } catch (e) {
    aiHideTyping();
    console.error("Error en auto-master IA:", e);
    aiAppendNote("Error en el auto-mastering: " + e.message);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
  } finally {
    autoBtn.disabled = false;
    if (masterBtn) masterBtn.disabled = false;
  }
});

// ── SUGERIR CON IA ───────────────────────────────────────────
document.getElementById("btnAiSuggest")?.addEventListener("click", async () => {
  if (!selectedFile) {
    LGMDM.ui.showStatus(null, "Selecciona un archivo primero", "error");
    return;
  }
  LGMDM.ui.clearResults();
  LGMDM.ui.showStatus(null, "🤖 La IA está analizando tu track…", "processing");
  const suggestBtn = document.getElementById("btnAiSuggest");
  const autoBtn2 = document.getElementById("btnAutoMaster");
  const masterBtn2 = document.getElementById("btnMaster");
  suggestBtn.disabled = true;
  autoBtn2.disabled = true;
  if (masterBtn2) masterBtn2.disabled = true;

  const panel2 = LGMDM.dom.requireById("aiPanel", "07-mastering-actions:ai-suggest");
  if (!panel2.classList.contains("open")) panel2.classList.add("open");
  LGMDM.dom.requireById("aiSuggestions", "07-mastering-actions:ai-suggest").replaceChildren();
  aiShowTyping();

  const fd2 = new FormData();
  if (_previewLibraryId) {
    fd2.append("library_id", _previewLibraryId);
  } else {
    fd2.append("file", selectedFile);
  }
  try {
    const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/ai/suggest`, { method: "POST", body: fd2 });
    aiHideTyping();
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    window.LGMDM.ai.setContext(data.analysis);

    const d = data.ai_decision || {};
    const platformLabel = d.platform ? d.platform : "sin target específico";
    aiAppendMessage(
      "assistant",
      `🤖 Analicé el track y armé una propuesta de cadena a medida (no un preset fijo).\nPlataforma: ${platformLabel}\n\nCargué los parámetros en los controles — escuchá el preview, ajustá lo que quieras, y confirmá cuando estés conforme.` +
        (d.reasoning ? `\n\n${d.reasoning}` : ""),
    );

    const { platform, reasoning, ...aiParams } = d;
    if (Object.keys(aiParams).length) {
      applyPresetToUI(aiParams);
      document.querySelectorAll(".preset-btn.active").forEach((b) => b.classList.remove("active"));
      activePreset = null;
      window.LGMDM.params.renderPreview(aiParams, {
        title: "🤖 Parámetros sugeridos por la IA — revisá y confirmá para masterizar",
        confirmLabel: "✅ Confirmar y masterizar",
        onConfirm: submitMasterJob,
      });
    }
    LGMDM.ui.showStatus(null, "Parámetros cargados — revisá y confirmá cuando quieras", "done");
  } catch (e) {
    aiHideTyping();
    console.error("Error en /ai/suggest:", e);
    aiAppendNote("Error al pedir la sugerencia de la IA: " + e.message);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
  } finally {
    suggestBtn.disabled = false;
    autoBtn2.disabled = false;
    if (masterBtn2) masterBtn2.disabled = false;
  }
});

// ── ANALYZE ──────────────────────────────────────────────────
async function _handleAnalyzeClick() {
  try {
    const data = await LGMDM.analysis.request();
    if (!data) return;
    window.LGMDM.workspace?.setWorkspace?.("analysis");
  } catch (e) {
    console.error("Error en análisis server-side:", e);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
  }
}
["btnAnalyze", "btnAnalyzeGrid"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", _handleAnalyzeClick);
});

// ── ADVICE ────────────────────────────────────────────────────
async function _handleAdviceClick() {
  if (!selectedFile) return;
  LGMDM.ui.clearResults();
  LGMDM.ui.showStatus(null, "Analizando mezcla…", "processing");
  const fd = new FormData();
  fd.append("file", selectedFile);
  try {
    const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/mix-advice`, { method: "POST", body: fd });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    LGMDM.ui.showStatus(null, "Evaluación completada", "done");
    if (data.analysis?.lufs != null) showLoudnessMeter(data.analysis.lufs);
    LGMDM.reference.renderAdvicePanel(data, "Evaluación de la mezcla");
    renderPerceptualStandalone(data.analysis);
    if (data.analysis?.fft_spectrum) renderFFT([{ label: "Espectro", data: data.analysis.fft_spectrum }]);
    if (data.analysis)
      window.LGMDM.ai.setContext({ ...data.analysis, mix_advice: { issues: data.issues, tips: data.tips, score: data.score } });
    window.LGMDM?.workspace?.setWorkspace?.("analysis");
  } catch (e) {
    console.error("Error en consejos:", e);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
  }
}
["btnAdvice", "btnAdviceGrid"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", _handleAdviceClick);
});

// ── SPECTRUM ──────────────────────────────────────────────────
document.getElementById("btnSpectrum")?.addEventListener("click", async () => {
  if (!selectedFile) return;
  LGMDM.ui.clearResults();
  LGMDM.ui.showStatus(null, "Calculando FFT…", "processing");
  const fd = new FormData();
  fd.append("file", selectedFile);
  try {
    const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/spectrum?n_fft=4096&n_bins=96`, { method: "POST", body: fd });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    LGMDM.ui.showStatus(null, "Spectrum listo", "done");
    renderFFT([{ label: "Espectro", data }]);
    window.LGMDM?.workspace?.setWorkspace?.("analysis");
  } catch (e) {
    console.error("Error en spectrum:", e);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
  }
});

// ── STEM SEPARATION ──────────────────────────────────────────
document.getElementById("btnStems").addEventListener("click", async () => {
  if (!selectedFile) return;
  LGMDM.ui.clearResults();
  LGMDM.ui.showStatus(null, "Separando en stems…", "processing", 0, "En cola…");
  document.getElementById("btnStems").disabled = true;
  const fd = new FormData();
  fd.append("file", selectedFile);
  const stemsMode = document.getElementById("s-stems-mode")?.value || "demucs_4stem";
  fd.append("mode", stemsMode);
  try {
    const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/stems/separate`, { method: "POST", body: fd });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const data = await res.json();
    pollStemsJob(data.job_id);
  } catch (e) {
    console.error("Error separando stems:", e);
    LGMDM.ui.showStatus(null, "Error: " + e.message, "error");
    document.getElementById("btnStems").disabled = false;
  }
});

function pollStemsJob(jobId) {
  const interval = setInterval(async () => {
    try {
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/job/${jobId}`);
      const data = await res.json();
      if (data.status === "queued" || data.status === "processing") {
        LGMDM.ui.showStatus(null, "Separando stems…", "processing", data.progress, data.stage);
      } else if (data.status === "done") {
        clearInterval(interval);
        LGMDM.ui.showStatus(null, "Stems listos ✓", "done");
        document.getElementById("btnStems").disabled = false;
        renderStemsPanel(data.stem_analysis, jobId, data.available_stems || []);
      } else if (data.status === "error") {
        clearInterval(interval);
        LGMDM.ui.showStatus(null, "Error: " + data.error, "error");
        document.getElementById("btnStems").disabled = false;
      }
    } catch (e) {
      console.error("Poll stems error:", e);
    }
  }, 1500);
}

let stemDownloadBound = false;

function renderStemsPanel(stemAnalysis, jobId, availableStems) {
  // Delegación para descargas autenticadas de stems.
  if (!stemDownloadBound) {
    stemDownloadBound = true;
    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest?.("[data-stem-download]");
      if (!btn) return;
      ev.preventDefault();
      const job = btn.dataset.stemDownload;
      const stem = btn.dataset.stemName;
      try {
        btn.disabled = true;
        await LGMDM.api.downloadAuthenticated(`${LGMDM.api.apiBase()}/stems/download/${encodeURIComponent(job)}/${encodeURIComponent(stem)}`, { filename: `${stem}.wav` });
      } catch (e) {
        if (typeof handleClientError === "function") handleClientError(e, "No se pudo descargar el stem.", { context: "stem-download" });
        else window.LGMDM.ui.showToast?.(e.message || "No se pudo descargar el stem.", "error");
      } finally { btn.disabled = false; }
    });
  }
  if (!stemAnalysis) return;
  const wrap = document.createElement("div");
  wrap.className = "stems-wrap";

  const cards = Object.values(stemAnalysis.stems || {})
    .map(
      (s) => `
  <div class="stem-card ${s.is_silent ? "silent" : ""}">
    <div class="stem-title">${s.label || s.name}</div>
    <div class="stem-metric"><span>Peak</span><span>${s.peak_db} dB</span></div>
    <div class="stem-metric"><span>RMS</span><span>${s.rms_db} dB</span></div>
    ${s.lufs != null ? `<div class="stem-metric"><span>LUFS</span><span>${s.lufs}</span></div>` : ""}
    <div class="stem-metric"><span>Banda dominante</span><span>${(s.dominant_band || "—").replace("_", " ")}</span></div>
    ${availableStems.includes(s.name) ? `<button type="button" class="stem-dl" data-stem-download="${jobId}" data-stem-name="${s.name}">⬇ Descargar ${s.name}.wav</button>` : ""}
  </div>
`,
    )
    .join("");

  const recs = stemAnalysis.recommendations || [];
  const recsHtml = recs.length
    ? recs
        .map(
          (r) => `
      <div class="stem-rec ${r.type === "kick_bass_collision" ? "kick-bass" : ""}">
        ${r.message}
        <div class="rec-score">Score de colisión: ${r.score}${r.band_hz ? ` · Banda: ${r.band_hz[0]}-${r.band_hz[1]} Hz` : ""}</div>
      </div>
    `,
        )
        .join("")
    : `<div class="stem-summary">${stemAnalysis.summary || "Sin colisiones detectadas."}</div>`;

  const isRoformer = Object.keys(stemAnalysis.stems || {}).includes("instrumental");
  wrap.innerHTML = `
  <h3>Stems (${isRoformer ? "Roformer — voz/instrumental" : "Demucs — 4 stems"})</h3>
  <div class="stem-cards">${cards}</div>
  <h3 class="stem-recommendations-title">Recomendaciones</h3>
  ${recsHtml}
`;
  LGMDM.ui.getContent().prepend(wrap);
}

// ── Polling ──────────────────────────────────────────────────
function startPolling(jobId) {
  if (LGMDM.polling.master) clearInterval(LGMDM.polling.master);
  LGMDM.polling.master = setInterval(async () => {
    try {
      const res = await LGMDM.api.apiFetch(`${LGMDM.api.apiBase()}/job/${jobId}`);
      const data = await res.json();
      if (data.status === "queued") {
        LGMDM.ui.showStatus(null, "En cola…", "queued", data.progress, data.stage);
      } else if (data.status === "processing") {
        LGMDM.ui.showStatus(null, "Masterizando…", "processing", data.progress, data.stage);
      } else if (data.status === "done") {
        clearInterval(LGMDM.polling.master);
        LGMDM.ui.showStatus(null, "Mastering completado ✓", "done");
        document.getElementById("btnMaster")?.removeAttribute("disabled");
        downloadUrl = `${LGMDM.api.apiBase()}/download/${jobId}`;
        const btn = document.getElementById("btnDownload");
        btn.style.display = "block";

        const abBtn = document.getElementById("btnAB");
        if (abBtn && typeof setupABPlayer === "function") {
          abBtn.style.display = "block";
          abBtn.disabled = true;
          abBtn.textContent = "⏳ Cargando A/B...";
          LGMDM.api.apiFetch(downloadUrl)
            .then(r => r.blob())
            .then(masterBlob => setupABPlayer(masterBlob))
            .then(() => {
              abBtn.disabled = false;
              abBtn.textContent = "⚡ A/B";
            })
            .catch(() => { abBtn.style.display = "none"; });
        }
        const nameInput = document.getElementById("trackNameInput");
        nameInput.style.display = "block";
        prefillTrackNameFromFile();
        btn.onclick = async () => {
          try {
            btn.disabled = true;
            await LGMDM.api.downloadAuthenticated(downloadUrl + currentTrackNameParam(), { filename: "mastered.wav" });
          } catch (e) {
            if (typeof handleClientError === "function") handleClientError(e, "No se pudo descargar el master.", { context: "master-download" });
            else window.LGMDM.ui.showToast?.(e.message || "No se pudo descargar el master.", "error");
          } finally { btn.disabled = false; }
        };
        const rBtn = document.getElementById("btnReport");
        rBtn.style.display = "block";
        rBtn.onclick = () => downloadReport(jobId);
        if (data.analysis_before?.lufs != null)
          showLoudnessMeter(data.analysis_after?.lufs ?? data.analysis_before.lufs);
        renderAnalysisComparison(data.analysis_before, data.analysis_after);
        if (data.mix_advice_before) LGMDM.reference.renderAdvicePanel(data.mix_advice_before, "Evaluación", "— Antes");
        if (data.mix_advice_after) LGMDM.reference.renderAdvicePanel(data.mix_advice_after, "Evaluación", "— Después");
        if (data.analysis_after) window.LGMDM.ai.setContext({ ...data.analysis_after, mix_advice: data.mix_advice_after });
      } else if (data.status === "error") {
        clearInterval(LGMDM.polling.master);
        LGMDM.ui.showStatus(null, "Error: " + data.error, "error");
        document.getElementById("btnMaster")?.removeAttribute("disabled");
      }
    } catch (e) {
      console.error("Poll error:", e);
    }
  }, 1500);
}
(function(){ const LG=window.LGMDM=window.LGMDM||{}; LG.mastering=Object.assign(LG.mastering||{}, { submitJob: submitMasterJob, submitSync: submitMasterSync }); })();
