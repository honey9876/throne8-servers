import mongoose from "mongoose";

import { Resume } from "../../models/resume.model";
import {
  InterviewSession,
  InterviewSessionStatus,
  IInterviewSession,
} from "../../models/interview-session.model";

import { ApiError } from "../../utils/ApiError";

import {
  generateJSON,
  generateSpeech,
  transcribeAudio,
} from "../../providers/gemini.provider";

import { buildInterviewTurnPrompt } from "../../prompts/interview-turn.prompt";

import {
  StartInterviewRequest,
  EvaluateAndNextResult,
  InterviewSummary,
} from "./interview.types";

// ============================================================
// HELPERS
// ============================================================

const getResumeObject = (resume: any): Record<string, unknown> => {
  if (resume && typeof resume.toObject === "function") {
    return resume.toObject();
  }

  return resume;
};

const loadOwnedSession = async (
  userId: string,
  sessionId: string,
): Promise<IInterviewSession> => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new ApiError(400, "Invalid sessionId");
  }

  const session = await InterviewSession.findOne({
    _id: sessionId,
    userId,
  });

  if (!session) {
    throw new ApiError(404, "Interview session not found");
  }

  return session;
};

const buildDeterministicSummary = (
  session: IInterviewSession,
): InterviewSummary => {
  const answered = session.questions.filter((q) => q.feedback);

  if (answered.length === 0) {
    return {
      overallScore: 0,
      strengths: [],
      weaknesses: [],
      comment: "No questions were answered in this session.",
    };
  }

  const avg = (nums: number[]) =>
    Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

  const overallScore = avg(
    answered.map((q) => q.feedback?.overallScore ?? 0),
  );

  const strengths = Array.from(
    new Set(answered.flatMap((q) => q.feedback?.strengths ?? [])),
  ).slice(0, 5);

  const weaknesses = Array.from(
    new Set(answered.flatMap((q) => q.feedback?.improvements ?? [])),
  ).slice(0, 5);

  return {
    overallScore,
    strengths,
    weaknesses,
    comment: `You answered ${answered.length} of ${session.totalQuestions} question(s) with an average score of ${overallScore}/100.`,
  };
};

// ============================================================
// START INTERVIEW SESSION
// ============================================================

export const startInterviewSession = async (
  userId: string,
  request: StartInterviewRequest,
) => {
  const resume = await Resume.findOne({
    _id: request.resumeId,
    userId,
  });

  if (!resume) {
    throw new ApiError(404, "Resume not found");
  }

  const session = await InterviewSession.create({
    userId,
    resumeId: request.resumeId,
    targetRole: request.targetRole.trim(),
    jobDescription: request.jobDescription?.trim() ?? "",
    preparationNotes: request.preparationNotes?.trim() ?? "",
    questionType: request.questionType,
    difficulty: request.difficulty,
    totalQuestions: request.totalQuestions,
    questions: [],
    status: InterviewSessionStatus.IN_PROGRESS,
  });

  const turn = await generateJSON<EvaluateAndNextResult>(
    buildInterviewTurnPrompt({
      resume: getResumeObject(resume),
      targetRole: session.targetRole,
      jobDescription: session.jobDescription,
      preparationNotes: session.preparationNotes,
      questionType: session.questionType,
      difficulty: session.difficulty,
      totalQuestions: session.totalQuestions,
      currentQuestionNumber: 1,
      history: [],
    }),
  );

  if (!turn.nextQuestion) {
    throw new ApiError(500, "Failed to generate the first question");
  }

  const questionText = turn.nextQuestion.question;

  // Generate the question's audio BEFORE persisting it, so a TTS
  // failure never leaves a question saved without matching audio -
  // the frontend is only ever handed question + audio together.
  const audio = await synthesizeQuestionSpeech(questionText);

  session.questions.push({
    index: 0,
    question: questionText,
    isFollowUp: false,
    answerText: "",
  });

  await session.save();

  return { session, audio };
};

// ============================================================
// SUBMIT ANSWER -> GET FEEDBACK + NEXT QUESTION (OR END)
// ============================================================

export const submitAnswer = async (
  userId: string,
  sessionId: string,
  questionIndex: number,
  answerText: string,
  timeTakenSeconds?: number,
) => {
  const session = await loadOwnedSession(userId, sessionId);

  if (session.status !== InterviewSessionStatus.IN_PROGRESS) {
    throw new ApiError(400, "This interview session has already ended");
  }

  const question = session.questions[questionIndex];

  if (!question) {
    throw new ApiError(400, "Invalid questionIndex for this session");
  }

  if (question.answerText) {
    throw new ApiError(400, "This question has already been answered");
  }

  const resume = await Resume.findOne({
    _id: session.resumeId,
    userId,
  });

  if (!resume) {
    throw new ApiError(404, "Resume not found");
  }

  question.answerText = answerText.trim();
  question.timeTakenSeconds = timeTakenSeconds;
  question.answeredAt = new Date();

  const history = session.questions
    .filter((q) => q.answerText)
    .map((q) => ({
      question: q.question,
      isFollowUp: q.isFollowUp,
      answerText: q.answerText,
    }));

  const nextQuestionNumber = session.questions.length + 1;

  const turn = await generateJSON<EvaluateAndNextResult>(
    buildInterviewTurnPrompt({
      resume: getResumeObject(resume),
      targetRole: session.targetRole,
      jobDescription: session.jobDescription,
      preparationNotes: session.preparationNotes,
      questionType: session.questionType,
      difficulty: session.difficulty,
      totalQuestions: session.totalQuestions,
      currentQuestionNumber: nextQuestionNumber,
      history,
    }),
  );

  if (!turn.feedback) {
    throw new ApiError(500, "Failed to evaluate the answer");
  }

  question.feedback = turn.feedback;

  let audio: { buffer: Buffer; mimeType: string } | null = null;

  if (turn.nextQuestion && session.questions.length < session.totalQuestions) {
    const questionText = turn.nextQuestion.question;

    // Same rule as startInterviewSession: synthesize speech BEFORE
    // saving, so the session is never persisted mid-way through a
    // question that has no matching audio yet.
    audio = await synthesizeQuestionSpeech(questionText);

    session.questions.push({
      index: session.questions.length,
      question: questionText,
      isFollowUp: turn.nextQuestion.isFollowUp,
      answerText: "",
    });
  } else {
    session.status = InterviewSessionStatus.COMPLETED;
    session.summary = buildDeterministicSummary(session);
  }

  await session.save();

  return {
    feedback: question.feedback,
    session,
    audio,
  };
};

// ============================================================
// END SESSION EARLY
// ============================================================

export const endInterviewSession = async (
  userId: string,
  sessionId: string,
) => {
  const session = await loadOwnedSession(userId, sessionId);

  if (session.status === InterviewSessionStatus.IN_PROGRESS) {
    session.status = InterviewSessionStatus.ENDED_EARLY;
    session.summary = buildDeterministicSummary(session);

    await session.save();
  }

  return session;
};

// ============================================================
// GET SESSION
// ============================================================

export const getInterviewSession = async (
  userId: string,
  sessionId: string,
) => {
  return loadOwnedSession(userId, sessionId);
};

// ============================================================
// GET SESSION HISTORY
// ============================================================

export const getInterviewHistory = async (userId: string) => {
  return InterviewSession.find({ userId })
    .sort({ createdAt: -1 })
    .select("-questions.feedback")
    .lean();
};

// ============================================================
// TEXT -> SPEECH (read a question aloud)
// ============================================================

export const synthesizeQuestionSpeech = async (text: string) => {
  return generateSpeech(text);
};

// ============================================================
// SPEECH -> TEXT (transcribe the candidate's spoken answer)
// ============================================================

export const transcribeAnswerAudio = async (
  audioBuffer: Buffer,
  mimeType: string,
) => {
  const transcript = await transcribeAudio(audioBuffer, mimeType);

  if (!transcript) {
    throw new ApiError(
      422,
      "Couldn't make out any speech in that recording. Please try again or type your answer.",
    );
  }

  return transcript;
};
