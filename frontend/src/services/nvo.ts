import apiClient from "./api";

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

export async function createNVOGenerationJob(): Promise<NVOGenerationJobResponse> {
  const response = await apiClient.post("/nvo/generate-job");
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

export async function submitNVOExam(payload: NVOExamSubmitPayload): Promise<NVOExamSubmitResponse> {
  const response = await apiClient.post('/nvo/submit', payload);
  return response.data;
}

export async function awardNvoXp(): Promise<void> {
  await apiClient.post('/nvo/award-xp');
}
