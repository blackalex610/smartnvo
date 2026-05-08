import apiClient from './api';

// ============================================================================
// Progress API Functions
// ============================================================================

export interface DashboardStats {
  total_exercises_completed: number;
  total_exercises_attempted: number;
  accuracy_percentage: number;
  topics_started: number;
  topics_completed: number;
  total_topics_available: number;
  lessons_started: number;
  lessons_completed: number;
  total_lessons_available: number;
  recent_activity: string[];
}

export interface XpSummary {
  user_id: number;
  level: number;
  total_xp: number;
  current_level_xp: number;
  next_level_xp: number;
  xp_into_level: number;
  xp_to_next_level: number;
  progress_percentage: number;
  streak_days: number;
  streak_multiplier: number;
  today_xp: number;
}

export interface TopicProgress {
  topic_id: number;
  title: string;
  description?: string;
  grade_number: number;
  progress_percentage: number;
  accuracy: number;
  completed_exercises: number;
  total_exercises: number;
  lessons_completed: number;
  total_lessons: number;
  needs_practice: boolean;
}

export interface LessonProgress {
  lesson_id: number;
  title: string;
  progress_percentage: number;
  completed_exercises: number;
  total_exercises: number;
  completed: boolean;
}

export interface WeakTopic {
  topic_id: number;
  title: string;
  accuracy: number;
  reason: string;
}

export interface RecommendedLesson {
  lesson_id: number;
  topic_id: number;
  lesson_title: string;
  topic_title: string;
  reason: string;
}

export interface ProgressRecommendations {
  weak_topics: WeakTopic[];
  recommended_lessons: RecommendedLesson[];
  encouragement_message: string;
}

/**
 * Get overall dashboard statistics
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await apiClient.get('/progress/dashboard');
  return response.data;
};

/**
 * Get XP and level summary for the current user
 */
export const getXpSummary = async (): Promise<XpSummary> => {
  const response = await apiClient.get('/progress/xp-summary');
  return response.data;
};

/**
 * Record a daily activity/login event — updates streak and returns updated XP summary
 */
export const recordActivity = async (): Promise<XpSummary> => {
  const response = await apiClient.post('/progress/record-activity');
  return response.data;
};

// ============================================================================
// Badge API
// ============================================================================

export interface UserBadge {
  key: string;
  title: string;
  emoji: string;
  description: string;
  unlocked_at: string;
}

export const getUserBadges = async (): Promise<UserBadge[]> => {
  const response = await apiClient.get('/progress/badges');
  return response.data;
};

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  duration: string;
  difficulty: string;
  xp_base: number;
  xp_bonus: number;
  emoji: string;
  route: string;
  mission_type: string;
  topic_id?: number;
  lesson_id?: number;
  target_count?: number;
  completed_count?: number;
  is_completed?: boolean;
}

export const getDailyMissions = async (): Promise<DailyMission[]> => {
  const response = await apiClient.get('/progress/daily-missions');
  return response.data;
};

export interface MissionTrackResult {
  mission_id: string;
  target_count: number;
  completed_count: number;
  is_completed: boolean;
  xp_earned: number;
  ignored?: boolean;
  reason?: string;
}

export const trackMissionProgress = async (
  mission_id: string,
  exercise_id: number,
  is_correct: boolean,
): Promise<MissionTrackResult> => {
  const response = await apiClient.post('/progress/daily-missions/track', null, {
    params: { mission_id, exercise_id, is_correct },
  });
  return response.data;
};

// ============================================================================
// Activity Feed
// ============================================================================

export interface ActivityEvent {
  id: number;
  source_type: string;
  xp_amount: number;
  reason: string;
  created_at: string;
}

export const getActivityFeed = async (limit = 20): Promise<ActivityEvent[]> => {
  const response = await apiClient.get('/progress/activity-feed', {
    params: { limit },
  });
  return response.data;
};

/**
 * Get progress for all topics
 */
export const getTopicProgress = async (): Promise<TopicProgress[]> => {
  const response = await apiClient.get('/progress/topics');
  return response.data;
};

/**
 * Get progress for lessons in a specific topic
 */
export const getLessonProgress = async (topicId: number): Promise<LessonProgress[]> => {
  const response = await apiClient.get(`/progress/lessons/${topicId}`);
  return response.data;
};

/**
 * Get personalized recommendations
 */
export const getRecommendations = async (): Promise<ProgressRecommendations> => {
  const response = await apiClient.get('/progress/recommendations');
  return response.data;
};
