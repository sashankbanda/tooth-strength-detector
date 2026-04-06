from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import uuid
from sqlalchemy.orm import Session

from backend.auth import get_optional_current_user
from backend.config import GOOGLE_CLIENT_ID
from backend.database import get_db, init_db
from backend.models import AnalysisSession, ToothRecord, User
from backend.processor import ToothProcessor
from backend.routes.google_auth import router as google_auth_router
from backend.routes.history_routes import router as history_router

app = FastAPI(title="Tooth Strength Detector API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup directories
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
OUTPUT_DIR = os.path.join(STATIC_DIR, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

processor = ToothProcessor(output_dir=OUTPUT_DIR)


@app.on_event("startup")
def on_startup():
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
    if not file.filename or not file.filename.lower().endswith(('.zip', '.jpg', '.jpeg', '.png')):
        raise HTTPException(status_code=400, detail="Invalid file type. Upload a ZIP containing images or an image file (.jpg, .png).")
        
    temp_dir = os.path.join(OUTPUT_DIR, "temp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{file.filename}")
    
    # Save the uploaded file
    try:
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    is_zip = temp_file_path.lower().endswith('.zip')
    
    try:
        # Process the file via our script logic
        results = processor.process_file(temp_file_path, is_zip=is_zip)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error processing the file.")
    finally:
        # Clean up the original upload
        try:
            os.remove(temp_file_path)
        except:
            pass

    history_saved = False
    if current_user is not None:
        try:
            persist_analysis_session(db, current_user, file.filename, results)
            history_saved = True
        except Exception:
            db.rollback()

    results["history_saved"] = history_saved
    results["is_authenticated"] = current_user is not None

    return JSONResponse(content={"status": "success", "data": results})

@app.get("/api/config")
def get_public_config():
    return {
        "google_client_id": GOOGLE_CLIENT_ID,
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Avoid noisy browser 404 logs when no favicon file is provided.
    return Response(status_code=204)

@app.get("/")
async def root():
    # The actual HTML is served through /static/index.html, but we can redirect / or serve it
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


app.include_router(google_auth_router)
app.include_router(history_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
