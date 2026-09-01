import ast
from pathlib import Path

import numpy as np


def test_streaming_engine_has_single_chunk_iterator_and_pcm_alias():
    src = (Path(__file__).resolve().parents[1] / "streaming_engine.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    names = [n.name for n in tree.body if isinstance(n, ast.FunctionDef)]
    assert names.count("iter_mastering_chunks") == 1
    assert names.count("master_stream_to_pcm") == 1
    assert "master_stream_to_pcm16 = master_stream_to_pcm" in src


def test_stream_pcm_formats_have_expected_bytes_per_sample():
    from backend import streaming_engine as se

    audio = np.zeros((2, 2205), dtype=np.float32)
    for fmt, bytes_per_sample in (("int16", 2), ("pcm24", 3), ("float32", 4)):
        pcm, metrics = next(se.master_stream_to_pcm(audio, 44100, chunk_seconds=0.05, pcm_format=fmt, detect_dynamic_eq=False))
        assert len(pcm) == 2205 * 2 * bytes_per_sample
        assert "spectrum" in metrics
        assert "peak_db" in metrics
