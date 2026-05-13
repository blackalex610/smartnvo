import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProgressSummaryPage from './pages/ProgressSummaryPage';
import GradesPage from './pages/GradesPage';
import TopicsPage from './pages/TopicsPage';
import LessonsPage from './pages/LessonsPage';
import ExercisesPage from './pages/ExercisesPage';
import LearnGradesPage from './pages/LearnGradesPage';
import LearnTopicsPage from './pages/LearnTopicsPage';
import LearnLessonsPage from './pages/LearnLessonsPage';
import TheoryPage from './pages/TheoryPage';
import NVOPracticeExamPage from './pages/NVOPracticeExamPage';
import PlaygroundPage from './pages/PlaygroundPage';
import MobileCapturePage from './pages/MobileCapturePage';
import LiveUploadsPage from './pages/LiveUploadsPage';
import ControllerPage from './pages/ControllerPage';
import SettingsModal from './components/SettingsModal';
import { PairingProvider } from './context/PairingContext';
import { SettingsProvider } from './context/SettingsContext';
import { XpProvider } from './context/XpContext';

function App() {
  return (
    <PairingProvider>
      <SettingsProvider>
        <XpProvider>
        <Router>
          <SettingsModal />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/login" replace />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="progress" element={<ProgressSummaryPage />} />
              <Route path="grades" element={<GradesPage />} />
              <Route path="grades/:gradeId/topics" element={<TopicsPage />} />
              <Route path="topics/:topicId/lessons" element={<LessonsPage />} />
              <Route path="lessons/:lessonId/exercises" element={<ExercisesPage />} />
              <Route path="learn/grades" element={<LearnGradesPage />} />
              <Route path="learn/grades/:gradeId/topics" element={<LearnTopicsPage />} />
              <Route path="learn/topics/:topicId/lessons" element={<LearnLessonsPage />} />
              <Route path="learn/lessons/:lessonId/theory" element={<TheoryPage />} />
              <Route path="nvo/practice" element={<NVOPracticeExamPage />} />
              <Route path="playground" element={<PlaygroundPage />} />
              <Route path="mobile-capture" element={<MobileCapturePage />} />
              <Route path="live-uploads" element={<LiveUploadsPage />} />
            </Route>
            <Route path="controller" element={<ControllerPage />} />
          </Routes>
        </Router>
        </XpProvider>
      </SettingsProvider>
    </PairingProvider>
  );
}

export default App;
