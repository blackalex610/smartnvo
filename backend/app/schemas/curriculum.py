from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DifficultyLevel(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class ExerciseType(str, Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    NUMERIC = "numeric"
    ALGEBRA = "algebra"


# ============================================================================
# Grade Schemas
# ============================================================================

class GradeBase(BaseModel):
    grade_number: int = Field(..., ge=5, le=7, description="Grade number (5-7)")


class GradeCreate(GradeBase):
    pass


class Grade(GradeBase):
    id: int
    
    class Config:
        from_attributes = True


# ============================================================================
# Topic Schemas
# ============================================================================

class TopicBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    grade_id: int


class TopicCreate(TopicBase):
    pass


class Topic(TopicBase):
    id: int
    
    class Config:
        from_attributes = True


# ============================================================================
# Lesson Schemas
# ============================================================================

class LessonBase(BaseModel):
    title: str = Field(..., max_length=255)
    content: Optional[str] = None
    topic_id: int


class LessonCreate(LessonBase):
    pass


class Lesson(LessonBase):
    id: int
    
    class Config:
        from_attributes = True


# ============================================================================
# Exercise Schemas
# ============================================================================

class ExerciseBase(BaseModel):
    question: str
    answer: str
    solution: Optional[str] = None
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    exercise_type: ExerciseType = ExerciseType.NUMERIC
    lesson_id: int


class ExerciseCreate(ExerciseBase):
    pass


class Exercise(ExerciseBase):
    id: int
    
    class Config:
        from_attributes = True


# Exercise without answer (for students)
class ExercisePublic(BaseModel):
    id: int
    question: str
    difficulty: DifficultyLevel
    exercise_type: ExerciseType
    lesson_id: int
    
    class Config:
        from_attributes = True


# ============================================================================
# ExerciseAttempt Schemas
# ============================================================================

class ExerciseAttemptBase(BaseModel):
    submitted_answer: str
    exercise_id: int


class ExerciseAttemptCreate(BaseModel):
    answer: str  # Simplified for API


class ExerciseAttempt(BaseModel):
    id: int
    user_id: int
    exercise_id: int
    submitted_answer: str
    is_correct: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Response Schemas
# ============================================================================

class ExerciseSubmissionResponse(BaseModel):
    correct: bool
    solution: str
    submitted_answer: str
    correct_answer: Optional[str] = None
    xp_gained: int = 0
    leveled_up: bool = False
    new_level: int = 1


class GradeWithTopics(Grade):
    topics: List[Topic] = []


class TopicWithLessons(Topic):
    lessons: List[Lesson] = []


class LessonWithExercises(Lesson):
    exercises: List[ExercisePublic] = []


class GeneratedTheoryResponse(BaseModel):
    lesson_id: int
    title: str
    content: str


class VideoSearchQueriesResponse(BaseModel):
    lesson_id: int
    queries: List[str]


class GeneratedExampleItem(BaseModel):
    difficulty: str
    problem: str
    solution: str


class GeneratedExamplesResponse(BaseModel):
    lesson_id: int
    title: str
    examples: List[GeneratedExampleItem]
