from __future__ import annotations

import hashlib
import json
import multiprocessing as mp
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Optional

import librosa
import numpy as np
import soundfile as sf

from .mastering import _crop_preview, process_audio


class PreviewSnapshotError(RuntimeError):
    pass


class PreviewRenderer:
    """Owns immutable 25-second preview sources and cancellable renders."""

    def __init__(self, directory: str, duration_sec: int = 25, ttl_sec: int = 3600):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.duration_sec = duration_sec
        self.ttl_sec = ttl_sec

    def cleanup(self) -> None:
        cutoff = time.time() - self.ttl_sec
        for path in self.directory.glob("*"):
            try:
                if path.stat().st_mtime < cutoff:
                    if path.is_dir():
                        shutil.rmtree(path, ignore_errors=True)
                    else:
                        path.unlink(missing_ok=True)
            except OSError:
                continue

    def _source_paths(self, source_id: str) -> tuple[Path, Path]:
        return (
            self.directory / f"{source_id}.wav",
            self.directory / f"{source_id}.json",
        )

    def create_snapshot(self, input_path: str, owner_id: str) -> dict[str, Any]:
        if not os.path.exists(input_path):
            raise PreviewSnapshotError("El archivo original no existe")

        source_id = uuid.uuid4().hex
        audio, sr = librosa.load(input_path, sr=None, mono=False)
        if audio.ndim == 1:
            audio = audio[np.newaxis, :]
        if audio.shape[1] == 0 or sr <= 0:
            raise PreviewSnapshotError("El archivo no contiene audio utilizable")

        cropped = _crop_preview(audio, sr, self.duration_sec).astype(np.float32, copy=False)
        source_path, meta_path = self._source_paths(source_id)
        tmp_audio = source_path.with_suffix(".tmp.wav")
        sf.write(tmp_audio, cropped.T, sr, subtype="PCM_24", format="WAV")
        os.replace(tmp_audio, source_path)

        digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
        duration = float(cropped.shape[1] / sr)
        meta = {
            "source_id": source_id,
            "owner_id": owner_id,
            "duration_sec": duration,
            "sample_rate": int(sr),
            "channels": int(cropped.shape[0]),
            "source_sha256": digest,
            "created_at": time.time(),
        }
        tmp_meta = meta_path.with_suffix(".tmp.json")
        tmp_meta.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp_meta, meta_path)
        return meta

    def get_source(self, source_id: str, owner_id: str) -> tuple[str, dict[str, Any]]:
        source_path, meta_path = self._source_paths(source_id)
        if not source_path.exists() or not meta_path.exists():
            raise PreviewSnapshotError("Snapshot de Preview inexistente o expirado")
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("owner_id") != owner_id:
            raise PreviewSnapshotError("El snapshot no pertenece al usuario actual")
        return str(source_path), meta

    @staticmethod
    def _render_worker(source_path: str, output_path: str, params: dict[str, Any], duration_sec: int) -> None:
        clean = dict(params)
        clean.pop("progress_cb", None)
        clean["input_path"] = source_path
        clean["preview_seconds"] = duration_sec
        clean["output_format"] = "wav"
        clean["output_bit_depth"] = 24
        result = process_audio(**clean)
        produced = result.get("output_path")
        if not produced or not os.path.exists(produced):
            raise RuntimeError("El motor de mastering no generó el Preview")
        os.replace(produced, output_path)

    def render_cancellable(
        self,
        source_path: str,
        params: dict[str, Any],
        cancel_check: Callable[[], bool],
    ) -> str:
        output_path = str(self.directory / f"render-{uuid.uuid4().hex}.wav")
        ctx = mp.get_context("spawn")
        process = ctx.Process(
            target=self._render_worker,
            args=(source_path, output_path, params, self.duration_sec),
            daemon=True,
        )
        process.start()
        try:
            while process.is_alive():
                if cancel_check():
                    process.terminate()
                    process.join(timeout=5)
                    if process.is_alive():
                        process.kill()
                        process.join(timeout=2)
                    raise InterruptedError("Render de Preview cancelado")
                time.sleep(0.20)
            process.join(timeout=1)
            if process.exitcode != 0:
                raise RuntimeError(f"Render de Preview finalizó con código {process.exitcode}")
            if not os.path.exists(output_path):
                raise RuntimeError("Render de Preview finalizó sin archivo de salida")
            return output_path
        except BaseException:
            if process.is_alive():
                process.terminate()
                process.join(timeout=3)
            if os.path.exists(output_path):
                os.remove(output_path)
            raise

    @staticmethod
    def remove_render(path: Optional[str]) -> None:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
