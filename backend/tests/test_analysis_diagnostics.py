import numpy as np

from backend.mastering import analyze_audio, diagnostic_advice


def test_analyze_audio_builds_perceptual_profile_after_base_metrics():
    sr = 48000
    t = np.arange(sr * 2) / sr
    audio = (0.08 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    result = analyze_audio(audio, sr)

    assert "perceptual" in result
    assert result["genre_detected"]
    assert isinstance(result["genre_confidence"], (int, float))
    assert "perceptual_diagnosis" in result


def test_diagnostic_advice_prioritizes_clipping_before_processing():
    analysis = {
        "clipping_ratio": 0.001,
        "true_peak_db": 0.2,
        "dc_offset": 0.0,
        "mono_compatibility_db": 0.0,
        "dynamic_range_db": 8.0,
        "stereo_correlation": 0.9,
        "silence_ratio": 0.0,
        "lufs": -14.0,
        "peak_db": 0.0,
        "spectrum": {},
    }

    result = diagnostic_advice(analysis)

    assert result["mode"] == "resolver_primero"
    assert result["checks"][0]["area"] == "Nivel / clipping"
    assert result["checks"][0]["severity"] == "critical"


def test_diagnostic_advice_detects_missing_signal_before_processing():
    analysis = {
        "rms_db": -75.0,
        "peak_db": -70.0,
        "true_peak_db": -70.0,
        "silence_ratio": 0.98,
        "clipping_ratio": 0.0,
        "dc_offset": 0.0,
        "mono_compatibility_db": 0.0,
        "dynamic_range_db": 5.0,
        "stereo_correlation": 1.0,
        "lufs": -70.0,
        "spectrum": {},
    }
    result = diagnostic_advice(analysis)

    assert result["diagnostic_version"] == "1.1"
    assert result["primary_hypothesis"]["name"] == "Señal ausente o casi ausente"
    assert result["checks"][0]["area"] == "Ruta de señal"
    assert result["checks"][0]["severity"] == "critical"


def test_diagnostic_advice_detects_phase_as_primary_hypothesis():
    analysis = {
        "rms_db": -18.0,
        "peak_db": -3.0,
        "true_peak_db": -2.5,
        "silence_ratio": 0.0,
        "clipping_ratio": 0.0,
        "dc_offset": 0.0,
        "mono_compatibility_db": -9.0,
        "dynamic_range_db": 10.0,
        "stereo_correlation": 0.1,
        "lufs": -18.0,
        "spectrum": {},
    }
    result = diagnostic_advice(analysis)

    assert result["primary_hypothesis"]["name"] == "Fase / suma mono"
    assert result["checks"][0]["area"] == "Fase / estéreo"


from backend.diagnostic_knowledge import match_knowledge, memory_summary


def test_field_memory_matches_signal_path_case():
    analysis = {
        "rms_db": -72.0,
        "peak_db": -68.0,
        "silence_ratio": 0.97,
        "clipping_ratio": 0.0,
        "true_peak_db": -68.0,
    }
    matches = match_knowledge(analysis)
    assert matches[0].case.case_id == "no_signal"
    assert "routing" in matches[0].case.route
    assert "EQ" in matches[0].case.do_not_touch_first


def test_memory_summary_exposes_primary_case_and_evidence():
    analysis = {
        "rms_db": -18.0,
        "peak_db": -3.0,
        "true_peak_db": -2.5,
        "clipping_ratio": 0.0,
        "silence_ratio": 0.0,
        "dc_offset": 0.0,
        "mono_compatibility_db": -9.0,
        "dynamic_range_db": 10.0,
        "stereo_correlation": 0.1,
    }
    result = memory_summary(analysis)
    assert result["memory_version"] == "0.1"
    assert result["primary_case"]["case_id"] == "phase"
    assert result["primary_case"]["evidence"] == ["mono_compatibility_db=-9.0"]
