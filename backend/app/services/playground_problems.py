"""
playground_problems.py
Generates NVO-style exam questions from playground diagram problem pools.
Each generator returns a fully formed question dict compatible with NVOQuestion.

Placement in the exam:
  Q10–Q15 (indices 9–14): 6 MCQ geometry diagram questions
  Q23     (index 22):     1 open-ended multi-part diagram question
"""
import math
import random


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _pick(lst):
    return lst[random.randrange(len(lst))]


def _make_mcq(correct_val, wrongs, fmt=lambda v: str(v)):
    """
    Shuffle correct + 3 wrong answers, return (options_list, correct_letter).
    options_list entries look like "А) 30°".
    """
    pool = [correct_val] + list(wrongs[:3])
    random.shuffle(pool)
    letters = ["А", "Б", "В", "Г"]
    options = [f"{letters[i]}) {fmt(pool[i])}" for i in range(4)]
    correct_letter = letters[pool.index(correct_val)]
    return options, correct_letter


def _base(topic="Геометрия", difficulty="medium"):
    return {"topic": topic, "difficulty": difficulty, "diagram": True}


# ─── Task 18 — RightTriPerimDiagram ──────────────────────────────────────────

RIGHT_TRI_POOL = [
    {"AC": 3,  "CB": 4},   # hyp=5,  perim=12
    {"AC": 6,  "CB": 8},   # hyp=10, perim=24
    {"AC": 5,  "CB": 12},  # hyp=13, perim=30
    {"AC": 8,  "CB": 15},  # hyp=17, perim=40
    {"AC": 9,  "CB": 12},  # hyp=15, perim=36
    {"AC": 12, "CB": 16},  # hyp=20, perim=48
    {"AC": 10, "CB": 24},  # hyp=26, perim=60
    {"AC": 7,  "CB": 24},  # hyp=25, perim=56
]


def generate_right_tri_perim():
    cfg = _pick(RIGHT_TRI_POOL)
    AC, CB = cfg["AC"], cfg["CB"]
    hyp = round(math.sqrt(AC * AC + CB * CB))
    perim = AC + CB + hyp
    # Wrong answers: just legs sum, AC+hyp, CB+hyp
    wrongs = [AC + CB, AC + hyp, CB + hyp]
    options, correct = _make_mcq(perim, wrongs, lambda v: f"{v} cm")
    return {
        **_base(),
        "diagram_type": "RightTriPerimDiagram",
        "diagram_config": {"AC": AC, "CB": CB},
        "question": (
            f"В правоъгълен триъгълник ABC, ∠ACB = 90°, AC = {AC} cm и CB = {CB} cm. "
            "Периметърът на триъгълника е:"
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 19 — PerpBisecCMDiagram ────────────────────────────────────────────

PERP_BISEC_CM_POOL = [
    {"angB": 30, "AC": 2},
    {"angB": 30, "AC": 4},
    {"angB": 30, "AC": 6},
    {"angB": 30, "AC": 8},
]


def generate_perp_bisec_cm():
    cfg = _pick(PERP_BISEC_CM_POOL)
    angB, AC = cfg["angB"], cfg["AC"]
    CM = AC  # always equals AC when angB=30°
    wrongs = [2 * AC, AC // 2 if AC > 2 else AC + 1, AC + 2]
    options, correct = _make_mcq(CM, wrongs, lambda v: f"{v} cm")
    return {
        **_base(),
        "diagram_type": "PerpBisecCMDiagram",
        "diagram_config": {"angB": angB, "AC": AC},
        "question": (
            f"В правоъгълен триъгълник ABC, ∠ACB = 90°, ∠ABC = {angB}°. "
            f"Симетралата на AC пресича AB в точка M. Ако AC = {AC} cm, то CM е равно на:"
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 20 — CongrTriDiagram ────────────────────────────────────────────────

CONGR_TRI_POOL = [
    {"angACB": 80, "angMOC": 70},
    {"angACB": 80, "angMOC": 60},
    {"angACB": 70, "angMOC": 80},
    {"angACB": 60, "angMOC": 80},
    {"angACB": 75, "angMOC": 70},
    {"angACB": 65, "angMOC": 60},
    {"angACB": 80, "angMOC": 50},
    {"angACB": 70, "angMOC": 60},
]


def generate_congr_tri():
    cfg = _pick(CONGR_TRI_POOL)
    angACB, angMOC = cfg["angACB"], cfg["angMOC"]
    flip = _pick([False, True])
    angABC = angMOC // 2
    angBAC = 180 - angACB - angABC
    wrongs = [angACB - angABC, angMOC, angACB]
    # Remove correct if it accidentally appears in wrongs
    wrongs = [w for w in wrongs if w != angBAC][:3]
    while len(wrongs) < 3:
        wrongs.append(angBAC + 5 * (len(wrongs) + 1))
    options, correct = _make_mcq(angBAC, wrongs, lambda v: f"{v}°")
    return {
        **_base(),
        "diagram_type": "CongrTriDiagram",
        "diagram_config": {"angACB": angACB, "angMOC": angMOC, "flipO": flip},
        "question": (
            f"Триъгълниците △ABC и △PMT са еднакви (△ABC ≡ △PMT). "
            f"Страните BC и MT се пресичат в точка O. "
            f"Ако ∠ACB = {angACB}° и ∠MOC = {angMOC}°, намерете ∠BAC."
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 21 — RhombusCOMDiagram ─────────────────────────────────────────────

RHOMBUS_COM_POOL = [
    {"angADB": 60},  # angCOM=30
    {"angADB": 50},  # angCOM=40
    {"angADB": 45},  # angCOM=45
    {"angADB": 40},  # angCOM=50
    {"angADB": 30},  # angCOM=60
]


def generate_rhombus_com():
    cfg = _pick(RHOMBUS_COM_POOL)
    angADB = cfg["angADB"]
    angCOM = 90 - angADB
    wrongs = [angADB, 90 + angADB - 180, abs(90 - 2 * angADB)]
    wrongs = [w for w in wrongs if w != angCOM and w > 0][:3]
    while len(wrongs) < 3:
        wrongs.append(angCOM + 5 * (len(wrongs) + 1))
    options, correct = _make_mcq(angCOM, wrongs, lambda v: f"{v}°")
    return {
        **_base(),
        "diagram_type": "RhombusCOMDiagram",
        "diagram_config": {"angADB": angADB},
        "question": (
            f"В ромб ABCD диагоналите се пресичат в точка O, "
            f"а M е средата на страната BC. "
            f"Ако ∠ADB = {angADB}°, намерете ∠COM."
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 26 — IntersectLinesDiagram ─────────────────────────────────────────

INTERSECT_LINES_POOL = [
    {"k1": 10, "k2": 20, "aAng": 5,  "bAng": 70},
    {"k1": 20, "k2": 10, "aAng": 15, "bAng": 80},
    {"k1": 30, "k2": 0,  "aAng": 10, "bAng": 60},
    {"k1": 0,  "k2": 30, "aAng": 20, "bAng": 75},
    {"k1": 40, "k2": 20, "aAng": 0,  "bAng": 65},
    {"k1": 10, "k2": 20, "aAng": 25, "bAng": 85},
    {"k1": 20, "k2": 10, "aAng": 8,  "bAng": 55},
    {"k1": 30, "k2": 0,  "aAng": 18, "bAng": 78},
]


def generate_intersect_lines():
    cfg = _pick(INTERSECT_LINES_POOL)
    k1, k2 = cfg["k1"], cfg["k2"]
    x = (180 - k1 - k2) / 3
    ang1 = 2 * x + k1
    ang2 = x + k2
    smaller = int(min(ang1, ang2))
    larger = int(max(ang1, ang2))
    wrongs = [larger, 180 - smaller, 90 - smaller if 90 - smaller > 0 else smaller + 10]
    wrongs = [w for w in wrongs if w != smaller][:3]
    while len(wrongs) < 3:
        wrongs.append(smaller + 5 * (len(wrongs) + 1))
    options, correct = _make_mcq(smaller, wrongs, lambda v: f"{v}°")
    return {
        **_base(),
        "diagram_type": "IntersectLinesDiagram",
        "diagram_config": cfg,
        "question": (
            f"Правите a и b се пресичат. "
            f"Два от образуваните ъгли са (2x + {k1})° и (x + {k2})°. "
            "По-малкият от двата ъгъла е:"
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 27 — ExtAngBDiagram ─────────────────────────────────────────────────

EXT_ANG_B_POOL = [
    {"angA": 35, "angC": 85, "extAt": "B", "givenExt": "A"},
    {"angA": 30, "angC": 80, "extAt": "B", "givenExt": "A"},
    {"angA": 40, "angC": 95, "extAt": "B", "givenExt": "A"},
    {"angA": 35, "angC": 85, "extAt": "B", "givenExt": "C"},
    {"angA": 45, "angC": 65, "extAt": "B", "givenExt": "C"},
    {"angA": 50, "angC": 70, "extAt": "A", "givenExt": "B"},
    {"angA": 55, "angC": 75, "extAt": "A", "givenExt": "B"},
    {"angA": 55, "angC": 75, "extAt": "A", "givenExt": "C"},
    {"angA": 40, "angC": 75, "extAt": "C", "givenExt": "A"},
    {"angA": 30, "angC": 95, "extAt": "C", "givenExt": "A"},
    {"angA": 40, "angC": 75, "extAt": "C", "givenExt": "B"},
]


def generate_ext_ang_b():
    cfg = _pick(EXT_ANG_B_POOL)
    angA, angC = cfg["angA"], cfg["angC"]
    extAt, givenExt = cfg["extAt"], cfg["givenExt"]
    angB = 180 - angA - angC

    def ext_of(v):
        return 180 - (angA if v == "A" else angB if v == "B" else angC)

    def int_of(v):
        return angA if v == "A" else angB if v == "B" else angC

    third = next(v for v in ["A", "B", "C"] if v != extAt and v != givenExt)
    find_ext = ext_of(extAt)
    given_ext_val = ext_of(givenExt)
    int_third = int_of(third)

    wrongs = [int_of(extAt), 180 - int_of(givenExt), int_third]
    wrongs = [w for w in wrongs if w != find_ext][:3]
    while len(wrongs) < 3:
        wrongs.append(find_ext + 5 * (len(wrongs) + 1))

    options, correct = _make_mcq(find_ext, wrongs, lambda v: f"{v}°")
    return {
        **_base(),
        "diagram_type": "ExtAngBDiagram",
        "diagram_config": cfg,
        "question": (
            f"В △ABC, ∠{givenExt} = {given_ext_val}° (външен ъгъл при {givenExt}), "
            f"∠{third} = {int_third}°. "
            f"Намерете външния ъгъл при върха {extAt}."
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 28 — IsoscAltDiagram ────────────────────────────────────────────────

ISOSC_ALT_POOL = [
    {"AH": 3, "ratioP": 3, "ratioQ": 4},   # HC=4, BC=5
    {"AH": 4, "ratioP": 4, "ratioQ": 3},   # HC=3, BC=5
    {"AH": 6, "ratioP": 3, "ratioQ": 4},   # HC=8, BC=10
    {"AH": 5, "ratioP": 5, "ratioQ": 12},  # HC=12, BC=13
]


def generate_isosc_alt():
    cfg = _pick(ISOSC_ALT_POOL)
    AH, rP, rQ = cfg["AH"], cfg["ratioP"], cfg["ratioQ"]
    HC = AH * rQ / rP
    BC = round(math.sqrt(AH * AH + HC * HC))
    wrongs = [AH, int(HC), AH + int(HC)]
    wrongs = [w for w in wrongs if w != BC][:3]
    while len(wrongs) < 3:
        wrongs.append(BC + len(wrongs))
    options, correct = _make_mcq(BC, wrongs, lambda v: f"{v} cm")
    return {
        **_base(),
        "diagram_type": "IsoscAltDiagram",
        "diagram_config": cfg,
        "question": (
            f"В равнобедрен △ABC (AC = BC), CH е перпендикулярна на AB. "
            f"Ако AH = {AH} cm и AH : HC = {rP} : {rQ}, то BC е равно на:"
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 29 — PerpBisecBCDiagram ────────────────────────────────────────────

PERP_BISEC_BC_POOL = [
    {"angB": 30, "MD": 2, "angA": 50},
    {"angB": 30, "MD": 2, "angA": 65},
    {"angB": 30, "MD": 2, "angA": 80},
    {"angB": 30, "MD": 2, "angA": 95},
    {"angB": 30, "MD": 2, "angA": 110},
    {"angB": 30, "MD": 3, "angA": 55},
    {"angB": 30, "MD": 3, "angA": 75},
    {"angB": 30, "MD": 3, "angA": 90},
    {"angB": 30, "MD": 4, "angA": 60},
    {"angB": 30, "MD": 4, "angA": 100},
]

def generate_perp_bisec_bc():
    cfg = _pick(PERP_BISEC_BC_POOL)
    angB, MD, angA = cfg["angB"], cfg["MD"], cfg["angA"]
    CM = round(MD / math.sin(math.radians(angB)))
    wrongs = [CM + 2, CM - 1, MD]
    wrongs = [w for w in wrongs if w != CM][:3]
    while len(wrongs) < 3:
        wrongs.append(CM + len(wrongs))
    options, correct = _make_mcq(CM, wrongs, lambda v: f"{v} cm")
    return {
        **_base(),
        "diagram_type": "PerpBisecBCDiagram",
        "diagram_config": cfg,
        "question": (
            f"В △ABC, ∠ABC = {angB}°. Симетралата на BC пресича AB в точка M "
            f"и BC в точка D (D е средата на BC, MD ⊥ BC). "
            f"Ако MD = {MD} cm, намерете CM."
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 30 — ParallelDLDiagram ─────────────────────────────────────────────

PARALLEL_DL_POOL = [
    {"angALD": 65},  # angDAB=50
    {"angALD": 60},  # angDAB=60
    {"angALD": 70},  # angDAB=40
    {"angALD": 55},  # angDAB=70
    {"angALD": 75},  # angDAB=30
]


def generate_parallel_dl():
    cfg = _pick(PARALLEL_DL_POOL)
    angALD = cfg["angALD"]
    angDAB = 180 - 2 * angALD
    wrongs = [angDAB + 10, angALD, 180 - angDAB]
    wrongs = [w for w in wrongs if w != angDAB][:3]
    while len(wrongs) < 3:
        wrongs.append(angDAB + 5 * (len(wrongs) + 1))
    options, correct = _make_mcq(angDAB, wrongs, lambda v: f"{v}°")
    return {
        **_base(),
        "diagram_type": "ParallelDLDiagram",
        "diagram_config": cfg,
        "question": (
            f"В успоредник ABCD, DL е ъглополовяща на ∠ADC, а L е точка на AB. "
            f"Ако ∠ALD = {angALD}°, то ∠DAB е равно на:"
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 31 — BoxVolumeDiagram ──────────────────────────────────────────────

BOX_VOLUME_DIM_POOL = [
    {"w": 2, "d": 3, "h": 5},
    {"w": 3, "d": 2, "h": 4},
    {"w": 5, "d": 4, "h": 2},
    {"w": 4, "d": 5, "h": 3},
    {"w": 6, "d": 2, "h": 3},
    {"w": 2, "d": 7, "h": 2},
    {"w": 3, "d": 6, "h": 2},
    {"w": 5, "d": 2, "h": 6},
]

_BOX_WIDTH_EDGES  = ["AB",   "A1B1"]
_BOX_DEPTH_EDGES  = ["BC",   "D1C1"]
_BOX_HEIGHT_EDGES = ["AA1",  "BB1"]


def _fmt_dm_in_random_metric(dm):
    unit = _pick(["dm", "cm", "mm"])
    if unit == "dm":
        return f"{dm} dm"
    if unit == "cm":
        return f"{dm * 10} cm"
    return f"{dm * 100} mm"


def generate_box_volume():
    dims = _pick(BOX_VOLUME_DIM_POOL)
    w, d, h = dims["w"], dims["d"], dims["h"]
    vol = w * d * h
    w_edge = _pick(_BOX_WIDTH_EDGES)
    d_edge = _pick(_BOX_DEPTH_EDGES)
    h_edge = _pick(_BOX_HEIGHT_EDGES)
    labels = [
        {"text": _fmt_dm_in_random_metric(w), "edge": w_edge},
        {"text": _fmt_dm_in_random_metric(d), "edge": d_edge},
        {"text": _fmt_dm_in_random_metric(h), "edge": h_edge},
    ]
    cfg = {
        "vol": vol,
        "dmValues": [w, d, h],
        "labels": labels,
    }
    wrongs = [vol // 10 if vol >= 10 else vol + 5, vol * 10, vol * 100]
    wrongs = [w2 for w2 in wrongs if w2 != vol][:3]
    while len(wrongs) < 3:
        wrongs.append(vol + len(wrongs))
    label_texts = [lb["text"] for lb in labels]
    options, correct = _make_mcq(vol, wrongs, lambda v: f"{v} dm³")
    return {
        **_base(),
        "diagram_type": "BoxVolumeDiagram",
        "diagram_config": cfg,
        "question": (
            f"На фигурата е изобразен правоъгълен паралелепипед ABCDA₁B₁C₁D₁ "
            f"с размери {label_texts[0]}, {label_texts[1]} и {label_texts[2]}. "
            "Обемът на паралелепипеда в dm³ е:"
        ),
        "options": options,
        "correct_answer": correct,
    }


# ─── Task 33 — RightTriABDiagram (open-ended Q23, type A) ────────────────────
#
# Geometry: △ABC and △ABD share hypotenuse AB.
#   C lies on the perpendicular bisector of AB  →  AC=BC, ∠ACB=90°  →  S(△ABC)=AB²/4
#   D lies such that ∠ADB=90° (proven via DM = AB/2 median theorem)
#   ∠BAD:∠ABD = ratio_p:ratio_q  →  ∠BAD = 90°·p/(p+q)
#   S(△ABD) = AB²·sin(2·∠BAD)/4

RIGHT_TRI_AB_POOL = [
    # ratio 1:5  →  ∠BAD = 15°,  S(△ABD) = AB²/8  (sin30°=½)
    {"ratio_p": 1, "ratio_q": 5, "angle_bad": 15, "dm": 4,  "ab": 8,  "areaABC": 16,  "areaABD_str": "8"},
    {"ratio_p": 1, "ratio_q": 5, "angle_bad": 15, "dm": 6,  "ab": 12, "areaABC": 36,  "areaABD_str": "18"},
    {"ratio_p": 1, "ratio_q": 5, "angle_bad": 15, "dm": 8,  "ab": 16, "areaABC": 64,  "areaABD_str": "32"},
    {"ratio_p": 1, "ratio_q": 5, "angle_bad": 15, "dm": 10, "ab": 20, "areaABC": 100, "areaABD_str": "50"},
    # ratio 1:2  →  ∠BAD = 30°,  S(△ABD) = AB²√3/8  (sin60°=√3/2)
    {"ratio_p": 1, "ratio_q": 2, "angle_bad": 30, "dm": 4,  "ab": 8,  "areaABC": 16,  "areaABD_str": "8\\sqrt{3}"},
    {"ratio_p": 1, "ratio_q": 2, "angle_bad": 30, "dm": 6,  "ab": 12, "areaABC": 36,  "areaABD_str": "18\\sqrt{3}"},
    {"ratio_p": 1, "ratio_q": 2, "angle_bad": 30, "dm": 8,  "ab": 16, "areaABC": 64,  "areaABD_str": "32\\sqrt{3}"},
    {"ratio_p": 1, "ratio_q": 2, "angle_bad": 30, "dm": 10, "ab": 20, "areaABC": 100, "areaABD_str": "50\\sqrt{3}"},
    # ratio 2:1  →  ∠BAD = 60°,  S(△ABD) = AB²√3/8  (sin120°=√3/2, same formula)
    {"ratio_p": 2, "ratio_q": 1, "angle_bad": 60, "dm": 4,  "ab": 8,  "areaABC": 16,  "areaABD_str": "8\\sqrt{3}"},
    {"ratio_p": 2, "ratio_q": 1, "angle_bad": 60, "dm": 6,  "ab": 12, "areaABC": 36,  "areaABD_str": "18\\sqrt{3}"},
    {"ratio_p": 2, "ratio_q": 1, "angle_bad": 60, "dm": 8,  "ab": 16, "areaABC": 64,  "areaABD_str": "32\\sqrt{3}"},
    {"ratio_p": 2, "ratio_q": 1, "angle_bad": 60, "dm": 10, "ab": 20, "areaABC": 100, "areaABD_str": "50\\sqrt{3}"},
]


def generate_right_tri_ab():
    cfg = _pick(RIGHT_TRI_AB_POOL)
    rp, rq = cfg["ratio_p"], cfg["ratio_q"]
    dm, ab, areaABC = cfg["dm"], cfg["ab"], cfg["areaABC"]
    angle_bad, area_str = cfg["angle_bad"], cfg["areaABD_str"]
    return {
        **_base(difficulty="hard"),
        "diagram_type": "RightTriABDiagram",
        "diagram_config": cfg,
        "open_parts": ["А", "Б", "В", "Г"],
        "question": (
            f"Триъгълниците △ABC и △ABD имат обща хипотенуза AB. "
            f"Точката C лежи на симетралата на AB (∠ACB = 90°). "
            f"∠BAD : ∠ABD = {rp} : {rq}. Медианата DM към хипотенузата AB е DM = {dm} cm.\n"
            f"А) Намерете дължината на AB.\n"
            f"Б) Намерете лицето на △ABC.\n"
            f"В) Намерете ∠BAD.\n"
            f"Г) Намерете лицето на △ABD."
        ),
        "options": None,
        "correct_answer": [
            f"AB = {ab} cm",
            f"S(△ABC) = {areaABC} cm²",
            f"∠BAD = {angle_bad}°",
            f"S(△ABD) = {area_str} cm²",
        ],
    }


# ─── Task 34 — ParallelogramABCDDiagram (open-ended Q23, type B) ─────────────
#
# Source: НВО Математика VII клас, 21.06.2024, Вариант 1, Задача 23
# Geometry: Parallelogram ABCD (AB>AD), ∠BAD=45°.
#   DK ⊥ AB  (K ∈ AB),  DK meets diagonal AC at F.
#   Through D a line perpendicular to AC meets AC at H and AB at L.
#   ∠DAC : ∠BAC = 2 : 1  →  ∠DAC=30°, ∠BAC=15°
# Results:
#   △ADL has angles 45°, 60°, 75°;  BC:DH = 2:1
#   △AFK ≅ △DLK  (AAS: right angles at K, ∠KAF=∠KDL=15°, AK=DK since ∠BAD=45°)
#   S(△DLC) = m·n/2,  S(ABCD) = m·n   where AF=m, CH=n

PARALLELOGRAM_Q23_POOL = [
    {"m": 3, "n": 4},
    {"m": 2, "n": 6},
    {"m": 4, "n": 5},
    {"m": 3, "n": 8},
    {"m": 5, "n": 4},
    {"m": 2, "n": 10},
    {"m": 6, "n": 3},
    {"m": 4, "n": 8},
]


def generate_parallelogram_q23():
    cfg = _pick(PARALLELOGRAM_Q23_POOL)
    m, n = cfg["m"], cfg["n"]
    area_dlc = m * n // 2  # always integer since at least one of m,n is even in pool
    area_abcd = m * n
    return {
        **_base(difficulty="hard"),
        "diagram_type": "ParallelogramABCDDiagram",
        "diagram_config": {"angBAD": 45, "ratioDAC": 2, "ratioBAC": 1, "m": m, "n": n},
        "open_parts": ["А", "Б", "В"],
        "question": (
            f"В успоредника ABCD (AB > AD) ∠BAD = 45° и височината DK (K ∈ AB) "
            f"към страната AB пресича диагонала AC в точка F. "
            f"През върха D е построена права, перпендикулярна на AC, "
            f"която пресича AC в точка H и AB в точка L.\n"
            f"А) Ако ∠DAC : ∠BAC = 2 : 1, намерете ъглите на △ADL "
            f"и определете отношението BC : DH.\n"
            f"Б) Докажете, че △AFK ≅ △DLK.\n"
            f"В) Ако AF = {m} cm и CH = {n} cm, намерете лицата на △DLC "
            f"и на успоредника ABCD."
        ),
        "options": None,
        "correct_answer": [
            "Ъглите на △ADL: ∠DAL = 45°, ∠ADL = 60°, ∠DLA = 75°;  BC : DH = 2 : 1",
            (
                "∠AKF = ∠DKL = 90° (DK ⊥ AB);  ∠KAF = ∠KDL = 15° (DL ⊥ AC, ∠BAC=15°);  "
                "AK = DK (от △ADK: ∠DAK=45° → равнобедрен прав △);  "
                "∴ △AFK ≅ △DLK (AAS)"
            ),
            f"S(△DLC) = AF · CH / 2 = {m} · {n} / 2 = {area_dlc} cm²;  "
            f"S(ABCD) = AF · CH = {m} · {n} = {area_abcd} cm²",
        ],
    }


# ─── Selector ─────────────────────────────────────────────────────────────────

# All MCQ generators (tasks 18–21, 26–30, 31)
_MCQ_GENERATORS = [
    generate_right_tri_perim,    # Task 18
    generate_perp_bisec_cm,      # Task 19
    generate_congr_tri,          # Task 20
    generate_rhombus_com,        # Task 21
    generate_intersect_lines,    # Task 26
    generate_ext_ang_b,          # Task 27
    generate_isosc_alt,          # Task 28
    generate_perp_bisec_bc,      # Task 29
    generate_parallel_dl,        # Task 30
    generate_box_volume,         # Task 31
]

# Q23 open-ended generators — picked randomly each session
_Q23_GENERATORS = [
    generate_right_tri_ab,       # Shared-hypotenuse right triangles (variable ratio/angle)
    generate_parallelogram_q23,  # Parallelogram ABCD with altitude + perpendicular (НВО 2024)
]


def select_playground_problems():
    """
    Randomly select 6 MCQ diagram questions (for Q10–Q15) and
    1 open-ended diagram question (for Q23).
    Returns a dict with keys 'mcq' (list of 6) and 'open_q23'.
    """
    generators = random.sample(_MCQ_GENERATORS, 6)
    q23_gen = _pick(_Q23_GENERATORS)
    return {
        "mcq": [gen() for gen in generators],
        "open_q23": q23_gen(),
    }
