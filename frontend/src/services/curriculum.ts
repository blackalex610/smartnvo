import apiClient from './api';
import { trackEvent } from './analytics';

// ============================================================================
// Curriculum API Functions
// ============================================================================

export interface Grade {
  id: number;
  grade_number: number;
}

export interface Topic {
  id: number;
  title: string;
  description?: string;
  grade_id: number;
}

export interface Lesson {
  id: number;
  title: string;
  content?: string;
  topic_id: number;
}

export interface Exercise {
  id: number;
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  exercise_type: 'multiple_choice' | 'numeric' | 'algebra';
  lesson_id: number;
}

export interface ExerciseSubmissionResponse {
  correct: boolean;
  solution: string;
  submitted_answer: string;
  correct_answer?: string;
  xp_gained: number;
  leveled_up: boolean;
  new_level: number;
}

export interface GeneratedTheory {
  lesson_id: number;
  title: string;
  content: string;
}

export interface VideoSearchQueries {
  lesson_id: number;
  queries: string[];
}

export interface GeneratedExampleItem {
  difficulty: 'easy' | 'medium' | 'hard';
  problem: string;
  solution: string;
}

export interface GeneratedExamples {
  lesson_id: number;
  title: string;
  examples: GeneratedExampleItem[];
}

/**
 * Get all available grades
 */
export const getGrades = async (): Promise<Grade[]> => {
  const response = await apiClient.get('/curriculum/grades');
  return response.data;
};

/**
 * Get all topics for a specific grade
 */
export const getTopics = async (gradeId: number): Promise<Topic[]> => {
  const response = await apiClient.get(`/curriculum/grades/${gradeId}/topics`);
  return response.data;
};

/**
 * Get all lessons for a specific topic
 */
export const getLessons = async (topicId: number): Promise<Lesson[]> => {
  const response = await apiClient.get(`/curriculum/topics/${topicId}/lessons`);
  return response.data;
};

/**
 * Get all exercises for a specific lesson
 */
export const getExercises = async (lessonId: number): Promise<Exercise[]> => {
  const response = await apiClient.get(`/curriculum/lessons/${lessonId}/exercises`);
  return response.data;
};

/**
 * Get a specific lesson with details
 */

export const getLesson = async (lessonId: number): Promise<Lesson> => {
  const response = await apiClient.get(`/curriculum/lessons/${lessonId}`, {
    timeout: 60000,
  });
  return response.data;
};

export interface GeneratedContentStatus {
  lesson_id: number;
  cached_levels: string[];
}

/**
 * Get which detail levels are already cached in the database for a lesson
 */
export const getContentStatus = async (lessonId: number): Promise<GeneratedContentStatus> => {
  const response = await apiClient.get(`/curriculum/lessons/${lessonId}/content-status`);
  return response.data;
};

/**
 * Generate theory content for a lesson using AI
 */

export const getGeneratedTheory = async (
  lessonId: number,
  detailLevel: 'concise' | 'standard' | 'detailed' = 'standard',
): Promise<GeneratedTheory> => {
  trackEvent('ai_request', {
    endpoint: '/curriculum/lessons/{lessonId}/generated-theory',
    lesson_id: lessonId,
    detail_level: detailLevel,
  });
  const response = await apiClient.get(`/curriculum/lessons/${lessonId}/generated-theory`, {
    params: { detail_level: detailLevel },
    timeout: 60000,
  });
  return response.data;
};

/**
 * Get AI-rephrased YouTube search queries for a lesson
 */
export const getVideoSearchQueries = async (lessonId: number): Promise<VideoSearchQueries> => {
  const response = await apiClient.get(`/curriculum/lessons/${lessonId}/video-search-queries`);
  return response.data;
};

/**
 * Generate example problems for a lesson using AI
 */

export const getGeneratedExamples = async (lessonId: number): Promise<GeneratedExamples> => {
  trackEvent('ai_request', {
    endpoint: '/curriculum/lessons/{lessonId}/generated-examples',
    lesson_id: lessonId,
  });
  const response = await apiClient.get(`/curriculum/lessons/${lessonId}/generated-examples`, {
    timeout: 60000,
  });
  return response.data;
};

/**
 * Get a specific topic
 */
export const getTopic = async (topicId: number): Promise<Topic> => {
  const response = await apiClient.get(`/curriculum/topics/${topicId}`);
  return response.data;
};

/**
 * Get AI-generated exercises for a lesson (generates & caches on first call)
 */
export const getAIExercises = async (lessonId: number, regenerate = false): Promise<Exercise[]> => {
  trackEvent('ai_request', {
    endpoint: '/curriculum/lessons/{lessonId}/ai-exercises',
    lesson_id: lessonId,
    regenerate,
  });
  const response = await apiClient.get(`/curriculum/lessons/${lessonId}/ai-exercises`, {
    params: regenerate ? { regenerate: true } : {},
    timeout: 60000,
  });
  return response.data;
};

/**
 * Submit an answer to an exercise
 */
export const submitAnswer = async (
  exerciseId: number,
  answer: string
): Promise<ExerciseSubmissionResponse> => {
  const response = await apiClient.post(`/exercises/${exerciseId}/submit`, {
    answer: answer,
  });
  return response.data;
};
