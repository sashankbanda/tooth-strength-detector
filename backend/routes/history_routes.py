from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.auth import get_current_user
from backend.database import get_db
from backend.models import AnalysisSession, User


router = APIRouter(prefix="/api/history", tags=["history"])


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
