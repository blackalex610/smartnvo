export type SubmitAnswerImageEventPayload = {
  problemId: number;
  image: string;
  deviceId?: string;
  deviceName?: string;
  submittedAt?: string;
};

export const TEST_ANSWER_IMAGE_EVENT = 'test-answer-image-received';
