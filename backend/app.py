import logging
import shutil
import time
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from backend.auth import get_optional_current_user
from backend.config import (
    CORS_ALLOW_ORIGIN_REGEX,
    CORS_ALLOW_ORIGINS,
    GOOGLE_CLIENT_ID,
    INDEX_FILE,
    FRONTEND_DIR,
    OUTPUT_DIR,
    TEMP_UPLOAD_DIR,
    ensure_runtime_directories,
)
from backend.database import get_db, init_db
from backend.models import AnalysisSession, ToothRecord, User
from backend.processor import ToothProcessor
from backend.routes.google_auth import router as google_auth_router
from backend.routes.history_routes import router as history_router


logger = logging.getLogger(__name__)
ALLOWED_UPLOAD_EXTENSIONS = (".zip", ".jpg", ".jpeg", ".png")

# Ensure directories exist before mounting static/output paths
ensure_runtime_directories()

app = FastAPI(title="Tooth Strength Detector API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    return response


app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
app.mount("/output", StaticFiles(directory=str(OUTPUT_DIR)), name="output")

processor: Optional[ToothProcessor] = None


def get_processor() -> ToothProcessor:
    global processor

    if processor is None:
        processor = ToothProcessor(output_dir=str(OUTPUT_DIR))

    return processor


@app.on_event("startup")
def on_startup() -> None:
    ensure_runtime_directories()
    init_db()


def _truncate(val: str, max_len: int) -> str:
    if not val:
        return ""
    if len(val) <= max_len:
        return val
    return val[:max_len]


def persist_analysis_session(
    db: Session,
    user: User,
    source_filename: str,
    result_data: dict,
    processing_time_ms: Optional[int] = None,
) -> None:
    summary = result_data.get("summary") or {}
    reports = result_data.get("reports") or []
    job_id = result_data.get("job_id")

    if not job_id:
        logger.error("Missing job_id in results, cannot persist session.")
        return

    # Check if a session already exists (for reprocessing)
    from sqlalchemy import select
    session = db.scalar(select(AnalysisSession).where(AnalysisSession.job_id == job_id))

    try:
        if session:
            # Update existing session
            session.total_images = int(summary.get("total_images") or 0)
            session.total_teeth = int(summary.get("total_teeth") or 0)
            session.csv_url = _truncate(result_data.get("csv_url"), 1024)
            session.pdf_url = _truncate(result_data.get("pdf_url"), 1024)
            if processing_time_ms is not None:
                session.processing_time_ms = processing_time_ms
            
            # Clear old records
            from sqlalchemy import delete
            db.execute(delete(ToothRecord).where(ToothRecord.session_id == session.id))
        else:
            # Create new session
            session = AnalysisSession(
                user_id=user.id,
                job_id=_truncate(job_id, 64),
                source_filename=_truncate(source_filename, 255),
                total_images=int(summary.get("total_images") or 0),
                total_teeth=int(summary.get("total_teeth") or 0),
                processing_time_ms=processing_time_ms,
                csv_url=_truncate(result_data.get("csv_url"), 1024),
                pdf_url=_truncate(result_data.get("pdf_url"), 1024),
            )
            db.add(session)
        
        db.flush()

        for row in reports:
            fdi_value = row.get("FDI")
            strength_value = row.get("strength")
            stage_value = row.get("stage")
            image_filename = row.get("image_filename") or source_filename

            if fdi_value is None or strength_value is None or stage_value is None:
                continue

            db.add(
                ToothRecord(
                    session_id=session.id,
                    image_filename=_truncate(str(image_filename), 255),
                    fdi=int(fdi_value),
                    strength=float(strength_value),
                    stage=_truncate(str(stage_value), 64),
                )
            )

        db.commit()
        logger.info("Successfully persisted analysis session %s for user %s", job_id, user.id)
    except Exception as exc:
        db.rollback()
        logger.exception("Database error while persisting session %s: %s", job_id, exc)
        raise


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    preprocess: bool = Form(True),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    safe_filename = Path(file.filename or "").name
    if not safe_filename or not safe_filename.lower().endswith(ALLOWED_UPLOAD_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Upload a ZIP containing images or an image file (.jpg, .png).",
        )

    # Storage Quota Check
    from backend.config import STORAGE_QUOTA_MB
    total_size = 0
    if OUTPUT_DIR.exists():
        for path in OUTPUT_DIR.rglob("*"):
            if path.is_file():
                total_size += path.stat().st_size
    
    total_mb = total_size / (1024 * 1024)
    if total_mb >= STORAGE_QUOTA_MB:
        raise HTTPException(
            status_code=403,
            detail=f"Storage quota exceeded ({round(total_mb, 1)}MB / {STORAGE_QUOTA_MB}MB). Please delete old analysis history to free up space."
        )

    temp_file_path = TEMP_UPLOAD_DIR / f"{uuid.uuid4()}_{safe_filename}"

    try:
        with temp_file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Failed to save the uploaded file.") from exc

    is_zip = temp_file_path.suffix.lower() == ".zip"

    start_time = time.time()
    try:
        try:
            runtime_processor = get_processor()
        except ValueError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        results = runtime_processor.process_file(str(temp_file_path), is_zip=is_zip, preprocess=preprocess)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected processing error for upload %s", safe_filename)
        raise HTTPException(status_code=500, detail="Error processing the file.") from exc
    finally:
        try:
            temp_file_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to clean up temporary upload %s", temp_file_path)
        await file.close()
    
    end_time = time.time()
    processing_time_ms = int((end_time - start_time) * 1000)

    history_saved = False
    if current_user is not None:
        try:
            persist_analysis_session(db, current_user, safe_filename, results, processing_time_ms=processing_time_ms)
            history_saved = True
        except Exception:
            db.rollback()
            logger.exception("Failed to persist analysis session for user %s", current_user.id)

    results["history_saved"] = history_saved
    results["is_authenticated"] = current_user is not None
    results["processing_time_ms"] = processing_time_ms

    return JSONResponse(content={"status": "success", "data": results})


@app.post("/api/reprocess/{job_id}")
async def reprocess_job(
    job_id: str,
    preprocess: bool = Form(True),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    # Security: Validate job_id to prevent directory traversal
    if not job_id or ".." in job_id or "/" in job_id or "\\" in job_id:
        raise HTTPException(status_code=400, detail="Invalid job ID format.")

    session: Optional[AnalysisSession] = None
    if current_user is not None:
        # Check if job exists and belongs to user
        from sqlalchemy import select
        session = db.scalar(select(AnalysisSession).where(AnalysisSession.job_id == job_id, AnalysisSession.user_id == current_user.id))
        if not session:
            # If it's not in the DB for this user, we don't allow reprocessing (even if folder exists)
            # as it might belong to another user.
            raise HTTPException(status_code=404, detail="Analysis session not found.")
    else:
        # Guest mode: Just check if the directory exists
        job_dir = OUTPUT_DIR / job_id
        if not job_dir.exists() or not job_dir.is_dir():
             raise HTTPException(status_code=404, detail="Analysis session directory not found.")
    
    start_time = time.time()
    try:
        runtime_processor = get_processor()
        results = runtime_processor.reprocess_existing_session(job_id, preprocess=preprocess)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Reprocessing failed for job %s", job_id)
        raise HTTPException(status_code=500, detail="Error reprocessing the session.") from exc

    end_time = time.time()
    processing_time_ms = int((end_time - start_time) * 1000)

    history_saved = False
    if current_user is not None and session is not None:
        try:
            persist_analysis_session(db, current_user, session.source_filename, results, processing_time_ms=processing_time_ms)
            history_saved = True
        except Exception:
            db.rollback()
            logger.exception("Failed to update analysis session after reprocess for job %s", job_id)
            # We don't fail the whole request if DB update fails, but we report it
    
    results["history_saved"] = history_saved
    results["is_authenticated"] = current_user is not None
    results["processing_time_ms"] = processing_time_ms

    return JSONResponse(content={"status": "success", "data": results})


@app.get("/api/config")
def get_public_config() -> dict:
    return {
        "google_client_id": GOOGLE_CLIENT_ID,
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon() -> Response:
    return Response(status_code=204)


@app.get("/")
async def root() -> FileResponse:
    if not INDEX_FILE.exists():
        raise HTTPException(status_code=404, detail="Frontend entrypoint not found.")

    return FileResponse(str(INDEX_FILE))


app.include_router(google_auth_router)
app.include_router(history_router)
