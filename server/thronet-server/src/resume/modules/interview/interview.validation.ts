import { ApiError } from "../../utils/ApiError";

import { StartInterviewRequest, SubmitAnswerRequest } from "./interview.types";

const VALID_QUESTION_TYPES = ["technical", "hr", "behavioral", "mixed"];
const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const VALID_QUESTION_COUNTS = [5, 10, 15];

// ============================================================
// START INTERVIEW REQUEST
// ============================================================

export const validateStartInterviewRequest = (
  request: Partial<StartInterviewRequest>,
) => {
  if (!request.resumeId || typeof request.resumeId !== "string") {
    throw new ApiError(400, "resumeId is required");
  }

  if (
    !request.targetRole ||
    typeof request.targetRole !== "string" ||
    !request.targetRole.trim()
  ) {
    throw new ApiError(400, "targetRole is required");
  }

  if (
    request.jobDescription !== undefined &&
    typeof request.jobDescription !== "string"
  ) {
    throw new ApiError(400, "jobDescription must be a string");
  }

  if (
    request.preparationNotes !== undefined &&
    typeof request.preparationNotes !== "string"
  ) {
    throw new ApiError(400, "preparationNotes must be a string");
  }

  if (
    !request.questionType ||
    !VALID_QUESTION_TYPES.includes(request.questionType)
  ) {
    throw new ApiError(
      400,
      `questionType must be one of: ${VALID_QUESTION_TYPES.join(", ")}`,
    );
  }

  if (!request.difficulty || !VALID_DIFFICULTIES.includes(request.difficulty)) {
    throw new ApiError(
      400,
      `difficulty must be one of: ${VALID_DIFFICULTIES.join(", ")}`,
    );
  }

  if (
    !request.totalQuestions ||
    !VALID_QUESTION_COUNTS.includes(request.totalQuestions)
  ) {
    throw new ApiError(
      400,
      `totalQuestions must be one of: ${VALID_QUESTION_COUNTS.join(", ")}`,
    );
  }
};

// ============================================================
// SUBMIT ANSWER REQUEST
// ============================================================

export const validateSubmitAnswerRequest = (
  request: Partial<SubmitAnswerRequest>,
) => {
  if (!request.sessionId || typeof request.sessionId !== "string") {
    throw new ApiError(400, "sessionId is required");
  }

  if (
    request.questionIndex === undefined ||
    typeof request.questionIndex !== "number" ||
    request.questionIndex < 0
  ) {
    throw new ApiError(400, "questionIndex is required");
  }

  if (
    !request.answerText ||
    typeof request.answerText !== "string" ||
    !request.answerText.trim()
  ) {
    throw new ApiError(400, "answerText is required");
  }
};

// ============================================================
// TTS REQUEST (question read aloud)
// ============================================================

export const validateTtsRequest = (request: Partial<{ text: string }>) => {
  if (
    !request.text ||
    typeof request.text !== "string" ||
    !request.text.trim()
  ) {
    throw new ApiError(400, "text is required");
  }

  if (request.text.length > 2000) {
    throw new ApiError(400, "text must be 2000 characters or fewer");
  }
};
