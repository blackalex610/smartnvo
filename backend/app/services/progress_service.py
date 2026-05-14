"""
Progress calculation and management service.
Handles student progress tracking across lessons, topics, and grades.
"""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, cast as sql_cast, Integer
from sqlalchemy.exc import SQLAlchemyError
from typing import Dict, List, Tuple, cast
from app.models.curriculum import Exercise, Lesson, Topic, ExerciseAttempt
from app.models.progress import UserProgress, LessonProgress, UserXpProfile, XpEvent, UserBadge


# ---------------------------------------------------------------------------
# Badge catalogue  (key → display metadata)
# ---------------------------------------------------------------------------
BADGE_CATALOGUE: dict[str, dict] = {
    "first_exercise":    {"title": "Първа стъпка",       "emoji": "🎯", "description": "Реши първата си задача"},
    "streak_3":          {"title": "Трайна серия",        "emoji": "🔥", "description": "3 дни поред"},
    "streak_7":          {"title": "Consistency King",    "emoji": "👑", "description": "7 дни поред"},
    "streak_14":         {"title": "Легенда",             "emoji": "🏆", "description": "14 дни поред"},
    "level_5":           {"title": "Опитен ученик",       "emoji": "⭐", "description": "Достигни Ниво 5"},
    "level_10":          {"title": "Майстор",             "emoji": "💎", "description": "Достигни Ниво 10"},
    "nvo_exam":          {"title": "NVO Ready",           "emoji": "📝", "description": "Реши НВО изпит"},
    "perfect_score":     {"title": "Perfect Score",       "emoji": "✨", "description": "Реши 10 задачи без грешка поред"},
    "exercises_10":      {"title": "Старателен",          "emoji": "📚", "description": "10 правилни отговора"},
    "exercises_50":      {"title": "Упорит",              "emoji": "🚀", "description": "50 правилни отговора"},
    "exercises_100":     {"title": "Математик",           "emoji": "🧮", "description": "100 правилни отговора"},
}


LEVEL_THRESHOLDS: list[int] = [0, 100, 250, 500, 1000, 1600, 2400, 3400, 4600, 6000]
EXERCISE_XP_REWARDS = {
    "easy": 10,
    "medium": 25,
    "hard": 50,
}
STREAK_DAILY_BONUS_XP = 20
NVO_EXAM_XP = 300

STREAK_MULTIPLIERS: list[tuple[int, float]] = [
    (14, 1.5),
    (7, 1.25),
    (3, 1.1),
    (1, 1.0),
]


def _calculate_streak_multiplier(streak_days: int) -> float:
    """Return the XP multiplier for the given streak length."""
    for threshold, multiplier in STREAK_MULTIPLIERS:
        if streak_days >= threshold:
            return multiplier
    return 1.0


class ProgressService:
    """Service for calculating and managing student progress"""
    
    def __init__(self, db: Session):
        self.db = db

    def _get_or_create_xp_profile(self, user_id: int) -> UserXpProfile:
        profile = self.db.query(UserXpProfile).filter(UserXpProfile.user_id == user_id).first()
        if profile:
            return profile

        profile = UserXpProfile(user_id=user_id)
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        return profile

    def _get_level_info(self, total_xp: int) -> Dict[str, int | float]:
        level = 1
        current_level_xp = LEVEL_THRESHOLDS[0]
        next_level_xp = LEVEL_THRESHOLDS[1]

        for index, threshold in enumerate(LEVEL_THRESHOLDS, start=1):
            if total_xp >= threshold:
                level = index
                current_level_xp = threshold
                next_level_xp = LEVEL_THRESHOLDS[index] if index < len(LEVEL_THRESHOLDS) else threshold + 1000
            else:
                break

        xp_into_level = max(0, total_xp - current_level_xp)
        level_span = max(1, next_level_xp - current_level_xp)
        xp_to_next_level = max(0, next_level_xp - total_xp)

        return {
            "level": level,
            "current_level_xp": current_level_xp,
            "next_level_xp": next_level_xp,
            "xp_into_level": xp_into_level,
            "xp_to_next_level": xp_to_next_level,
            "progress_percentage": round((xp_into_level / level_span) * 100, 1),
        }

    def update_streak(self, user_id: int) -> Dict:
        """
        Update streak on daily activity. Must be called once per day (e.g. on login).
        - Same day: no change
        - Yesterday: increment streak, update multiplier
        - Older: reset streak to 1, multiplier to 1.0
        Returns the updated XP summary dict.
        """
        profile = self._get_or_create_xp_profile(user_id)
        today = date.today()
        last_activity_date = cast(date | None, profile.last_activity_date)

        if last_activity_date == today:
            # Already recorded today — nothing to do
            return self.get_xp_summary(user_id)

        if last_activity_date == today - timedelta(days=1):
            # Continued streak
            new_streak = int(cast(int | None, profile.streak_days) or 0) + 1
        else:
            # Streak broken (or first login)
            new_streak = 1

        new_multiplier = _calculate_streak_multiplier(new_streak)
        setattr(profile, "streak_days", new_streak)
        setattr(profile, "streak_multiplier", new_multiplier)
        setattr(profile, "last_activity_date", today)
        # Reset today_xp for the new day then add the streak bonus
        setattr(profile, "today_xp", STREAK_DAILY_BONUS_XP)
        current_total = int(cast(int | None, profile.total_xp) or 0)
        setattr(profile, "total_xp", current_total + STREAK_DAILY_BONUS_XP)
        self.db.add(XpEvent(
            user_id=user_id,
            source_type="streak",
            source_id=new_streak,
            xp_amount=STREAK_DAILY_BONUS_XP,
            reason=f"Daily streak bonus – day {new_streak}",
        ))
        self.db.commit()

        return self.get_xp_summary(user_id)

    def get_xp_summary(self, user_id: int) -> Dict:
        profile = self._get_or_create_xp_profile(user_id)
        total_xp = int(cast(int | None, profile.total_xp) or 0)
        streak_days = int(cast(int | None, profile.streak_days) or 0)
        streak_multiplier = float(cast(float | None, profile.streak_multiplier) or 1.0)
        today_xp = int(cast(int | None, profile.today_xp) or 0)
        level_info = self._get_level_info(total_xp)

        return {
            "user_id": user_id,
            "level": level_info["level"],
            "total_xp": total_xp,
            "current_level_xp": level_info["current_level_xp"],
            "next_level_xp": level_info["next_level_xp"],
            "xp_into_level": level_info["xp_into_level"],
            "xp_to_next_level": level_info["xp_to_next_level"],
            "progress_percentage": level_info["progress_percentage"],
            "streak_days": streak_days,
            "streak_multiplier": round(streak_multiplier, 2),
            "today_xp": today_xp,
        }

    def award_nvo_xp(self, user_id: int) -> int:
        """Award +300 XP for completing an NVO mock exam. Always granted (no dedup)."""
        profile = self._get_or_create_xp_profile(user_id)
        today = date.today()
        last_activity_date = cast(date | None, profile.last_activity_date)
        current_total = int(cast(int | None, profile.total_xp) or 0)
        current_today = int(cast(int | None, profile.today_xp) or 0)

        if last_activity_date != today:
            setattr(profile, "today_xp", 0)
            setattr(profile, "last_activity_date", today)
            current_today = 0

        setattr(profile, "total_xp", current_total + NVO_EXAM_XP)
        setattr(profile, "today_xp", current_today + NVO_EXAM_XP)
        self.db.add(XpEvent(
            user_id=user_id,
            source_type="nvo_exam",
            source_id=0,
            xp_amount=NVO_EXAM_XP,
            reason="Completed NVO mock exam",
        ))
        self.db.commit()
        return NVO_EXAM_XP

    def award_bonus_xp(self, user_id: int, xp_amount: int, source_type: str, source_id: int, reason: str) -> int:
        """Award arbitrary XP (used for mission completion and future bonuses)."""
        if xp_amount <= 0:
            return 0

        profile = self._get_or_create_xp_profile(user_id)
        today = date.today()
        last_activity_date = cast(date | None, profile.last_activity_date)
        current_total = int(cast(int | None, profile.total_xp) or 0)
        current_today = int(cast(int | None, profile.today_xp) or 0)

        if last_activity_date != today:
            setattr(profile, "today_xp", 0)
            setattr(profile, "last_activity_date", today)
            current_today = 0

        setattr(profile, "total_xp", current_total + xp_amount)
        setattr(profile, "today_xp", current_today + xp_amount)

        self.db.add(XpEvent(
            user_id=user_id,
            source_type=source_type,
            source_id=source_id,
            xp_amount=xp_amount,
            reason=reason,
        ))
        self.db.commit()
        return xp_amount

    # ------------------------------------------------------------------
    # Badge system
    # ------------------------------------------------------------------

    def _already_has_badge(self, user_id: int, badge_key: str) -> bool:
        return self.db.query(UserBadge).filter(
            and_(UserBadge.user_id == user_id, UserBadge.badge_key == badge_key)
        ).first() is not None

    def _grant_badge(self, user_id: int, badge_key: str) -> None:
        if self._already_has_badge(user_id, badge_key):
            return
        self.db.add(UserBadge(user_id=user_id, badge_key=badge_key))
        self.db.commit()

    def evaluate_and_grant_badges(self, user_id: int) -> List[str]:
        """
        Check all badge criteria for user and grant any newly earned badges.
        Returns list of newly granted badge keys.
        """
        # Legacy databases may have an older user_badges schema (without badge_key).
        # In that case, skip badge evaluation rather than breaking core flows (e.g. answer submission).
        try:
            self.db.query(UserBadge).first()
        except SQLAlchemyError:
            self.db.rollback()
            return []

        newly_granted: List[str] = []

        profile = self._get_or_create_xp_profile(user_id)
        streak = int(cast(int | None, profile.streak_days) or 0)
        level_info = self._get_level_info(int(cast(int | None, profile.total_xp) or 0))
        level = level_info["level"]

        # Count total correct exercise attempts
        correct_count = self.db.query(func.count(func.distinct(ExerciseAttempt.exercise_id))).filter(
            and_(ExerciseAttempt.user_id == user_id, ExerciseAttempt.is_correct == True)
        ).scalar() or 0

        # Count NVO exams completed
        nvo_count = self.db.query(func.count(XpEvent.id)).filter(
            and_(XpEvent.user_id == user_id, XpEvent.source_type == "nvo_exam")
        ).scalar() or 0

        checks: list[tuple[str, bool]] = [
            ("first_exercise",  correct_count >= 1),
            ("streak_3",        streak >= 3),
            ("streak_7",        streak >= 7),
            ("streak_14",       streak >= 14),
            ("level_5",         level >= 5),
            ("level_10",        level >= 10),
            ("nvo_exam",        nvo_count >= 1),
            ("exercises_10",    correct_count >= 10),
            ("exercises_50",    correct_count >= 50),
            ("exercises_100",   correct_count >= 100),
        ]

        for key, earned in checks:
            if earned and not self._already_has_badge(user_id, key):
                self._grant_badge(user_id, key)
                newly_granted.append(key)

        return newly_granted

    def get_user_badges(self, user_id: int) -> List[Dict]:
        """Return all badges earned by the user, enriched with catalogue metadata."""
        try:
            rows = self.db.query(UserBadge).filter(UserBadge.user_id == user_id).all()
        except SQLAlchemyError:
            self.db.rollback()
            return []
        result = []
        for row in rows:
            badge_key: str = str(row.badge_key)
            meta = BADGE_CATALOGUE.get(badge_key, {
                "title": badge_key, "emoji": "🏅", "description": ""
            })
            result.append({
                "key": row.badge_key,
                "title": meta["title"],
                "emoji": meta["emoji"],
                "description": meta["description"],
                "unlocked_at": row.unlocked_at.isoformat(),
            })
        return result

    def award_exercise_xp(self, user_id: int, exercise_id: int, is_correct: bool) -> int:
        if not is_correct:
            return 0

        exercise = self.db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not exercise:
            return 0

        prior_correct_attempts = self.db.query(func.count(ExerciseAttempt.id)).filter(
            and_(
                ExerciseAttempt.user_id == user_id,
                ExerciseAttempt.exercise_id == exercise_id,
                ExerciseAttempt.is_correct == True,
            )
        ).scalar() or 0

        # Current attempt has already been inserted; only award XP the first time the student solves the exercise.
        if prior_correct_attempts > 1:
            return 0

        profile = self._get_or_create_xp_profile(user_id)
        difficulty = str(exercise.difficulty.value if getattr(exercise.difficulty, "value", None) else exercise.difficulty or "medium").lower()
        base_xp = EXERCISE_XP_REWARDS.get(difficulty, EXERCISE_XP_REWARDS["medium"])
        streak_multiplier = float(cast(float | None, profile.streak_multiplier) or 1.0)
        xp_amount = round(base_xp * streak_multiplier)

        today = date.today()
        last_activity_date = cast(date | None, profile.last_activity_date)
        current_total_xp = int(cast(int | None, profile.total_xp) or 0)
        current_today_xp = int(cast(int | None, profile.today_xp) or 0)

        if last_activity_date != today:
            setattr(profile, "today_xp", 0)
            setattr(profile, "last_activity_date", today)
            current_today_xp = 0

        setattr(profile, "total_xp", current_total_xp + xp_amount)
        setattr(profile, "today_xp", current_today_xp + xp_amount)

        self.db.add(XpEvent(
            user_id=user_id,
            source_type="exercise",
            source_id=exercise_id,
            xp_amount=xp_amount,
            reason=f"Completed {difficulty} exercise",
        ))
        self.db.commit()

        return xp_amount
    
    def update_progress_after_submission(self, user_id: int, exercise_id: int) -> None:
        """
        Main entry point: Update all progress after an exercise submission.
        
        Steps:
        1. Get the exercise and find its lesson/topic
        2. Update lesson progress
        3. Update topic progress
        4. Calculate accuracy statistics
        """
        # Get exercise with relationships
        exercise = self.db.query(Exercise).filter(Exercise.id == exercise_id).first()
        if not exercise:
            return
        
        lesson_id = exercise.lesson_id
        lesson = self.db.query(Lesson).filter(Lesson.id == lesson_id).first()
        if not lesson:
            return
        
        topic_id = lesson.topic_id
        
        # Update lesson progress
        self._update_lesson_progress(user_id, int(lesson_id))  # type: ignore
        
        # Update topic progress
        self._update_topic_progress(user_id, int(topic_id))  # type: ignore
    
    def _update_lesson_progress(self, user_id: int, lesson_id: int) -> LessonProgress:
        """Update progress for a specific lesson"""
        # Get or create lesson progress record
        lesson_progress = self.db.query(LessonProgress).filter(
            and_(
                LessonProgress.user_id == user_id,
                LessonProgress.lesson_id == lesson_id
            )
        ).first()
        
        if not lesson_progress:
            lesson_progress = LessonProgress(
                user_id=user_id,
                lesson_id=lesson_id
            )
            self.db.add(lesson_progress)
        
        # Count total exercises in this lesson
        total_exercises = self.db.query(func.count(Exercise.id)).filter(
            Exercise.lesson_id == lesson_id
        ).scalar() or 0
        
        # Count unique exercises the user has attempted (and gotten correct at least once)
        completed_exercises = self.db.query(func.count(func.distinct(ExerciseAttempt.exercise_id))).join(
            Exercise, ExerciseAttempt.exercise_id == Exercise.id
        ).filter(
            and_(
                Exercise.lesson_id == lesson_id,
                ExerciseAttempt.user_id == user_id,
                ExerciseAttempt.is_correct == True
            )
        ).scalar() or 0
        
        # Update lesson progress
        lesson_progress.total_exercises = total_exercises  # type: ignore
        lesson_progress.completed_exercises = completed_exercises  # type: ignore
        lesson_progress.completed = (completed_exercises == total_exercises and total_exercises > 0)  # type: ignore
        
        self.db.commit()
        self.db.refresh(lesson_progress)
        
        return lesson_progress
    
    def _update_topic_progress(self, user_id: int, topic_id: int) -> UserProgress:
        """Update progress for a specific topic"""
        # Get or create topic progress record
        topic_progress = self.db.query(UserProgress).filter(
            and_(
                UserProgress.user_id == user_id,
                UserProgress.topic_id == topic_id
            )
        ).first()
        
        if not topic_progress:
            topic_progress = UserProgress(
                user_id=user_id,
                topic_id=topic_id
            )
            self.db.add(topic_progress)
        
        # Count total exercises in all lessons of this topic
        total_exercises = self.db.query(func.count(Exercise.id)).join(
            Lesson, Exercise.lesson_id == Lesson.id
        ).filter(
            Lesson.topic_id == topic_id
        ).scalar() or 0
        
        # Count unique exercises completed (correct) in this topic
        completed_exercises = self.db.query(func.count(func.distinct(ExerciseAttempt.exercise_id))).join(
            Exercise, ExerciseAttempt.exercise_id == Exercise.id
        ).join(
            Lesson, Exercise.lesson_id == Lesson.id
        ).filter(
            and_(
                Lesson.topic_id == topic_id,
                ExerciseAttempt.user_id == user_id,
                ExerciseAttempt.is_correct == True
            )
        ).scalar() or 0
        
        # Calculate accuracy for this topic
        # Total attempts in topic
        total_attempts = self.db.query(func.count(ExerciseAttempt.id)).join(
            Exercise, ExerciseAttempt.exercise_id == Exercise.id
        ).join(
            Lesson, Exercise.lesson_id == Lesson.id
        ).filter(
            and_(
                Lesson.topic_id == topic_id,
                ExerciseAttempt.user_id == user_id
            )
        ).scalar() or 0
        
        # Correct attempts in topic
        correct_attempts = self.db.query(func.count(ExerciseAttempt.id)).join(
            Exercise, ExerciseAttempt.exercise_id == Exercise.id
        ).join(
            Lesson, Exercise.lesson_id == Lesson.id
        ).filter(
            and_(
                Lesson.topic_id == topic_id,
                ExerciseAttempt.user_id == user_id,
                ExerciseAttempt.is_correct == True
            )
        ).scalar() or 0
        
        accuracy = (correct_attempts / total_attempts * 100) if total_attempts > 0 else 0.0
        
        # Update topic progress
        topic_progress.total_exercises = total_exercises  # type: ignore
        topic_progress.completed_exercises = completed_exercises  # type: ignore
        topic_progress.accuracy_percentage = accuracy  # type: ignore
        
        self.db.commit()
        self.db.refresh(topic_progress)
        
        return topic_progress
    
    def get_dashboard_stats(self, user_id: int) -> Dict:
        """Get overall statistics for dashboard"""
        # --- Single query for all attempt-level counts ---
        attempt_row = self.db.query(
            func.count(ExerciseAttempt.id).label("total_attempts"),
            func.sum(sql_cast(ExerciseAttempt.is_correct, Integer)).label("correct_attempts"),
            func.count(func.distinct(ExerciseAttempt.exercise_id)).label("total_attempted"),
        ).filter(ExerciseAttempt.user_id == user_id).one()

        total_attempts   = int(attempt_row.total_attempts or 0)
        correct_attempts = int(attempt_row.correct_attempts or 0)
        total_attempted  = int(attempt_row.total_attempted or 0)

        # Unique exercises with at least one correct answer
        total_completed = self.db.query(
            func.count(func.distinct(ExerciseAttempt.exercise_id))
        ).filter(
            ExerciseAttempt.user_id == user_id,
            ExerciseAttempt.is_correct == True
        ).scalar() or 0

        accuracy = (correct_attempts / total_attempts * 100) if total_attempts > 0 else 0.0

        # --- Single query for all progress counts ---
        up_row = self.db.query(
            func.count(func.distinct(UserProgress.topic_id)).label("topics_started"),
            func.sum(sql_cast(
                and_(UserProgress.completed_exercises == UserProgress.total_exercises, UserProgress.total_exercises > 0),
                Integer
            )).label("topics_completed"),
        ).filter(UserProgress.user_id == user_id).one()

        topics_started   = int(up_row.topics_started or 0)
        topics_completed = int(up_row.topics_completed or 0)
        total_topics_available = self.db.query(func.count(Topic.id)).scalar() or 0

        lp_row = self.db.query(
            func.count(func.distinct(LessonProgress.lesson_id)).label("lessons_started"),
            func.sum(sql_cast(LessonProgress.completed, Integer)).label("lessons_completed"),
        ).filter(LessonProgress.user_id == user_id).one()

        lessons_started   = int(lp_row.lessons_started or 0)
        lessons_completed = int(lp_row.lessons_completed or 0)
        total_lessons_available = self.db.query(func.count(Lesson.id)).scalar() or 0
        
        return {
            "total_exercises_completed": total_completed,
            "total_exercises_attempted": total_attempted,
            "accuracy_percentage": round(accuracy, 1),
            "topics_started": topics_started,
            "topics_completed": topics_completed,
            "total_topics_available": total_topics_available,
            "lessons_started": lessons_started,
            "lessons_completed": lessons_completed,
            "total_lessons_available": total_lessons_available,
            "recent_activity": []  # Can be enhanced later
        }
    
    def get_topic_progress_list(self, user_id: int) -> List[Dict]:
        """Get progress for all topics"""
        topics = self.db.query(Topic).all()
        result = []
        
        for topic in topics:
            # Get or calculate progress
            progress_obj = self.db.query(UserProgress).filter(
                and_(
                    UserProgress.user_id == user_id,
                    UserProgress.topic_id == topic.id
                )
            ).first()
            
            if not progress_obj:
                # Calculate on the fly if not exists
                progress_obj = self._update_topic_progress(user_id, int(topic.id))  # type: ignore
            
            # Access values safely
            completed_ex = int(progress_obj.completed_exercises) if progress_obj.completed_exercises is not None else 0  # type: ignore
            total_ex = int(progress_obj.total_exercises) if progress_obj.total_exercises is not None else 0  # type: ignore
            accuracy = float(progress_obj.accuracy_percentage) if progress_obj.accuracy_percentage is not None else 0.0  # type: ignore
            progress_pct = (completed_ex / total_ex * 100) if total_ex > 0 else 0.0
            
            # Count lessons in topic
            total_lessons = self.db.query(func.count(Lesson.id)).filter(
                Lesson.topic_id == topic.id
            ).scalar() or 0
            
            lessons_completed = self.db.query(func.count(LessonProgress.id)).filter(
                and_(
                    LessonProgress.user_id == user_id,
                    LessonProgress.completed == True,
                    LessonProgress.lesson_id.in_(
                        self.db.query(Lesson.id).filter(Lesson.topic_id == topic.id)
                    )
                )
            ).scalar() or 0
            
            # Get grade number
            topic_with_grade = self.db.query(Topic).filter(Topic.id == topic.id).first()
            grade_num = int(topic_with_grade.grade.grade_number) if topic_with_grade and topic_with_grade.grade else 0  # type: ignore
            
            needs_practice = accuracy < 60.0 and completed_ex > 0
            
            result.append({
                "topic_id": topic.id,
                "title": topic.title,
                "description": topic.description,
                "grade_number": grade_num,
                "progress_percentage": round(progress_pct, 1),
                "accuracy": round(accuracy, 1),
                "completed_exercises": completed_ex,
                "total_exercises": total_ex,
                "lessons_completed": lessons_completed,
                "total_lessons": total_lessons,
                "needs_practice": needs_practice
            })
        
        return result
    
    def get_lesson_progress_list(self, user_id: int, topic_id: int) -> List[Dict]:
        """Get progress for all lessons in a topic"""
        lessons = self.db.query(Lesson).filter(Lesson.topic_id == topic_id).all()
        result = []
        
        for lesson in lessons:
            progress_obj = self.db.query(LessonProgress).filter(
                and_(
                    LessonProgress.user_id == user_id,
                    LessonProgress.lesson_id == lesson.id
                )
            ).first()
            
            if not progress_obj:
                # Calculate on the fly
                progress_obj = self._update_lesson_progress(user_id, int(lesson.id))  # type: ignore
            
            # Access values safely
            completed_ex = int(progress_obj.completed_exercises) if progress_obj.completed_exercises is not None else 0  # type: ignore
            total_ex = int(progress_obj.total_exercises) if progress_obj.total_exercises is not None else 0  # type: ignore
            is_completed = bool(progress_obj.completed) if progress_obj.completed is not None else False  # type: ignore
            progress_pct = (completed_ex / total_ex * 100) if total_ex > 0 else 0.0
            
            result.append({
                "lesson_id": lesson.id,
                "title": lesson.title,
                "progress_percentage": round(progress_pct, 1),
                "completed_exercises": completed_ex,
                "total_exercises": total_ex,
                "completed": is_completed
            })
        
        return result
    
    def get_recommendations(self, user_id: int) -> Dict:
        """Get weak topics and recommended lessons"""
        # Single join query: weak UserProgress rows + their Topic in one shot
        weak_rows = (
            self.db.query(UserProgress, Topic)
            .join(Topic, Topic.id == UserProgress.topic_id)
            .filter(
                UserProgress.user_id == user_id,
                UserProgress.accuracy_percentage < 60.0,
                UserProgress.completed_exercises > 0,
            )
            .all()
        )

        weak_topics = []
        weak_topic_ids: List[int] = []
        for progress, topic in weak_rows:
            accuracy_val = float(progress.accuracy_percentage or 0.0)
            weak_topics.append({
                "topic_id": topic.id,
                "title": topic.title,
                "accuracy": round(accuracy_val, 1),
                "reason": f"Accuracy is {accuracy_val:.1f}% (target: 60%+)",
            })
            weak_topic_ids.append(int(topic.id))  # type: ignore

        # Bulk-fetch incomplete lesson progress rows + lessons for top-3 weak topics
        recommended_lessons: List[Dict] = []
        top_topic_ids = weak_topic_ids[:3]
        if top_topic_ids:
            topic_map = {int(t.id): t for _, t in weak_rows if int(t.id) in top_topic_ids}  # type: ignore
            inc_rows = (
                self.db.query(LessonProgress, Lesson)
                .join(Lesson, LessonProgress.lesson_id == Lesson.id)
                .filter(
                    LessonProgress.user_id == user_id,
                    LessonProgress.completed == False,
                    Lesson.topic_id.in_(top_topic_ids),
                )
                .limit(6)
                .all()
            )
            seen_topics: Dict[int, int] = {}
            for lp, lesson in inc_rows:
                tid = int(lesson.topic_id)  # type: ignore
                if seen_topics.get(tid, 0) >= 2:
                    continue
                seen_topics[tid] = seen_topics.get(tid, 0) + 1
                topic = topic_map.get(tid)
                if topic:
                    recommended_lessons.append({
                        "lesson_id": lesson.id,
                        "topic_id": topic.id,
                        "lesson_title": lesson.title,
                        "topic_title": topic.title,
                        "reason": "Practice needed to improve accuracy",
                    })

        if not weak_topics:
            message = "Great work! Keep practicing to maintain your skills! 🎉"
        elif len(weak_topics) == 1:
            message = "Focus on improving one topic and you'll see great progress! 💪"
        else:
            message = "Let's work on these topics together. Practice makes perfect! 📚"

        return {
            "weak_topics": weak_topics,
            "recommended_lessons": recommended_lessons,
            "encouragement_message": message,
        }
