# LGMDM FIX27 — P0–P3

## P0 — CSP
- Removed the inline shell bridge from `frontend/.../index.html`.
- Added `js/34-shell-bridge.js` as a same-origin external script.
- Cache-buster unified to `?v=FIX27`.
- No inline `<script>` or inline event handlers remain in the rebuilt index.

## P0/P1 — CORS
- CORS origins are configurable through `CORS_ORIGINS` and `FRONTEND_ORIGIN`.
- Default remains `https://masteringstudio.duckdns.org`.
- Added credentials + preflight support + explicit response-header enforcement for the configured frontend origin.
- `/health` was verified locally with GET and OPTIONS from the production frontend origin.

IMPORTANT: the backend ZIP must be deployed/restarted in production. Updating only the frontend cannot change the live CORS headers.

## P1 — semaphore/process resources
- Removed an unused eager `ProcessPoolExecutor` that was created merely by importing `streaming_engine.py`.
- This eliminates the unnecessary IPC semaphore/process-pool allocation at startup.
- Added idempotent shutdown hook and FastAPI shutdown cleanup.
- `reference_library` watcher now has an explicit stop event and shutdown join.

## P2 — reference library
- Added `/reference-library/diagnostics`.
- `/health` now reports directory, existence, indexed count, and audio-file count.
- The code does not manufacture reference files. If production reports `audio_files: 0`, the configured production directory is genuinely empty/unseen by the backend and must be populated or mounted correctly.

## P3 — pydub warnings
- Added a narrowly scoped `SyntaxWarning` filter for `pydub.utils` at application startup.
- Raised the declared minimum pydub version to `>=0.25.1`.
- The warning is dependency-originated; the filter does not suppress project warnings.

## Verification performed
- Python backend `compileall`: PASS.
- Backend import: PASS.
- GET `/health` from `https://masteringstudio.duckdns.org`: PASS with ACAO header.
- OPTIONS `/health` preflight: PASS with ACAO, methods and allowed headers.
- Disallowed origin receives no ACAO header.
- Frontend has 0 inline `<script>` blocks and 0 inline event handlers.
- HTML structure: 1 DOCTYPE, 1 html, 1 head, 1 body.
- CSS parser: 0 errors.
- External JS `34-shell-bridge.js`: `node --check` PASS.
- Responsive media queries present: 5.
- Streaming engine import/explicit shutdown: PASS with no semaphore warning in the verification process.

## Not claimed
This package was verified in the local execution environment. The live public server was not directly modified by this operation, so production CORS/reference-library status still depends on deploying/restarting these backend files and checking the live endpoint.
