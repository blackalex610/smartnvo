"""
Reset XP for all users.
This script resets all XP-related data in the database.
"""
import sys
import os

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker, DeclarativeBase
from app.models.progress import UserXpProfile, XpEvent

# Use local SQLite database directly
DB_PATH = os.path.join(backend_dir, "mathlearning.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def reset_all_xp():
    """Reset XP for all users."""
    db: Session = SessionLocal()
    try:
        print("Resetting XP for all users...")

        # Reset all UserXpProfile records
        profiles = db.query(UserXpProfile).all()
        for profile in profiles:
            profile.total_xp = 0
            profile.streak_days = 0
            profile.streak_multiplier = 1.0
            profile.today_xp = 0
            profile.last_activity_date = None
        print(f"Reset {len(profiles)} user XP profiles")

        # Delete all XpEvent records
        deleted_events = db.query(XpEvent).delete()
        print(f"Deleted {deleted_events} XP event records")

        db.commit()
        print("XP reset completed successfully!")
        return True
    except Exception as e:
        db.rollback()
        print(f"Error resetting XP: {e}")
        return False
    finally:
        db.close()


if __name__ == "__main__":
    if reset_all_xp():
        sys.exit(0)
    else:
        sys.exit(1)
