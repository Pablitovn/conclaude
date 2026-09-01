from __future__ import annotations

from fastapi import APIRouter


def create_router(**dependencies):
    router = APIRouter()
    namespace = dict(dependencies)
    namespace["router"] = router
    exec(compile(_ROUTE_SOURCE, __file__, "exec"), namespace, namespace)
    return router


_ROUTE_SOURCE = '@router.post("/stems/separate", tags=["Stems"])\nasync def stems_separate(background_tasks: BackgroundTasks, file: UploadFile = File(...),\n                          mode: str = Form("demucs_4stem"),\n    current_user: dict = Depends(get_current_user),\n):\n    """Separa el track en stems con Demucs (mode="demucs_4stem", default:\n    vocals/drums/bass/other) o con BS-RoFormer/Mel-RoFormer (mode="vocals_hq":\n    solo vocals/instrumental, mejor aislamiento de voz), analiza cada uno\n    individualmente y detecta colisiones espectrales entre ellos (ej. kick\n    tapando al bajo — solo aplica en modo demucs_4stem). Encola el job igual\n    que /master — se pollea con el mismo /job/{job_id} de siempre."""\n    if mode not in ("demucs_4stem", "vocals_hq"):\n        raise HTTPException(400, f"mode inválido: \'{mode}\'. Válidos: demucs_4stem, vocals_hq")\n    validate_audio_file(file.filename)\n    data = await read_and_validate(file)\n    job_id = uuid.uuid4().hex\n    input_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")\n    with open(input_path, "wb") as f:\n        f.write(data)\n\n    duration = _get_input_duration(input_path)\n    job_params = {"mode": mode}\n    if duration is not None:\n        job_params["_input_duration_sec"] = duration\n\n    jobs.create_job(job_id, {\n        "status": "queued", "type": "stems", "filename": file.filename,\n        "created_at": time.time(), "params": job_params, "progress": 0, "stage": "En cola",\n    })\n    background_tasks.add_task(run_stems_job, job_id, input_path, mode)\n    return {"job_id": job_id, "status": "queued", "poll_url": f"/job/{job_id}"}\n\n\n@router.get("/stems/download/{job_id}/{stem_name}", tags=["Stems"], dependencies=[Depends(get_current_user)])\ndef stems_download(job_id: str, stem_name: str):\n    if not jobs.exists(job_id):\n        raise HTTPException(404, "Job no encontrado")\n    job = jobs.get_job(job_id)\n    if job.get("type") != "stems" or job["status"] != "done":\n        raise HTTPException(400, f"Job no listo: {job.get(\'status\')}")\n    stem_path = job.get("stem_paths", {}).get(stem_name)\n    if not stem_path or not os.path.exists(stem_path):\n        raise HTTPException(410, "Stem no encontrado o expirado. Volvé a separar el track.")\n    return FileResponse(stem_path, media_type="audio/wav", filename=f"{stem_name}.wav")\n\n\n'
