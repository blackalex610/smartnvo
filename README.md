# Математика — SmartNVO

An AI-powered math learning platform for Bulgarian 5th–7th grade students, with specialized support for NVO (National 7th-Grade Math Exam) preparation.

## 🎯 Project Overview

Математика is a comprehensive web application designed to help Bulgarian middle school students master mathematics through:

- **Structured Curriculum**: Complete coverage of grades 5, 6, and 7 math topics
- **AI-Generated Theory**: Personalized, Bulgarian-language lesson content
- **Interactive Exercises**: Practice problems with instant feedback
- **NVO Practice**: Full exam simulations with detailed solutions
- **Progress Tracking**: Real-time insights into learning progress with XP and leveling system
- **Real-time Collaboration**: Live pairing and collaborative problem-solving

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: CSS with theme support
- **Real-time**: WebSocket integration for live features

### Backend
- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL
- **AI Integration**: OpenAI API for content generation
- **Server**: Uvicorn

### Real-time Server
- **Framework**: Node.js/Express
- **WebSockets**: Socket.io
- **Purpose**: Live chat, pairing, and collaboration features

## 📁 Project Structure

```
├── frontend/                 # React + TypeScript web application
│   ├── src/
│   │   ├── pages/           # Page components (Dashboard, Exercises, etc.)
│   │   ├── components/      # Reusable UI components
│   │   ├── services/        # API client services
│   │   ├── hooks/           # Custom React hooks
│   │   └── context/         # React context providers
│   └── vite.config.ts       # Vite configuration
│
├── backend/                  # FastAPI Python backend
│   ├── app/
│   │   ├── main.py          # FastAPI application setup
│   │   ├── models/          # Database models
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── schemas/         # Request/response schemas
│   │   └── auth/            # Authentication logic
│   └── requirements.txt      # Python dependencies
│
├── realtime-server/         # Node.js WebSocket server
│   ├── src/
│   │   └── server.js        # Socket.io server
│   └── package.json         # Node dependencies
│
└── package.json             # Root package.json for workspace
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- Git

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/smartnvo.git
cd smartnvo
```

2. **Backend Setup**
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

3. **Frontend Setup**
```bash
cd ../frontend
npm install
```

4. **Real-time Server Setup**
```bash
cd ../realtime-server
npm install
```

### Running the Application

In separate terminals, run:

**Backend** (runs on http://localhost:8001):
```bash
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

**Frontend** (runs on http://localhost:5173):
```bash
cd frontend
npm run dev
```

**Real-time Server** (runs on http://localhost:3001):
```bash
cd realtime-server
npm start
```

Or use the provided VS Code tasks:
- "Run backend server"
- "Run frontend server"
- "Run realtime server"

## 📚 Core Features

### Curriculum
- Complete Bulgarian math curriculum (grades 5-7)
- Hierarchical structure: Grades → Topics → Lessons → Exercises
- Theory content generated with AI assistance

### Learning Experience
- Interactive exercise solving with real-time feedback
- Progress tracking and visual indicators
- XP and level-based gamification
- Achievement badges and streaks

### NVO Exam Preparation
- Full practice exams matching the official format
- Detailed solutions and explanations
- Performance analytics

### Real-time Collaboration
- Live chat with AI tutor
- Pairing for collaborative problem-solving
- Connection settings management

## 🔐 Authentication

The platform uses JWT-based authentication with support for:
- Email/password registration and login
- Google OAuth integration (optional)
- Mobile app authentication
- Session management

## 📊 Database Models

Key entities:
- **User**: Student profiles with progress tracking
- **Curriculum**: Grade → Topic → Lesson hierarchy
- **Progress**: User exercise completion and performance
- **Exercise**: Individual practice problems
- **Upload**: Mobile submission tracking

## 🛡️ API Documentation

The backend API is documented with FastAPI's Swagger UI:
- Navigate to `http://localhost:8001/docs` when the server is running

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit your changes (`git commit -m 'Add amazing feature'`)
3. Push to the branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👥 Team

Built for Bulgarian students by educators and developers passionate about AI-powered learning.

## 🐛 Reporting Issues

Found a bug? Please open an issue on GitHub with:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## 📞 Support

For questions or support, please open an issue on the GitHub repository.

---

**Made with ❤️ for Bulgarian students preparing for success**
