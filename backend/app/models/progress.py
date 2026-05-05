from sqlalchemy import Column, Integer, ForeignKey, Float, DateTime, Boolean, String, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class UserProgress(Base):
    """Track student progress at the topic level"""
    __tablename__ = "user_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)  # Will link to User model later
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)
    completed_exercises = Column(Integer, default=0)
    total_exercises = Column(Integer, default=0)
    accuracy_percentage = Column(Float, default=0.0)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    topic = relationship("Topic")
    
    def __repr__(self):
        progress = (self.completed_exercises / self.total_exercises * 100) if self.total_exercises and self.total_exercises > 0 else 0  # type: ignore
        return f"<UserProgress user={self.user_id} topic={self.topic_id} progress={progress:.1f}%>"


class LessonProgress(Base):
    """Track student progress at the lesson level"""
    __tablename__ = "lesson_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)  # Will link to User model later
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    completed_exercises = Column(Integer, default=0)
    total_exercises = Column(Integer, default=0)
    completed = Column(Boolean, default=False)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    lesson = relationship("Lesson")
    
    def __repr__(self):
        status = "✓" if self.completed is True else "○"  # type: ignore
        return f"<LessonProgress {status} user={self.user_id} lesson={self.lesson_id}>"


class UserXpProfile(Base):
    """Persistent XP state for a user."""
    __tablename__ = "user_xp_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)
    total_xp = Column(Integer, default=0, nullable=False)
    streak_days = Column(Integer, default=0, nullable=False)
    streak_multiplier = Column(Float, default=1.0, nullable=False)
    today_xp = Column(Integer, default=0, nullable=False)
    last_activity_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<UserXpProfile user={self.user_id} xp={self.total_xp}>"


class XpEvent(Base):
    """Audit log of XP gains for future feeds, badges, and mission logic."""
    __tablename__ = "xp_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    source_type = Column(String(50), nullable=False)
    source_id = Column(Integer)
    xp_amount = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<XpEvent user={self.user_id} xp={self.xp_amount} source={self.source_type}>"


class UserBadge(Base):
    """Badges earned by a user."""
    __tablename__ = "user_badges"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    badge_key = Column(String(64), nullable=False)   # e.g. "streak_7", "perfect_score"
    unlocked_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<UserBadge user={self.user_id} badge={self.badge_key}>"


class UserDailyMission(Base):
    """Persisted daily missions with progress for a user."""
    __tablename__ = "user_daily_missions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    mission_date = Column(Date, nullable=False, index=True)
    mission_key = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(String(255), nullable=False)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    required_difficulty = Column(String(16), nullable=False)  # easy|medium|hard
    target_count = Column(Integer, nullable=False, default=3)
    completed_count = Column(Integer, nullable=False, default=0)
    correct_count = Column(Integer, nullable=False, default=0)
    xp_base = Column(Integer, nullable=False, default=40)
    xp_bonus = Column(Integer, nullable=False, default=20)
    route = Column(String(255), nullable=False)
    mission_order = Column(Integer, nullable=False, default=0)
    is_completed = Column(Boolean, nullable=False, default=False)
    xp_awarded = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "mission_date", "mission_key", name="uq_user_daily_mission"),
    )


class UserMissionExercise(Base):
    """Unique exercises counted towards a daily mission."""
    __tablename__ = "user_mission_exercises"

    id = Column(Integer, primary_key=True, index=True)
    mission_id = Column(Integer, ForeignKey("user_daily_missions.id"), nullable=False, index=True)
    exercise_id = Column(Integer, ForeignKey("exercises.id"), nullable=False, index=True)
    is_correct = Column(Boolean, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("mission_id", "exercise_id", name="uq_mission_exercise"),
    )
