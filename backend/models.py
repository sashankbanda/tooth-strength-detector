from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    picture_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    sessions: Mapped[List["AnalysisSession"]] = relationship("AnalysisSession", back_populates="user")


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    total_images: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_teeth: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    csv_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    pdf_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    user: Mapped[User] = relationship("User", back_populates="sessions")
    tooth_records: Mapped[List["ToothRecord"]] = relationship(
        "ToothRecord", back_populates="session", cascade="all, delete-orphan"
    )


class ToothRecord(Base):
    __tablename__ = "tooth_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    image_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    fdi: Mapped[int] = mapped_column(Integer, nullable=False)
    strength: Mapped[float] = mapped_column(Float, nullable=False)
    stage: Mapped[str] = mapped_column(String(64), nullable=False)

    session: Mapped[AnalysisSession] = relationship("AnalysisSession", back_populates="tooth_records")
