from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend" / "backend"
JS = ROOT / "frontend" / "js"


def test_pitch_correction_uses_current_library_contract():
    src = (JS / "14-pitch-correction.js").read_text(encoding="utf-8")
    assert "/library/list" not in src
    assert "apiFetch(`${api}/library`)" in src
    assert "Array.isArray(data.files)" in src


def test_projects_download_is_authenticated_and_blob_based():
    src = (JS / "21-projects-ui.js").read_text(encoding="utf-8")
    assert "downloadAuthenticated(url" in src
    assert "a.href = url" not in src


def test_auth_transport_has_single_canonical_api_fetch_layer():
    api = (JS / "00-api.js").read_text(encoding="utf-8")
    auth = (JS / "00-auth.js").read_text(encoding="utf-8")
    assert "apiFetch," in api and "LGMDM.api" in api
    assert "window.fetch = function" not in auth
    assert "apiFetch('/auth/me'" in auth


def test_websocket_uses_short_lived_ticket_and_not_session_jwt_in_url():
    api = (JS / "00-api.js").read_text(encoding="utf-8")
    auth = (JS / "00-auth.js").read_text(encoding="utf-8")
    for name in ("10-meters-dashboard.js", "13-mixer-engine.js", "08-reference-mastering.js"):
        src = (JS / name).read_text(encoding="utf-8")
        assert "WebSocket" in src and "wsAuthUrl" in src
    mixer_ui = (JS / "13-mixer-ui.js").read_text(encoding="utf-8")
    assert "mixerEngine" in mixer_ui
    for name in ("09-visualizers.js", "10-meters-dashboard.js", "13-mixer-engine.js", "13-mixer-ui.js", "08-reference-mastering.js"):
        src = (JS / name).read_text(encoding="utf-8")
        assert "localStorage.getItem(\"master_auth_token\")" not in src
    assert "wsAuthUrl" in api
    assert "sessionStorage.setItem(TOKEN_KEY, token)" in auth
    assert "/auth/ws-ticket" in api


def test_ws_ticket_backend_is_short_lived_and_scoped():
    auth = (BACKEND / "auth.py").read_text(encoding="utf-8")
    router = (BACKEND / "routers" / "auth.py").read_text(encoding="utf-8")
    app = (BACKEND / "app.py").read_text(encoding="utf-8")
    assert 'WS_TICKET_EXPIRY_SEC = int(os.getenv("WS_TICKET_EXPIRY_SEC", "60"))' in auth
    assert '"aud": "websocket"' in auth
    assert '"typ": "ws-ticket"' in auth
    assert '/auth/ws-ticket' in router
    assert 'payload.get("aud") not in (None, "websocket")' in app


def test_mixer_polling_cannot_leave_an_interval_behind():
    src = (JS / "13-mixer-ui.js").read_text(encoding="utf-8")
    assert "clearInterval(mixerState.polling)" not in src
    assert "clearTimeout(mixerState.polling)" in src
    assert "mixerState.polling = setTimeout(pollOnce, 1500);" in src


def test_mixer_uses_canonical_api_paths():
    src = (JS / "13-mixer-ui.js").read_text(encoding="utf-8")
    assert "apiFetch(`${getAPI()}" not in src
    assert "apiFetch('/mix/upload-stem'" in src
    assert "apiFetch('/mix/submit'" in src
    assert "apiFetch(`/job/${jobId}`)" in src


def test_master_console_markup():
    from pathlib import Path
    root = Path(__file__).resolve().parents[3]
    html = (root / "frontend" / "index.html").read_text(encoding="utf-8")
    js = (root / "frontend" / "js" / "15-master-console.js").read_text(encoding="utf-8")
    assert 'id="lgMasterConsole"' in html
    assert 'id="lgmdmWaveformCanvas"' in html
    spectrum = (root / 'frontend' / 'js' / '31-spectrum-controller.js').read_text(encoding='utf-8')
    assert 'lgmdmConsoleSpectrum' in spectrum and 'lgmdmWaveformCanvas' in html
    assert '15-master-console.js' in html
    assert 'consoleMasterBtn' in js


def test_master_console_controls_and_backend_chain_contract():
    html = (ROOT / "frontend" / "index.html").read_text(encoding="utf-8")
    console = (JS / "15-master-console.js").read_text(encoding="utf-8")
    routes = (BACKEND / "routers" / "mastering.py").read_text(encoding="utf-8")
    preview_routes = (BACKEND / "routers" / "preview.py").read_text(encoding="utf-8")
    dsp = (BACKEND / "mastering.py").read_text(encoding="utf-8")
    stream = (BACKEND / "streaming_engine.py").read_text(encoding="utf-8")
    for element_id in ("consoleInputFader", "consoleCompThreshold", "consoleCompRatio", "consoleStereoFader", "consoleLimiterFader", "consoleABMaster", "consoleABOriginal"):
        assert f'id="{element_id}"' in html
    assert "getChainOverrides" in console
    assert "comp_bypass" in console and "stereo_bypass" in console and "limiter_bypass" in console
    assert "comp_bypass=comp_bypass" in routes
    assert "stereo_bypass=stereo_bypass" in routes
    assert "limiter_bypass=limiter_bypass" in routes
    assert '@router.post("/preview"' not in routes
    assert '@router.post(""' in preview_routes
    assert "PreviewRequest" in preview_routes
    assert "PreviewRenderer" in preview_routes
    assert '"limiter": limiter_meters' in dsp
    assert '"chain_meters":   chain_meters' in stream
    assert '"limiter_meters": chain_meters.get("limiter", {})' in stream


def test_master_console_ab_mode_is_exposed_to_ui():
    src = (JS / "09-visualizers.js").read_text(encoding="utf-8")
    console = (JS / "15-master-console.js").read_text(encoding="utf-8")
    assert "function _abSetMode(mode)" in src
    assert "window.LGMDM.ab.setMode = _abSetMode" in src
    assert "LGMDM?.ab?.setMode" in console


def test_master_console_dsp_bypass_path_has_real_meter_state():
    src = (BACKEND / "mastering.py").read_text(encoding="utf-8")
    assert 'if comp_bypass:' in src
    assert 'if limiter_bypass:' in src
    assert 'limiter_meters["gr_db"]' in src
