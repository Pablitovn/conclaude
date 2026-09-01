"""
Test de flujo end-to-end de proyectos.
Simula: crear proyecto → crear versión → registrar exportación → descargar
"""
import tempfile
import os
import sys

# BUGFIX: este archivo vive en <repo_root>/backend/tests/, así que hacen
# falta 3 dirname() para llegar a <repo_root> (el nivel que necesita estar
# en sys.path para que "from backend.job_service import ..." resuelva).
# Antes tenía solo 2, lo que insertaba <repo_root>/backend en vez de
# <repo_root> — "backend.job_service" nunca se encontraba (ModuleNotFoundError
# incluso corriendo el test correctamente vía pytest desde la raíz del repo,
# porque backend/tests/ no tiene __init__.py y pytest no sube más de un nivel
# por su cuenta).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.job_service import JobService


def test_projects_end_to_end():
    """Test del flujo completo de proyectos."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Setup
        service = JobService(storage_dir=tmpdir)
        
        # 1. Crear un proyecto
        print("1️⃣  Crear proyecto...")
        project = service.create_project("proj_demo", {
            "title": "Song Demo",
            "artist": "Test Artist",
            "status": "active",
        })
        assert project["title"] == "Song Demo"
        print(f"   ✓ Proyecto creado: {project['project_id']}")
        
        # 2. Crear una versión con snapshot de preset
        print("2️⃣  Crear versión...")
        version_data = service.add_version("proj_demo", "master_v1",
            job_id="job-001",
            preset_snapshot={"target_lufs": -14, "output_format": "wav"}
        )
        print(f"   ✓ Versión creada: {version_data['version_name']}")
        
        # 3. Registrar un exportación
        print("3️⃣  Registrar exportación...")
        export_file = os.path.join(tmpdir, "master.wav")
        with open(export_file, "wb") as f:
            f.write(b"fake audio data")  # Fake WAV data
        
        service.add_export("proj_demo", "master_v1", "export_wav_24", export_file,
            format="wav", bit_depth=24)
        print(f"   ✓ Exportación registrada: {export_file}")
        
        # 4. Obtener el proyecto y verificar estructura
        print("4️⃣  Verificar estructura...")
        final_project = service.get_project("proj_demo")
        
        assert final_project["title"] == "Song Demo"
        assert len(final_project["versions"]) == 1
        assert final_project["versions"][0]["version_name"] == "master_v1"
        assert len(final_project["versions"][0]["exports"]) == 1
        assert final_project["versions"][0]["exports"][0]["format"] == "wav"
        assert final_project["versions"][0]["exports"][0]["bit_depth"] == 24
        assert final_project["versions"][0]["preset_snapshot"]["target_lufs"] == -14
        print(f"   ✓ Estructura verificada:")
        print(f"     - Proyecto: {final_project['title']}")
        print(f"     - Versiones: {len(final_project['versions'])}")
        print(f"     - Exportes (v1): {len(final_project['versions'][0]['exports'])}")
        
        # 5. Listar proyectos
        print("5️⃣  Listar todos los proyectos...")
        projects = service.list_projects()
        assert "proj_demo" in projects
        assert len(projects) == 1
        print(f"   ✓ Total de proyectos: {len(projects)}")
        
        print("\n✅ Test END-TO-END completado exitosamente!")


if __name__ == "__main__":
    try:
        test_projects_end_to_end()
    except AssertionError as e:
        print(f"\n❌ Assertion failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
