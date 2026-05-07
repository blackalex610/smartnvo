from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base


class CompanionSession(Base):
    __tablename__ = "companion_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(36), unique=True, index=True, nullable=False)
    pairing_code = Column(String(6), index=True, nullable=False)
    exam_id = Column(String(64), nullable=True)
    question_ids = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    pairing_expires_at = Column(DateTime, nullable=False)
    session_expires_at = Column(DateTime, nullable=False)

    devices = relationship(
        "CompanionDevice",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class CompanionDevice(Base):
    __tablename__ = "companion_devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(36), unique=True, index=True, nullable=False)
    session_fk = Column(Integer, ForeignKey("companion_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    device_label = Column(String(64), nullable=True)

    paired_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    session = relationship("CompanionSession", back_populates="devices")
