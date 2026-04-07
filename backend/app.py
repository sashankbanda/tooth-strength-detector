import logging
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
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


def persist_analysis_session(
    db: Session,
    user: User,
    source_filename: str,
    result_data: dict,
) -> None:
    summary = result_data.get("summary") or {}
    reports = result_data.get("reports") or []

    session = AnalysisSession(
        user_id=user.id,
        job_id=result_data.get("job_id", str(uuid.uuid4())),
        source_filename=source_filename,
        total_images=int(summary.get("total_images") or 0),
        total_teeth=int(summary.get("total_teeth") or 0),
        csv_url=result_data.get("csv_url"),
        pdf_url=result_data.get("pdf_url"),
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
                image_filename=str(image_filename),
                fdi=int(fdi_value),
                strength=float(strength_value),
                stage=str(stage_value),
            )
        )

    db.commit()


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
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

    try:
        try:
            runtime_processor = get_processor()
        except ValueError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        results = runtime_processor.process_file(str(temp_file_path), is_zip=is_zip)
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

    history_saved = False
    if current_user is not None:
        try:
            persist_analysis_session(db, current_user, safe_filename, results)
            history_saved = True
        except Exception:
            db.rollback()
            logger.exception("Failed to persist analysis session for user %s", current_user.id)

    results["history_saved"] = history_saved
    results["is_authenticated"] = current_user is not None

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
