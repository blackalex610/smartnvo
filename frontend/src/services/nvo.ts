import apiClient from "./api";
import type { XpSummary } from "./progress";

export interface NVOQuestion {
  number: number;
  question: string;
  topic: string;
  difficulty: string;
  diagram: boolean;
  diagram_type?: string;
  diagram_config?: Record<string, unknown>;
  open_parts?: string[];
  options: string[] | null;
  correct_answer: string[] | string | null;
}

export interface NVOExam {
  exam_id: string;
  questions: NVOQuestion[];
}

export interface NVOGenerationJobResponse {
  job_id: string;
}

export interface NVOGenerationJobStatus {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  exam_id: string | null;
}

export interface NVOOpenAnswerImage {
  problemId: number;
  image: string;
}

export interface NVOExamSubmitPayload {
  exam_id: string;
  answers: Record<number, string | Record<string, string>>;
  open_answer_images: NVOOpenAnswerImage[];
  questions?: NVOQuestion[];
}

export interface NVOOpenGradeResult {
  problemId: number;
  score: number;
  max_score: number;
  is_correct: boolean;
  extracted_answer: string;
  feedback: string;
}

export interface NVOExamSubmitResponse {
  exam_id: string;
  open_results: NVOOpenGradeResult[];
  total_open_score: number;
  total_open_max_score: number;
}

export async function generateNVOExam(): Promise<NVOExam> {
  const response = await apiClient.post("/nvo/generate");
  return response.data;
}

export async function createNVOGenerationJob(
  difficulty?: 'easy' | 'standard' | 'hard',
  format?: 'full' | 'short'
): Promise<NVOGenerationJobStatus> {
  const payload: { difficulty?: string; format?: string } = {};
  if (difficulty) payload.difficulty = difficulty;
  if (format) payload.format = format;
  
  const response = await apiClient.post("/nvo/generate-job", 
    Object.keys(payload).length > 0 ? payload : null, 
    { timeout: 90000 }
  );
  return response.data;
}

export async function getNVOGenerationJob(jobId: string): Promise<NVOGenerationJobStatus> {
  const response = await apiClient.get(`/nvo/generate-job/${jobId}`);
  return response.data;
}

export async function getGeneratedNVOExam(examId: string): Promise<NVOExam> {
  const response = await apiClient.get(`/nvo/generated/${examId}`);
  return response.data;
}

export async function getNVOQuestions() {
  const response = await apiClient.get("/nvo/questions");
  return response.data;
}

export async function resetAllXp(confirm: boolean = false): Promise<{ success: boolean; message: string; affected_users: number }> {
  const response = await apiClient.post('/nvo/admin/reset-all-xp', null, { params: { confirm } });
  return response.data;
}

export async function submitNVOExam(payload: NVOExamSubmitPayload): Promise<NVOExamSubmitResponse> {
  const response = await apiClient.post('/nvo/submit', payload);
  return response.data;
}

export interface NVOAwardXpRequest {
  percentage_correct: number;  // 0-100
  difficulty: 'easy' | 'standard' | 'hard';
  minutes_taken: number;
  exam_id?: string;
}

export interface NVOAwardXpResponse {
  base_xp: number;
  difficulty: string;
  difficulty_multiplier: number;
  difficulty_bonus_xp: number;
  minutes_taken: number;
  time_multiplier: number;
  time_bonus_xp: number;
  final_xp: number;
  percentage_correct: number;
  xp_before: number;
  xp_after: number;
  level_info: XpSummary;
  leveled_up: boolean;
}

export async function awardNvoXp(): Promise<void> {
  // Legacy method - simple 300 XP award
  await apiClient.post('/nvo/award-xp', {});
}

export async function awardNvoXpDetailed(request: NVOAwardXpRequest): Promise<NVOAwardXpResponse> {
  const response = await apiClient.post('/nvo/award-xp', request);
  return response.data;
}

export interface MathAnalysisResult {
  extracted_text: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function analyzeMathImage(imageDataUrl: string): Promise<MathAnalysisResult> {
  const response = await apiClient.post('/mobile/analyze-math', { image_data_url: imageDataUrl }, { timeout: 35000 });
  return response.data;
}
