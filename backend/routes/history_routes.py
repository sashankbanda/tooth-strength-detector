import logging
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from backend.auth import get_current_user
from backend.config import OUTPUT_DIR
from backend.database import get_db
from backend.models import AnalysisSession, User


router = APIRouter(prefix="/api/history", tags=["history"])
logger = logging.getLogger(__name__)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tiff"}


def _build_session_payload(item: AnalysisSession) -> dict:
    records = item.tooth_records or []

    output_viz_dir = OUTPUT_DIR / item.job_id / "output_visualizations"

    image_filenames: list[str] = []
    if output_viz_dir.exists():
        image_filenames = sorted(
            [
                path.name
                for path in output_viz_dir.iterdir()
                if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
            ]
        )

    if not image_filenames:
        image_filenames = sorted({record.image_filename for record in records if record.image_filename})

    images = [
        {
            "filename": filename,
            "url": f"/output/{item.job_id}/output_visualizations/{filename}",
        }
        for filename in image_filenames
    ]

    reports = [
        {
            "image_filename": record.image_filename,
            "FDI": record.fdi,
            "strength": round(record.strength, 2),
            "stage": record.stage,
        }
        for record in records
    ]

    return {
        "job_id": item.job_id,
        "reports": reports,
        "images": images,
        "csv_url": item.csv_url,
        "pdf_url": item.pdf_url,
        "summary": {
            "total_images": item.total_images,
            "total_teeth": item.total_teeth,
            "processing_time_ms": item.processing_time_ms,
        },
        "history_saved": True,
        "is_authenticated": True,
        "source_filename": item.source_filename,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


def _get_dir_size(directory: Path) -> float:
    """Calculate the total size of a directory in MB."""
    total_size = 0
    try:
        if directory.exists() and directory.is_dir():
            for path in directory.rglob("*"):
                if path.is_file():
                    total_size += path.stat().st_size
    except Exception as exc:
        logger.error("Error calculating directory size for %s: %s", directory, exc)
        return 0.0

    return round(total_size / (1024 * 1024), 2)


@router.get("")
def get_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    safe_limit = max(1, min(limit, 100))
    sessions = db.scalars(
        select(AnalysisSession)
        .options(selectinload(AnalysisSession.tooth_records))
        .where(AnalysisSession.user_id == current_user.id)
        .order_by(AnalysisSession.created_at.desc())
        .limit(safe_limit)
    ).all()

    return {
        "items": [
            {
                "job_id": item.job_id,
                "source_filename": item.source_filename,
                "total_images": item.total_images,
                "total_teeth": item.total_teeth,
                "csv_url": item.csv_url,
                "pdf_url": item.pdf_url,
                "processing_time_ms": item.processing_time_ms,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "records_count": len(item.tooth_records),
                "size_mb": _get_dir_size(OUTPUT_DIR / item.job_id),
            }
            for item in sessions
        ]
    }


@router.get("/{job_id}")
def get_history_session(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(AnalysisSession)
        .options(selectinload(AnalysisSession.tooth_records))
        .where(AnalysisSession.user_id == current_user.id, AnalysisSession.job_id == job_id)
    )

    if item is None:
        raise HTTPException(status_code=404, detail="Saved analysis session not found.")

    return _build_session_payload(item)


@router.get("/storage/stats")
def get_storage_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Calculate the current storage usage of the output directory."""
    from backend.config import STORAGE_QUOTA_MB

    total_size = 0
    if OUTPUT_DIR.exists():
        for path in OUTPUT_DIR.rglob("*"):
            if path.is_file():
                total_size += path.stat().st_size

    total_mb = round(total_size / (1024 * 1024), 2)
    
    return {
        "used_mb": total_mb,
        "quota_mb": STORAGE_QUOTA_MB,
        "percent": min(100, round((total_mb / STORAGE_QUOTA_MB) * 100, 1)) if STORAGE_QUOTA_MB > 0 else 0
    }


@router.delete("/{job_id}")
def delete_history_session(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an analysis session from the database and remove its files."""
    from backend.models import ToothRecord
    
    item = db.scalar(
        select(AnalysisSession)
        .where(AnalysisSession.user_id == current_user.id, AnalysisSession.job_id == job_id)
    )

    if item is None:
        raise HTTPException(status_code=404, detail="Saved analysis session not found.")

    # 1. Delete associated files
    session_dir = OUTPUT_DIR / job_id
    if session_dir.exists() and session_dir.is_dir():
        try:
            shutil.rmtree(session_dir)
        except Exception:
            # Continue even if file deletion fails to maintain DB consistency
            pass

    # 2. Delete from Database
    db.execute(delete(ToothRecord).where(ToothRecord.session_id == item.id))
    db.delete(item)
    db.commit()

    return Response(status_code=204)
