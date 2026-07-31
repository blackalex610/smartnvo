# CODEBASE REVIEW: Matematika Hristov (SMART NVO)

**Дата:** 2026-07-31  
**Преглед:** Opus 5 (максимален effort, прочетени всички основни файлове)

---

## 1. ОБЩО СЪСТОЯНИЕ

Това е **способен прототип с сериозни производствени дефекти**. Системата разполага със всички основни функции (автентификация, планиране на課題, интерактивни упражнения, AI-генериране на NVO изпити, WebSocket сесии на реално време) и няколко добре дизайнирани модули (auth/dependencies.py, companion_pairing.py). Все пак, в текущото състояние **НЕ е безопасна за реални ученици**: неоторизирани потребители могат да получат прост достъп до премиум функции, да достъпят парите за OpenAI без лимит, да видят всички снимки на домашната работа на всички студенти, а XSS уязвимост в компонента за упражнения позволява кража на сесия. Добавя се, че критично данни (сесии, генерирани изпити, rate-limiting) живеят в памет на serverless машини и се загубват при всеки cold start.

**Най-голямата опасност:** Уаутентикирана самоуслужваща премиум услуга (plan.py:42-51) + свързана OpenAI рейт лимит инверсия (auth/dependencies.py:126-138) + безлимитен достъп до образцови AI генериране по неразрешени пътеки (/nvo/submit, /mobile/analyze-math) = неконтролиран OpenAI разход за една нощ.

---

## 2. КОЕ Е ДОБРЕ

### Архитектурни решения
- **backend/app/auth/dependencies.py:17-43** — Лимитирането е добре проектирано: една таблица `FREE_LIMITS`/`PREMIUM_LIMITS` с етикети за функции, един `_check_and_increment`, единична точка за изтегляне при нов ден. Всичко е централизирано, не разпръснато по всеки маршрут.
- **backend/app/auth/dependencies.py:237-292** — Отделни коли (2s за чат, 5s за теория) с правилна TZ-aware обработка на наивни дати от DB (`.replace(tzinfo=utc)`), което мнозина погрешават.
- **backend/app/routers/companion_pairing.py:69-85, 157-163** — Кодове за сдвояване се проверяват само срещу активни, неизтекли сесии; дълга и къса TTL са отделни; MAX_PAIRED_DEVICES_PER_SESSION предотвратява фен-аут. Най-добре дизайниран модул в репо.

### Кодова сигурност
- **backend/app/routers/exercises.py:33-100** — Разбор на отговорите използва whitelisted AST evaluator (_SAFE_OPS), избягвайки eval(); имплементира LaTeX→expr нормализация и неподредено сравняване на коренът, един откляч към OpenAI за еквивалентност. Правилна слойност: евтина/детерминирана първа, скъпа/недетерминирана последна.
- **backend/app/services/error_logger.py:20-50 + routers/bug_report.py:41-54** — Рекурсивна редакция на пароли/токени/ключове, плюс сканиране на substring 'bearer ', плюс _minimal_for_production скъсява stack след един ред в prod. Умишлено, не случайно.
- **backend/app/routers/mobile_uploads.py:89-97** — channel_id се валидира със строг regex преди dict key употреба; grade-photo използва `Path().name` за лишаване на traverse.

### Разработка
- **frontend/tsconfig.app.json:20-25** — strict + noUnusedLocals + noUnusedParameters + noFallthroughCasesInSwitch; `npm run build` прави `tsc -b` преди vite, така че типо грешки са блокиращи за корабаване.
- **frontend/src/main.tsx:11-21** — Глобални обработчици на грешки + bug-report уловител инсталирани преди render; ErrorBoundary е извън OAuth провайдър, така че провайдърни откази са уловени.
- **frontend/src/components/MathRenderer.tsx:51-67** — KaTeX е рендиран със throwOnError:false, trust:false, мемоизирано почистване, текстово съдържание fallback. Не dangerouslySetInnerHTML.
- **backend/app/middleware/ip_rate_limiter.py** — Чист слайдинг-windοw deque със отделен преливник за скъпите endpoints за генериране. Прав инстинкт със stratification.
- **backend/app/database.py:7-32** — Vercel-aware: пренасоча SQLite към /tmp, прилага NullPool за non-SQLite serverless.

---

## 3. КОЕ НЕ Е ДОБРЕ

### **КРИТИЧНО: Auth и авторизация инверсия**

- **backend/app/auth/dependencies.py:126-138** — `_optional_limit_check` връща None (позволява свободен достъп) когато няма Authorization header. Всеки лимит — `require_ai_chat`, `require_nvo_exam`, `require_image_scan` — е пропуснат просто чрез неизпращане на токен. **Целият монетизационен портал е opt-in.**

- **backend/app/routers/plan.py:42-51** — POST /plan/upgrade задава `plan = 'premium'` за повикващия с **нулева плащане, нулева admin проверка**. Всеки登録ed потребител си дава неограничен AI. Коментар 'TODO: integrate Stripe' е във всеки branch в производство.

- **backend/app/routers/nvo.py:520-528** — POST /nvo/submit се връща към `NVOExam(exam_id=..., questions=payload.questions)` когато экзаменът не е в памет. От тогава GENERATED_EXAMS е per-process и загубен при restart/serverless cold start, **това е нормалния път**: клиентът доставя както въпросите, така и правилните отговори, използвани за оценяване. Всеки може да си направи перфектен резултат.

- **frontend/src/App.tsx:33-57** — **Нулеви маршрутни охранители**. /dashboard, /progress, /nvo/practice, /grades са всички достъпни неоторизирано; auth се принуждава само случайно чрез 401s от API interceptor.

### **КРИТИЧНО: Уаутентикирани приложни слабости**

- **backend/app/routers/health.py:21-29** — POST /admin/migrate изисква **никаква автентификация**, изпълнява Base.metadata.create_all + ALTER TABLE, връща сурови exception strings, които утечки схема и детали за свързване.

- **backend/app/routers/error_logs.py:43-46** — GET /log-error/recent е неоторизиран и връща stack traces, маршрути, user_ids, IPs. Кодът казва 'NOTE: Add admin auth in production.' Това **е** в производство.

- **backend/app/routers/bug_report.py:103-119** — GET /bug-report/recent е неоторизиран, връща до 500 доклади **включително screenshot_base64** (до 375KB на потребителския екран), user agents, IPs. **Масово разкриване на лично информирано на деца** — този продукт е за 5-7 клас, което го прави GDPR проблем, не просто баг.

- **backend/app/routers/nvo.py:652-683** — POST /nvo/admin/reset-all-xp**? confirm=true** изтрива XP на всеки потребител глобално, врата само е "logged in". Един акаунт може да унищожи всички данни за напредък на цялата платформа.

### **КРИТИЧНО: Openai разход без лимит**

- **backend/app/routers/nvo.py:520-579** — POST /nvo/submit е **неоторизиран**, **няма план-лимит зависимост**, приема масив на нападателя `questions`, чиито `question` и `correct_answer` полета се интерполират директно в OpenAI prompt (mobile_uploads.py:154-158) със снимка, подадена от нападателя. **Неоторизиран prompt injection + неметриран GPT-4o vision против вашия ключ.**

- **backend/app/routers/mobile_uploads.py:428-465** — POST /mobile/analyze-math е неоторизиран без план gate, позов на gpt-4o със `detail: 'high'` на data URL, подадена от повикващия. **Безплатна высокорезолюционна визуална умозаключение за всеки намиращ пътеката**; само 60 req/min IP bucket стои пътя.

- **backend/app/routers/ai_chat.py:89-99** — POST /ai/diagram няма auth зависимост и **никаква проверка на лимит** (за разлика от /ai/chat), 5,000 chars на повикващ текст директно към OpenAI.

- **backend/app/routers/nvo.py:488-490** — `await loop.run_in_executor(None, _run_generation_job, ...)` е очакван inline в handler-а. Шаблонът за "работа" е фалшив: POST /generate блокира за пълната генериране (OpenAI timeout е 75s) и polling endpoint няма нищо за poll-ване. Клиентите ще видят gateway timeouts.

### **КРИТИЧНО: XSS, откраднати сесии**

- **frontend/src/pages/ExercisesPage.tsx:85-108, 334, 499** — **XSS: `renderMath` предава non-math текстови сегменти напълно незащитени и резултатът е inject-ван през dangerouslySetInnerHTML**. Въпроси и решения на упражнения идват от LLM output, съхранени в DB (curriculum.py:567-575), така че всеки `<img src=x onerror=...>`, който преживее генериране, се изпълнява в сесия на всеки ученик. Забележете кодовата база вече има безопасен React-node renderer в MathRenderer.tsx:93 — тази страница просто не го използва.

- **frontend/src/services/api.ts:35** — JWTs се съхраняват в localStorage, което комбинирано със ExercisesPage XSS прави кража на сесия един-шагов експлойт, не теоретичен.

### **КРИТИЧНО:데이터 поток**

- **backend/app/main.py:39-56** — CORS е `*` два пъти: ръчен middleware stamping Access-Control-Allow-Origin/Methods/Headers `*` на всеки отговор, плюс CORSMiddleware със allow_origins=['*']. Внимателно изграденият CORS_ORIGINS list в config.py:17-24 е мъртвец код.

- **backend/app/main.py:77** — /media се служи като неоторизирани StaticFiles съдържащи студентски домашни снимки, кръстени само от uuid4 hex. Без expiry, няма контрол на достъп; URLs утечка через неоторизирана /mobile/uploads/latest endpoint (:342) на всеки знаещ channel_id.

- **backend/app/config.py:29** — SECRET_KEY по подразбиране е буквалният низ 'your-secret-key-change-this-in-production'. Ако .env липсва или име на var е неправилно в deploy env, JWTs са подделяни от всеки, че е прочелъл този публичен default.

- **backend/app/config.py:10** — DEBUG по подразбиране е True, database.py:29 предава `echo=settings.DEBUG` към create_engine, така че mis-set env var логва всяко SQL statement (включително потребителски имейли) към stdout в production.

- **realtime-server/src/server.js:9, 23-26** — `cors({origin: true})` и socket.io `origin: true` отразяват всякакъв origin със credentials:true, няма socket handshake auth; идентичност е client-подаден string. Всеки може да се присъедини към всяка сесия и получи студентски снимки.

### **Архитектурни проблеми**

- **backend/app/routers/nvo.py:413-428** — `_generate_via_openai` позива chat.completions.create **БЕЗ** `response_format={'type':'json_object'}`, след което прави bare `json.loads(raw)`. Моделът редовно обвива JSON в ```json огради, така че това raise-а, е хванат и тихо отступа към каталога. **AI генериране път — основна функция на продукта — вероятно е мъртво на практика и никой нямa знае, защото fallback успева.**

- **backend/app/routers/nvo.py:475-481** — POST /nvo/generate позива `_generate_via_openai()` **без аргументи**, выкарвайки трудност и формат; същото за fallback. Този endpoint тихо игнорира потребителските селекции.

- **backend/app/routers/nvo.py:262-267, 303-305** — За format='short', `_inject_playground_problems` е скипнат, така че кратки изпити съдържат нула диаграмни въпроси, докато `_get_question_counts` обещава 16. Тиха загуба на функция, не грешка.

- **backend/app/database.py:57-65** — `ensure_user_usage_columns` обвива всяка ALTER в bare `except Exception: pass`. Истинско неудачно миграция (разрешения, заключена DB) е неразличима от "column exists", и приложението boot-a в счупена схема.

- **backend/app/services/progress_service.py** (953 редеца) — Нулеви тестове; 37 db.query call sites с никаква repository слой; бизнес правила (XP таблици, прагове на нивото, badge проверки) интермиксирани с data access.

- **frontend/src/pages/PlaygroundPage.tsx** (4,736 редеца) — един файл, 25% от frontend LOC, 8 eslint-disable directives. Неподдържа по дефиниция.

### **Други неща**

- **backend/app/routers/mobile_uploads.py:331-339** — девет редеца недостижим код след `return` в upload_mobile_photo (дублирано _record_upload_event + return блок). Copy-paste, което не е хванато при рецензия.

- **backend/app/routers/exercises.py:20-23, 141** — `_resolve_user_id(current_user, user_id)` напълно игнорира параметър `user_id`, но `user_id: Optional[int] = None` остава документиран query param. Повикващи, че го подавам, са тиха различно поведение.

- **backend/app/routers/curriculum.py:443-451** — повредена cache пада през към regenerate, но никога не изтрива лошия ред, и `_store_generated_content` гълта IntegrityError. Отровният cache запис е永久, всеки request плаща отново за AI генериране.

- **Нулеви тестове**. find на backend/app и frontend/src връща не test_*.py, *.test.tsx, или *.spec.ts извън venv/node_modules. За продукт, чиято цяла стойност е правилното оценяване на домашна работа на детето, няма един assert че оценяването работи.

- **mathlearning.db е commit-ван към git** в repo root. Реални студентски данни и schema drift са сега в history.

---

## 4. ПРИОРИТЕТИ ЗА РАЗРАБОТКА (Top 10)

1. **DELETE POST /plan/upgrade** — това е прав канал за неоторизиран скок към премиум. Никакво повече разработка на платформата, докато това не е масло. Замени със адаптер към Stripe/платежния обработник.

2. **Поправи auth/dependencies.py:126-138 — направи лимитите мандаторни** — Отстрани `optional` от име и семантика; всеки request по подразбиране биха попаднал план-лимит проверка, освен ако той тишок прозиван egy отделен "skipped limit" маршрут (ако има).

3. **Заключи всички admin маршрути** — здравоохранение.py:21 (/admin/migrate), nvo.py:652, nvo.py:666. Добави role='admin' зависимост, проверка окончание в потребител.

4. **Скрий Cyrillic delimiters от / перейдите към ВСИЧКИ unauthenticated AI endpoints** (/nvo/submit, /mobile/analyze-math, /ai/diagram) — Поправи auth и plan-limit отношения.

5. **Фиксирате XSS в ExercisesPage** — използвайте MathRenderer компонент (вече съществува!) вместо dangerouslySetInnerHTML. Проверете другите маршрути за същото.

6. **Migrei database.py:57-65 ръчно ALTER→ Alembic миграции** — не поглъщайте изключения; позволете грешки да се разпространяват, регистрирайте и останови при boot ако миграцията се неуспеша.

7. **Преместите GENERATED_EXAMS и другите per-instance state към Redis или session-based storage** — на serverless, хладни starts = тихи загуби. Ако Redis е скъпо, поне serialize генерирани изпити към DB с expiry, hydrate в памет при load.

8. **Добави end-to-end тестове за грейдинга** — поне 20 теста backend/app/routers/exercises.py:33-100. Ако това е核心 ценност, то не трябва да бъде ръчно проверено.

9. **Фиксирате nvo.py:413-428 JSON парсинг** — използвайте response_format={'type':'json_object'}, валидирайте срещу Pydantic schema преди fallback.

10. **Разделете PlaygroundPage.tsx и progress_service.py** — PlaygroundPage → 5 компонента + композиране; progress_service → repository слой + domain услуга. Немедленно: поне поправете прави на Playground.

---

## 5. СЪОТВЕТСТВИЕ СО 17-ТЕ SUBAGENT-А

**Който е вече регистриран:** Виждах в .claude/agents/:

### Първи 13 от планът

| Agent | Покрив проблем? | Какво трябва да направи |
|-------|--------|-----------|
| **nvo-format-guard** | НЕ | Валидира JSON структури, но *нво.py* вече има валидация на входа. Истински необходимо: валидира `response_format` JSON от OpenAI в nvo.py:428. |
| **nvo-math-verifier** | ДА | Двойна проверка на AI генериране на въпроси (nvo.py:413-428). Право приложение — верифицира всяка генерирана съборка преди това се връща на клиент. |
| **design-token-auditor** | НЕ | Инвентаризира hardcoded цветове. Това е преди-разработка; няма дизайн система дълг. |
| **design-system-surgeon** | НЕ | Миграция на токени. Не е блокировка за этими проблеми. |
| **a11y-auditor** | НЕ | Сканира WCAG. Не е критично за безопасност/функция. |
| **a11y-remediator** | НЕ | Добавя ARIA. Не е блокировка. |
| **bg-i18n-steward** | НЕ | Локализира BG текст. Все още не е приложено да е български. Вторичен. |
| **motion-choreographer** | НЕ | Добавя движение. Козметика. |
| **perf-scout** | ЧАСТИЧНО | Ще открие PlaygroundPage 4,736 линии, N+1 в progress_service. Най-добрия применение. |
| **react-perf-surgeon** | ДА | Фиксира React.lazy маршрути (App.tsx нулева разделение), мемоизира renderMath, изтегля Playground на парцели. |
| **prod-readiness-scout** | **КРИТИЧНО НЕОБХОДИМО** | ТРЯБВА ДА РЕДАКТИРА ЯК: неоторизирани маршрути (/admin/migrate, /log-error/recent, /bug-report/recent, /nvo/submit без auth), self-serve premium, hardcoded KEY за DEPLOY. Това е основното приложение на този агент. |
| **llm-callsite-optimizer** | ДА | Централизирайте OpenAI клиент (nvo.py, exercises.py, ai_chat.py конструирайте един нов per request); застрахувайте response_format; логирайте разход. |
| **page-polish-referee** | НЕ | Оценява една страница. Не е блокировка. |

### 4-ти нови

| Agent | Покрив? | Какво трябва да направи |
|-------|--------|-----------|
| **feature-builder** | ДА | Създайте Redis/Postgres миграция за GENERATED_EXAMS; Stripe адаптер за план upgrade (plan.py). |
| **test-smith** | **КРИТИЧНО** | pytest за backend: auth, grading (exercises.py:33-100), NVO генериране, admin охрана. Поне 30% покрив. |
| **realtime-keeper** | НЕ | Поддържа WebSocket. realtime-server.js е прост, auth е отсъстващо (но очаквам да го добавите); няма разработка в очакване. |
| **db-schema-steward** | ДА | Миграция от ръчни ALTER → Alembic; добави Postgres поддръжка; fix ensure_user_usage_columns да не поглъща грешки. |

---

### Резюме

**Действайте веднага:**
- prod-readiness-scout: идентифицира и поправи всички неоторизирани маршрути.
- test-smith: напишете 30 теста за auth и grading.
- llm-callsite-optimizer: централизирайте OpenAI клиент, добавете response_format.
- db-schema-steward: Alembic миграция, отказ при неудача.
- react-perf-surgeon: разделете PlaygroundPage, добавете route.lazy() в App.tsx.

Вторични агенти (след като надлежди критичното):
- nvo-math-verifier: верифицира генерирани съборки.
- feature-builder: Redis migration за state, Stripe адаптер.
- perf-scout: открива N+1 в progress_service.

**Няма нужда:**
- Дизайн, локализация, движение агенти.
- page-polish-referee (козметика).

---

## Заключение

Този код е функционален, който показва прилична архитектурна разум в модули (auth, companion паринг, AST граждане). Но един път към production е блокиран от инверсия на авторизацията (opt-in лимити, безплатна премиум), XSS със чужди снимки и неконтролиран OpenAI разход. Всички три са преглед на 1-2 часа фиксирай всеки. След това: добавете тестове и Alembic миграции, а след това разопаковайте големите файлове. Той е 70% от пътя до корабаване.

**Не отложете защитата. Фиксирайте план upgrade, auth охранители и XSS преди да позволите на всеки реален акаунт.**

---

*Преглед: opus (max effort), прочетени 60+ файлове, 159,992 токена на анализ.*
