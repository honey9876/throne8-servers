import { Response } from "express";

import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";

import { AuthRequest } from "../../middleware/auth.middleware";

import {
  startInterviewSession,
  submitAnswer,
  endInterviewSession,
  getInterviewSession,
  getInterviewHistory,
  synthesizeQuestionSpeech,
  transcribeAnswerAudio,
} from "./interview.service";

import {
  validateStartInterviewRequest,
  validateSubmitAnswerRequest,
  validateTtsRequest,
} from "./interview.validation";

// ============================================================
// START INTERVIEW SESSION
// ============================================================

export const startInterview = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    const {
      resumeId,
      targetRole,
      jobDescription,
      preparationNotes,
      questionType,
      difficulty,
      totalQuestions,
    } = req.body;

    validateStartInterviewRequest({
      resumeId,
      targetRole,
      jobDescription,
      preparationNotes,
      questionType,
      difficulty,
      totalQuestions,
    });

    const { session, audio } = await startInterviewSession(req.userId, {
      resumeId,
      targetRole,
      jobDescription,
      preparationNotes,
      questionType,
      difficulty,
      totalQuestions,
    });

    res.status(201).json({
      success: true,
      message: "Interview session started",
      data: {
        session,
        audio: {
          mimeType: audio.mimeType,
          base64: audio.buffer.toString("base64"),
        },
      },
    });
  },
);

// ============================================================
// SUBMIT ANSWER
// ============================================================

export const submitInterviewAnswer = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    const { sessionId, questionIndex, answerText, timeTakenSeconds } =
      req.body;

    validateSubmitAnswerRequest({
      sessionId,
      questionIndex,
      answerText,
      timeTakenSeconds,
    });

    const result = await submitAnswer(
      req.userId,
      sessionId,
      questionIndex,
      answerText,
      timeTakenSeconds,
    );

    res.status(200).json({
      success: true,
      message: "Answer submitted",
      data: {
        feedback: result.feedback,
        session: result.session,
        audio: result.audio
          ? {
              mimeType: result.audio.mimeType,
              base64: result.audio.buffer.toString("base64"),
            }
          : null,
      },
    });
  },
);

// ============================================================
// END SESSION EARLY
// ============================================================

export const endInterview = asyncHandler(
  async (
    req: AuthRequest<{ sessionId: string }>,
    res: Response,
  ) => {
    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    const { sessionId } = req.params;

    if (!sessionId) {
      throw new ApiError(400, "sessionId is required");
    }

    const session = await endInterviewSession(req.userId, sessionId);

    res.status(200).json({
      success: true,
      message: "Interview session ended",
      data: { session },
    });
  },
);

// ============================================================
// GET SESSION
// ============================================================

export const getSession = asyncHandler(
  async (
    req: AuthRequest<{ sessionId: string }>,
    res: Response,
  ) => {
    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    const { sessionId } = req.params;

    if (!sessionId) {
      throw new ApiError(400, "sessionId is required");
    }

    const session = await getInterviewSession(req.userId, sessionId);

    res.status(200).json({
      success: true,
      data: { session },
    });
  },
);

// ============================================================
// GET HISTORY
// ============================================================

export const getHistory = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    const sessions = await getInterviewHistory(req.userId);

    res.status(200).json({
      success: true,
      count: sessions.length,
      data: sessions,
    });
  },
);

// ============================================================
// TEXT -> SPEECH (read the current question aloud)
// ============================================================

export const synthesizeQuestionAudio = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    const { text } = req.body;

    validateTtsRequest({ text });

    const { buffer, mimeType } = await synthesizeQuestionSpeech(text);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", buffer.length.toString());
    res.status(200).send(buffer);
  },
);

// ============================================================
// SPEECH -> TEXT (transcribe the candidate's recorded answer)
// ============================================================

export const transcribeAnswer = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.userId) {
      throw new ApiError(401, "Authentication required");
    }

    if (!req.file) {
      throw new ApiError(400, "Audio file is required");
    }

    const transcript = await transcribeAnswerAudio(
      req.file.buffer,
      req.file.mimetype,
    );

    res.status(200).json({
      success: true,
      message: "Audio transcribed",
      data: { transcript },
    });
  },
);
