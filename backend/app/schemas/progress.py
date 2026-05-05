from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


# ============================================================================
# User Progress Schemas
# ============================================================================

class UserProgressBase(BaseModel):
    user_id: int
    topic_id: int
    completed_exercises: int = 0
    total_exercises: int = 0
    accuracy_percentage: float = 0.0


class UserProgress(UserProgressBase):
    id: int
    progress_percentage: float
    last_updated: datetime
    
    model_config = {"from_attributes": True}


class UserProgressWithTopic(UserProgress):
    topic_title: str
    topic_description: Optional[str] = None


# ============================================================================
# Lesson Progress Schemas
# ============================================================================

class LessonProgressBase(BaseModel):
    user_id: int
    lesson_id: int
    completed_exercises: int = 0
    total_exercises: int = 0
    completed: bool = False


class LessonProgress(LessonProgressBase):
    id: int
    progress_percentage: float
    last_updated: datetime
    
    model_config = {"from_attributes": True}


class LessonProgressWithDetails(LessonProgress):
    lesson_title: str
    lesson_content: Optional[str] = None


# ============================================================================
# Dashboard Statistics
# ============================================================================

class DashboardStats(BaseModel):
    """Overall student statistics for dashboard"""
    total_exercises_completed: int
    total_exercises_attempted: int
    accuracy_percentage: float
    topics_started: int
    topics_completed: int
    total_topics_available: int
    lessons_started: int
    lessons_completed: int
    total_lessons_available: int
    recent_activity: List[str] = []


class XpSummary(BaseModel):
    """Current XP and level snapshot for the student dashboard."""
    user_id: int
    level: int
    total_xp: int
    current_level_xp: int
    next_level_xp: int
    xp_into_level: int
    xp_to_next_level: int
    progress_percentage: float
    streak_days: int
    streak_multiplier: float
    today_xp: int


# ============================================================================
# Topic Progress Response
# ============================================================================

class TopicProgressSummary(BaseModel):
    """Topic-level progress summary"""
    topic_id: int
    title: str
    description: Optional[str] = None
    grade_number: int
    progress_percentage: float
    accuracy: float
    completed_exercises: int
    total_exercises: int
    lessons_completed: int
    total_lessons: int
    needs_practice: bool = False


# ============================================================================
# Lesson Progress Response
# ============================================================================

class LessonProgressSummary(BaseModel):
    """Lesson-level progress summary"""
    lesson_id: int
    title: str
    progress_percentage: float
    completed_exercises: int
    total_exercises: int
    completed: bool


# ============================================================================
# Recommendations
# ============================================================================

class WeakTopic(BaseModel):
    """Topic that needs practice"""
    topic_id: int
    title: str
    accuracy: float
    reason: str


class RecommendedLesson(BaseModel):
    """Recommended lesson to practice"""
    lesson_id: int
    topic_id: int
    lesson_title: str
    topic_title: str
    reason: str


class ProgressRecommendations(BaseModel):
    """Recommendations for student improvement"""
    weak_topics: List[WeakTopic]
    recommended_lessons: List[RecommendedLesson]
    encouragement_message: str


# ============================================================================
# Freemium / Subscription
# ============================================================================

class UserLimitInfo(BaseModel):
    """Current user usage and limits for freemium system"""
    plan: str  # "free" or "premium"
    
    # AI Exercises
    ai_exercises_remaining: int
    ai_exercises_limit: int
    ai_exercises_used_today: int
    
    # AI Chat
    ai_chat_remaining: int
    ai_chat_limit: int
    ai_chat_used_today: int
    
    # NVO Exams
    nvo_exams_remaining: int
    nvo_exams_limit: int
    nvo_exams_used_today: int
    
    # Image Scans
    image_scans_remaining: int
    image_scans_limit: int
    image_scans_used_today: int
    
    # Premium info
    is_premium: bool
    can_upgrade: bool
    days_until_reset: int
