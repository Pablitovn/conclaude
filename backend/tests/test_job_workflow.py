import os
import sys
import tempfile

# BUGFIX: sin esto, "from backend.job_service import JobService" tira
# ModuleNotFoundError salvo que quien corra el test ya tenga <repo_root> en
# PYTHONPATH a mano — backend/tests/ no tiene __init__.py, así que ni pytest
# ni una ejecución directa lo resuelven solos. Mismo fix que en
# test_projects_e2e.py: insertar la raíz del repo (3 niveles arriba de este
# archivo) en sys.path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.job_service import JobService


def test_job_workflow_tracks_stage_logs_and_snapshot():
    with tempfile.TemporaryDirectory() as tmpdir:
        service = JobService(storage_dir=tmpdir)

        job_id = "test-job-1"
        service.create_job(
            job_id,
            {
                "status": "queued",
                "filename": "demo.wav",
                "created_at": 1.0,
                "params": {"preset": "classic"},
                "progress": 0,
                "stage": "queued",
                "logs": [],
            },
        )

        service.set_stage(job_id, "analyzing", progress=25)
        service.append_log(job_id, "Analizando archivo", stage="analyzing")
        service.snapshot_params(job_id, {"preset": "classic", "output_format": "wav"})
        service.archive(job_id)

        saved = service.get_job(job_id)
        assert saved["status"] == "archived"
        assert saved["stage"] == "archived"
        assert saved["progress"] == 100
        assert saved["preset_snapshot"]["output_format"] == "wav"
        assert saved["logs"][-1]["message"] == "Analizando archivo"
        assert saved["archived_at"] is not None


def test_job_workflow_supports_exports_and_versions():
    with tempfile.TemporaryDirectory() as tmpdir:
        service = JobService(storage_dir=tmpdir)
        job_id = "test-export-job"

        service.create_job(
            job_id,
            {
                "status": "queued",
                "filename": "demo.wav",
                "params": {"preset": "radio"},
                "progress": 0,
                "stage": "queued",
                "logs": [],
                "exports": [],
                "versions": [],
            },
        )

        service.snapshot_params(job_id, {"preset": "radio", "output_format": "wav", "target_lufs": -14})
        service.add_export(job_id, "wav_24", "/tmp/final.wav", version_name="master_final", format="wav", bit_depth=24)
        service.add_export(job_id, "mp3_320", "/tmp/final.mp3", version_name="release_mp3", format="mp3", bit_rate="320k")

        saved = service.get_job(job_id)
        assert len(saved["exports"]) == 2
        assert saved["versions"][0]["version_name"] == "master_final"
        assert saved["exports"][0]["format"] in {"wav", "mp3"}
        assert saved["preset_snapshot"]["target_lufs"] == -14


def test_job_queue_prioritizes_highest_priority_job():
    with tempfile.TemporaryDirectory() as tmpdir:
        service = JobService(storage_dir=tmpdir)

        service.create_job("low", {"status": "queued", "priority": 1})
        service.create_job("high", {"status": "queued", "priority": 9})

        service.enqueue_job("low", priority=1)
        service.enqueue_job("high", priority=9)

        next_job = service.dequeue_next_job()
        assert next_job == "high"
        assert service.get_job("high")["status"] == "processing"
        assert service.get_queue()[0]["job_id"] == "low"


def test_project_version_and_export_workflow():
    with tempfile.TemporaryDirectory() as tmpdir:
        service = JobService(storage_dir=tmpdir)
        project = service.create_project(
            "project-1",
            {"title": "Demo EP", "artist": "Artist X", "status": "active"},
        )

        service.add_version(
            "project-1",
            "master_final",
            job_id="job-001",
            preset_snapshot={"output_format": "wav", "target_lufs": -14},
        )
        service.add_export(
            "project-1",
            "master_final",
            "export-1",
            "/tmp/final.wav",
            format="wav",
            bit_depth=24,
        )

        saved = service.get_project("project-1")
        assert saved["title"] == "Demo EP"
        assert saved["versions"][0]["version_name"] == "master_final"
        assert saved["versions"][0]["exports"][0]["format"] == "wav"
        assert saved["versions"][0]["preset_snapshot"]["target_lufs"] == -14
