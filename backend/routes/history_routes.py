from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.auth import get_current_user
from backend.config import OUTPUT_DIR
from backend.database import get_db
from backend.models import AnalysisSession, User


router = APIRouter(prefix="/api/history", tags=["history"])
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
            "url": f"/static/output/{item.job_id}/output_visualizations/{filename}",
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
        },
        "history_saved": True,
        "is_authenticated": True,
        "source_filename": item.source_filename,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


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
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "records_count": len(item.tooth_records),
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
