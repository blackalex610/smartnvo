from fastapi import APIRouter, Depends, HTTPException
from typing import Callable, List, Union, cast
import asyncio
import json
import os
from pathlib import Path
import random
import uuid
from pydantic import BaseModel
from openai import APIError, OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services.playground_problems import select_playground_problems
from app.routers.mobile_uploads import _ai_grade
from app.services.progress_service import ProgressService
from app.auth.dependencies import get_optional_user, require_nvo_exam
from app.models.user import User

router = APIRouter(prefix="/nvo", tags=["nvo"])
GENERATION_JOBS: dict[str, "NVOGenerationJobStatus"] = {}
GENERATED_EXAMS: dict[str, "NVOExam"] = {}


class NVOQuestion(BaseModel):
    number: int
    question: str
    topic: str
    difficulty: str
    diagram: bool
    diagram_type: str | None = None
    diagram_config: dict | None = None
    open_parts: List[str] | None = None
    options: List[str] | None = None
    correct_answer: Union[str, List[str]] | None = None


class NVOExam(BaseModel):
    exam_id: str
    questions: List[NVOQuestion]


class NVOGenerationJobResponse(BaseModel):
    job_id: str


class NVOGenerationJobStatus(BaseModel):
    job_id: str
    status: str
    progress: int
    message: str
    exam_id: str | None = None


class NVOOpenImageSubmission(BaseModel):
    problemId: int
    image: str


class NVOExamSubmitRequest(BaseModel):
    exam_id: str
    answers: dict[str, str | dict[str, str]]
    open_answer_images: list[NVOOpenImageSubmission]
    questions: list[NVOQuestion] | None = None


class NVOOpenGradeResult(BaseModel):
    problemId: int
    score: int
    max_score: int
    is_correct: bool
    extracted_answer: str
    feedback: str


class NVOExamSubmitResponse(BaseModel):
    exam_id: str
    open_results: list[NVOOpenGradeResult]
    total_open_score: int
    total_open_max_score: int


class NVOGenerationRequest(BaseModel):
    difficulty: str | None = None  # 'easy', 'standard', or 'hard'


def load_nvo_questions() -> dict:
    """Load NVO questions from JSON file"""
    try:
        json_path = os.path.join(os.path.dirname(__file__), "../../nvo_generated_exam.json")
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        backend_dir = Path(json_path).resolve().parent
        transcript_files = sorted(backend_dir.glob("reference_nvo_full_exam_*.txt"))
        full_reference_exams: list[dict[str, str]] = list(data.get("full_reference_exams", []))
        for transcript_file in transcript_files:
            full_reference_exams.append(
                {
                    "source": transcript_file.stem,
                    "raw_text": transcript_file.read_text(encoding="utf-8").strip(),
                }
            )

        if full_reference_exams:
            data["full_reference_exams"] = full_reference_exams

        return data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="NVO exam questions not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid NVO questions format")


def load_nvo_catalog() -> dict:
    """Load the per-slot question catalog from nvo_question_catalog.json."""
    try:
        catalog_path = os.path.join(os.path.dirname(__file__), "../../nvo_question_catalog.json")
        with open(catalog_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="NVO question catalog not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid NVO question catalog format")


def _inject_playground_problems(questions: list) -> list:
    """Replace Q10-Q15 (indices 9-14) and Q23 (index 22) with playground diagram questions.

    Real NVO structure (2024/2025 format, 23 questions):
      Q1-Q8   : arithmetic / algebra / probability  — no diagrams
      Q9      : arithmetic word problem or simple geometry — no diagram injected
      Q10-Q15 : geometry diagram MCQs (triangles, rhombus, parallelogram, 3D, etc.)
      Q16-Q18 : word problems — no diagrams
      Q19     : chart / data reading — no diagram injected (no SVG chart renderer yet)
      Q20     : geometry word problem — no diagram injected
      Q21-Q22 : open algebra / word problem — no diagrams
      Q23     : open geometry — diagram only if generator produces one (4/6 generators have no diagram)
    """
    pg = select_playground_problems()
    result = list(questions)
    for i, mcq_data in enumerate(pg["mcq"]):
        pos = 10 + i  # Q10 through Q15
        data = dict(mcq_data)
        data["number"] = pos
        result[pos - 1] = NVOQuestion(**data)
    q23_data = dict(pg["open_q23"])
    q23_data["number"] = 23
    # Respect the generator's own diagram flag — non-diagram generators set diagram=False
    result[22] = NVOQuestion(**q23_data)
    return result


def _normalize_math_delimiters(text: str) -> str:
    """Keep text intact unless already-delimited math exists; frontend renderer handles raw LaTeX snippets safely."""
    return text.strip()


def _set_job_progress(job_id: str, *, status: str, progress: int, message: str, exam_id: str | None = None) -> None:
    GENERATION_JOBS[job_id] = NVOGenerationJobStatus(
        job_id=job_id,
        status=status,
        progress=progress,
        message=message,
        exam_id=exam_id,
    )


def _fallback_generate_from_pool(progress_callback: Callable[[int, str], None] | None = None) -> NVOExam:
    """Fallback generator: picks one random variant per slot from the catalog.

    For each of the 23 question slots the catalog holds ~5 real official variants.
    This produces a different exam every run while maintaining the correct topic
    at every position.  Diagram slots (Q10-Q15, Q23) are overwritten by
    _inject_playground_problems immediately after.
    """
    if progress_callback:
        progress_callback(10, "Зареждане на каталог с НВО задачи")

    catalog = load_nvo_catalog()
    slots = catalog.get("slots", {})

    if len(slots) != 23:
        raise HTTPException(status_code=500, detail="NVO catalog must have exactly 23 slots")

    normalized: list[NVOQuestion] = []
    if progress_callback:
        progress_callback(45, "Избор на случаен вариант за всяка задача")

    for slot_num in range(1, 24):
        slot = slots[str(slot_num)]
        variants = slot.get("variants", [])
        if not variants:
            raise HTTPException(status_code=500, detail=f"No variants in catalog slot {slot_num}")

        variant = random.choice(variants)
        is_open = slot_num >= 21

        options = variant.get("options")
        if isinstance(options, list) and options:
            shuffled = options[:]
            random.shuffle(shuffled)
        else:
            shuffled = None

        question = NVOQuestion(
            number=slot_num,
            question=_normalize_math_delimiters(str(variant.get("question", ""))),
            topic=slot.get("topic", "general"),
            difficulty=variant.get("difficulty", "medium"),
            diagram=False,  # playground injection overwrites diagram slots
            options=shuffled if not is_open else None,
            open_parts=variant.get("open_parts") if is_open else None,
            correct_answer=variant.get("correct_answer"),
        )
        normalized.append(question)

    if progress_callback:
        progress_callback(80, "Добавяне на диаграмни задачи")

    normalized = _inject_playground_problems(normalized)

    if progress_callback:
        progress_callback(95, "Локалният тест е готов")

    return NVOExam(exam_id=str(uuid.uuid4())[:8], questions=normalized)


def _get_difficulty_instructions(difficulty: str | None) -> str:
    """Return prompt modifications based on difficulty level."""
    if difficulty == 'easy':
        return """
DIFFICULTY: EASY
- Simplify all questions compared to standard NVO level
- Use shorter, clearer explanations and simpler numbers
- Focus on basic understanding and recognition
- Reduce multi-step problems to single-step where possible
- Avoid complex word problems; use straightforward contexts
"""
    elif difficulty == 'hard':
        return """
DIFFICULTY: HARD
- Increase complexity beyond standard NVO level
- Add deeper inference requirements and edge cases
- Combine multiple concepts in single problems
- Require stronger reasoning and multi-step solutions
- Include more challenging numbers and contexts
- Add problems that require creative application of concepts
"""
    else:
        # standard or None
        return """
DIFFICULTY: STANDARD
- Match the standard NVO difficulty level exactly
- Use balanced complexity appropriate for 7th grade
- Follow the difficulty distribution of official exams
"""


def _generate_via_openai(difficulty: str | None = None, progress_callback: Callable[[int, str], None] | None = None) -> NVOExam:
    """Generate a fresh NVO-style test from reference pool using a stronger model."""
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not configured")

    if progress_callback:
        progress_callback(10, "Зареждане на референтен набор")

    catalog = load_nvo_catalog()
    slots = catalog.get("slots", {})

    # Build per-slot style hints: topic description + one random example variant per slot
    slot_hints: list[str] = []
    for slot_num in range(1, 24):
        slot = slots[str(slot_num)]
        topic = slot.get("topic", "")
        notes = slot.get("notes", "")
        variants = slot.get("variants", [])
        example = random.choice(variants) if variants else {}
        example_q = example.get("question", "")[:200]
        slot_hints.append(
            f"Q{slot_num} [{topic}]: {notes}\n"
            f"  Style example: {example_q}"
        )
    slot_guide = "\n".join(slot_hints)

    client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=75.0)
    difficulty_instructions = _get_difficulty_instructions(difficulty)

    system_prompt = (
        "You are an expert Bulgarian 7th-grade NVO math exam generator. "
        "Generate high-quality, exam-grade questions in Bulgarian. "
        "Follow official NVO style and formatting strictly."
    )
    user_prompt = f"""
Create ONE new NVO exam JSON. REWRITE each slot with a FRESH question — same topic, same style, different numbers/context.
Do NOT copy the example questions verbatim.

{difficulty_instructions}

Strict requirements:
1) Exactly 23 questions.
2) Q1-Q20: multiple choice, exactly 4 options each.
3) Q21-Q23: open-ended, options = null, include open_parts list.
4) Bulgarian academic wording.
5) Math: use $...$ inline and $$...$$ block delimiters.
6) SET diagram=false FOR ALL QUESTIONS (Q10-Q15 and Q23 diagrams are auto-injected).
7) Output ONLY a valid JSON object with key "questions".

Per-slot topic guide and style examples:
{slot_guide}
""".strip()

    if progress_callback:
        progress_callback(25, "Генериране на нов НВО вариант чрез AI")

    response = client.chat.completions.create(
        model=settings.OPENAI_NVO_MODEL,
        temperature=0.5,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    if progress_callback:
        progress_callback(70, "Проверка и валидиране на генерирания тест")

    raw = response.choices[0].message.content or ""
    try:
        data = json.loads(raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON for NVO generation") from exc

    questions_data = data.get("questions", [])
    if len(questions_data) != 23:
        raise HTTPException(status_code=502, detail="AI did not return exactly 23 questions")

    validated: list[NVOQuestion] = []
    for idx, q in enumerate(questions_data, start=1):
        item = dict(q)
        item["number"] = idx
        item["question"] = _normalize_math_delimiters(str(item.get("question", "")))
        item["diagram"] = False  # Only playground diagrams allowed
        validated.append(NVOQuestion(**item))

    if progress_callback:
        progress_callback(90, "Добавяне на диаграмни задачи")

    validated = _inject_playground_problems(validated)

    if progress_callback:
        progress_callback(98, "НВО тестът е готов")

    return NVOExam(exam_id=str(uuid.uuid4())[:8], questions=validated)


def _run_generation_job(job_id: str, difficulty: str | None = None) -> None:
    def progress_callback(progress: int, message: str) -> None:
        _set_job_progress(job_id, status="running", progress=progress, message=message)

    try:
        _set_job_progress(job_id, status="running", progress=2, message="Създаване на заявка за нов тест")
        try:
            exam = _generate_via_openai(difficulty, progress_callback)
        except (ValueError, APIError, HTTPException):
            _set_job_progress(job_id, status="running", progress=35, message="AI не е наличен. Превключване към локален генератор")
            exam = _fallback_generate_from_pool(progress_callback)

        GENERATED_EXAMS[exam.exam_id] = exam
        _set_job_progress(job_id, status="completed", progress=100, message="Тестът е готов за стартиране", exam_id=exam.exam_id)
    except Exception as exc:
        _set_job_progress(job_id, status="failed", progress=100, message=f"Неуспешно генериране на НВО тест: {exc}")


@router.post("/generate")
async def generate_nvo_exam(_user=Depends(require_nvo_exam)) -> NVOExam:
    """Generate a fresh NVO exam each click. Uses OpenAI when available, fallback otherwise."""
    try:
        return _generate_via_openai()
    except (ValueError, APIError, HTTPException):
        return _fallback_generate_from_pool()


@router.post("/generate-job", response_model=NVOGenerationJobStatus)
async def create_nvo_generation_job(request: NVOGenerationRequest | None = None, _user=Depends(require_nvo_exam)) -> NVOGenerationJobStatus:
    job_id = str(uuid.uuid4())[:8]
    difficulty = request.difficulty if request else None
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _run_generation_job, job_id, difficulty)
    job = GENERATION_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=500, detail="NVO generation job missing after run")
    if job.status == "failed":
        raise HTTPException(status_code=500, detail=job.message)
    return job


@router.get("/generate-job/{job_id}", response_model=NVOGenerationJobStatus)
async def get_nvo_generation_job(job_id: str) -> NVOGenerationJobStatus:
    job = GENERATION_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="NVO generation job not found")
    return job


@router.get("/generated/{exam_id}", response_model=NVOExam)
async def get_generated_nvo_exam(exam_id: str) -> NVOExam:
    exam = GENERATED_EXAMS.get(exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Generated NVO exam not found")
    return exam


@router.get("/questions")
async def get_nvo_questions() -> dict:
    """Get all available NVO questions (for admin/preview purposes)"""
    return load_nvo_questions()


@router.post("/submit", response_model=NVOExamSubmitResponse)
async def submit_nvo_exam(payload: NVOExamSubmitRequest, db: Session = Depends(get_db)) -> NVOExamSubmitResponse:
    exam = GENERATED_EXAMS.get(payload.exam_id)
    if not exam:
        if payload.questions:
            exam = NVOExam(exam_id=payload.exam_id, questions=payload.questions)
        else:
            raise HTTPException(status_code=404, detail="Generated NVO exam not found")

    image_by_problem = {item.problemId: item.image for item in payload.open_answer_images}
    open_results: list[NVOOpenGradeResult] = []
    total_open_score = 0
    total_open_max_score = 0

    for question in exam.questions:
        if question.options is not None:
            continue

        raw_answer = payload.answers.get(str(question.number), "")
        if isinstance(raw_answer, dict):
            student_work = " ".join(f"{k}: {v}" for k, v in raw_answer.items()).strip()
        else:
            student_work = str(raw_answer or "").strip()

        image_data_url = image_by_problem.get(question.number, "")
        if image_data_url and not image_data_url.startswith("data:image/"):
            raise HTTPException(status_code=400, detail=f"Invalid image format for problem {question.number}")

        correct_answer = question.correct_answer
        if isinstance(correct_answer, list):
            correct_xy = " | ".join(str(item) for item in correct_answer)
        else:
            correct_xy = str(correct_answer or "")

        if not student_work and not image_data_url:
            total_open_max_score += 1
            open_results.append(
                NVOOpenGradeResult(
                    problemId=question.number,
                    score=0,
                    max_score=1,
                    is_correct=False,
                    extracted_answer="",
                    feedback="Липсва подаден отговор за тази задача.",
                )
            )
            continue

        try:
            is_correct, extracted, feedback = _ai_grade(
                statement=question.question,
                correct_xy=correct_xy,
                student_work=student_work or "(вижте снимката)",
                image_data_url=image_data_url or None,
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail="Failed to grade open-ended response") from exc

        total_open_max_score += 1
        score = 1 if is_correct else 0
        total_open_score += score
        open_results.append(
            NVOOpenGradeResult(
                problemId=question.number,
                score=score,
                max_score=1,
                is_correct=is_correct,
                extracted_answer=extracted,
                feedback=feedback,
            )
        )

    return NVOExamSubmitResponse(
        exam_id=payload.exam_id,
        open_results=open_results,
        total_open_score=total_open_score,
        total_open_max_score=total_open_max_score,
    )


@router.post("/award-xp")
async def award_nvo_exam_xp(
    user_id: int | None = None,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Award +300 XP for completing an NVO mock exam."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    resolved_user_id = int(cast(int, current_user.id))

    service = ProgressService(db)
    xp_gained = service.award_nvo_xp(resolved_user_id)
    service.evaluate_and_grant_badges(resolved_user_id)
    summary = service.get_xp_summary(resolved_user_id)
    return {**summary, "xp_gained": xp_gained}
