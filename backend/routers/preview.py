from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from .. import library
from ..preview_contracts import PreviewRequest, PreviewSourceResponse
from ..preview_service import PreviewRenderer, PreviewSnapshotError


def create_preview_router(
    *,
    preview_renderer: PreviewRenderer,
    library_dir: str,
    read_and_validate,
    validate_audio_file,
    current_user_dependency,
):
    router = APIRouter(prefix="/preview", tags=["Preview"])

    @router.post("/source", response_model=PreviewSourceResponse)
    async def create_source_snapshot(
        file: Optional[UploadFile] = File(None),
        library_id: Optional[str] = Form(None),
        current_user: dict = Depends(current_user_dependency),
    ):
        if not file and not library_id:
            raise HTTPException(400, "Se requiere un archivo original o library_id")

        source_path = None
        cleanup_path = None
        try:
            if library_id:
                source_path = library.get_path(library_dir, library_id)
                if not source_path:
                    raise HTTPException(404, "Archivo de librería no encontrado")
            else:
                if not file or not file.filename:
                    raise HTTPException(400, "El archivo original no tiene nombre válido")
                validate_audio_file(file.filename)
                data = await read_and_validate(file)
                fd, cleanup_path = tempfile.mkstemp(
                    prefix="preview-source-",
                    suffix=os.path.splitext(file.filename)[1],
                )
                os.close(fd)
                with open(cleanup_path, "wb") as handle:
                    handle.write(data)
                source_path = cleanup_path

            try:
                meta = await run_in_threadpool(
                    preview_renderer.create_snapshot,
                    source_path,
                    str(current_user["id"]),
                )
            except PreviewSnapshotError as exc:
                raise HTTPException(422, str(exc)) from exc
            return PreviewSourceResponse(**meta)
        finally:
            if cleanup_path and os.path.exists(cleanup_path):
                os.remove(cleanup_path)

    @router.post("", response_class=FileResponse)
    async def render_preview(
        request: Request,
        payload: PreviewRequest,
        current_user: dict = Depends(current_user_dependency),
    ):
        try:
            source_path, meta = preview_renderer.get_source(
                payload.preview_source_id,
                str(current_user["id"]),
            )
        except PreviewSnapshotError as exc:
            raise HTTPException(404, str(exc)) from exc

        if float(meta["duration_sec"]) > payload.preview_duration_sec:
            raise HTTPException(409, "El snapshot original supera la duración solicitada")

        params = payload.params.model_dump(exclude_unset=False)
        params["preview_seconds"] = payload.preview_duration_sec
        params["output_format"] = "wav"
        params["output_bit_depth"] = 24

        disconnected = False

        async def monitor_disconnect() -> None:
            nonlocal disconnected
            while True:
                if await request.is_disconnected():
                    disconnected = True
                    return
                await asyncio.sleep(0.20)

        monitor = asyncio.create_task(monitor_disconnect(), name="lgmdm-preview-disconnect-monitor")
        output_path = None
        try:
            def cancel_check() -> bool:
                return disconnected

            output_path = await run_in_threadpool(
                preview_renderer.render_cancellable,
                source_path,
                params,
                cancel_check,
            )
            if not os.path.exists(output_path):
                raise HTTPException(500, "El Preview no fue generado")
            return FileResponse(
                output_path,
                media_type="audio/wav",
                filename="lgmdm-preview-25s.wav",
                headers={
                    "X-Preview-Duration": str(meta["duration_sec"]),
                    "X-Preview-Source-Id": payload.preview_source_id,
                    "Cache-Control": "no-store",
                },
                background=BackgroundTask(preview_renderer.remove_render, output_path),
            )
        except InterruptedError as exc:
            raise HTTPException(499, "Preview cancelado") from exc
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Error renderizando Preview: {exc}") from exc
        finally:
            monitor.cancel()
            if output_path and not os.path.exists(output_path):
                preview_renderer.remove_render(output_path)

    return router
