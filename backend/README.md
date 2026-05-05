# Backend - Math Learning Platform API

FastAPI backend for the Math Learning Platform.

## Quick Start

1. Create and activate virtual environment:
```bash
python -m venv venv
.\venv\Scripts\activate  # Windows
source venv/bin/activate  # macOS/Linux
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
copy .env.example .env
# Edit .env with your configuration
```

4. Run the server:
```bash
uvicorn app.main:app --reload
```

Server will start at: http://localhost:8000
API docs: http://localhost:8000/docs

## API Endpoints

- `GET /health` - Health check endpoint

## Database

Configure PostgreSQL connection in `.env`:
```
DATABASE_URL=postgresql://user:password@localhost:5432/mathlearning
```

## Development

The project uses:
- FastAPI for the web framework
- SQLAlchemy for database ORM
- Pydantic for data validation
- JWT for authentication (ready to implement)
