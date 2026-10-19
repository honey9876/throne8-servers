import mongoose, { Schema, Document } from "mongoose";

export const InterviewQuestionType = {
  TECHNICAL: "technical",
  HR: "hr",
  BEHAVIORAL: "behavioral",
  MIXED: "mixed",
} as const;

export const InterviewDifficulty = {
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
} as const;

export const InterviewSessionStatus = {
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  ENDED_EARLY: "ended_early",
} as const;

export interface IInterviewFeedback {
  strengths: string[];
  improvements: string[];
  clarity: number;
  structure: number;
  technicalAccuracy: number;
  overallScore: number;
  comment: string;
}

export interface IInterviewQuestion {
  index: number;
  question: string;
  isFollowUp: boolean;
  answerText: string;
  timeTakenSeconds?: number;
  feedback?: IInterviewFeedback;
  answeredAt?: Date;
}

export interface IInterviewSession extends Document {
  userId: string;
  resumeId: mongoose.Types.ObjectId;

  targetRole: string;
  jobDescription: string;
  preparationNotes: string;

  questionType: (typeof InterviewQuestionType)[keyof typeof InterviewQuestionType];
  difficulty: (typeof InterviewDifficulty)[keyof typeof InterviewDifficulty];
  totalQuestions: number;

  questions: IInterviewQuestion[];

  status: (typeof InterviewSessionStatus)[keyof typeof InterviewSessionStatus];

  summary?: {
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    comment: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const interviewFeedbackSchema = new Schema<IInterviewFeedback>(
  {
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    clarity: { type: Number, default: 0 },
    structure: { type: Number, default: 0 },
    technicalAccuracy: { type: Number, default: 0 },
    overallScore: { type: Number, default: 0 },
    comment: { type: String, default: "" },
  },
  { _id: false },
);

const interviewQuestionSchema = new Schema<IInterviewQuestion>(
  {
    index: { type: Number, required: true },
    question: { type: String, required: true },
    isFollowUp: { type: Boolean, default: false },
    answerText: { type: String, default: "" },
    timeTakenSeconds: { type: Number },
    feedback: { type: interviewFeedbackSchema },
    answeredAt: { type: Date },
  },
  { _id: false },
);

const interviewSessionSchema = new Schema<IInterviewSession>(
  {
    userId: {
      type: String,
      required: true,
    },

    resumeId: {
      type: Schema.Types.ObjectId,
      ref: "ResumeBuilder",
      required: true,
    },

    targetRole: {
      type: String,
      required: true,
    },

    jobDescription: {
      type: String,
      default: "",
    },

    preparationNotes: {
      type: String,
      default: "",
    },

    questionType: {
      type: String,
      enum: Object.values(InterviewQuestionType),
      default: InterviewQuestionType.MIXED,
    },

    difficulty: {
      type: String,
      enum: Object.values(InterviewDifficulty),
      default: InterviewDifficulty.MEDIUM,
    },

    totalQuestions: {
      type: Number,
      required: true,
    },

    questions: {
      type: [interviewQuestionSchema],
      default: [],
    },

    status: {
      type: String,
      enum: Object.values(InterviewSessionStatus),
      default: InterviewSessionStatus.IN_PROGRESS,
    },

    summary: {
      overallScore: { type: Number },
      strengths: { type: [String], default: [] },
      weaknesses: { type: [String], default: [] },
      comment: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  },
);

export const InterviewSession =
  (mongoose.models["InterviewSession"] as mongoose.Model<IInterviewSession>) ||
  mongoose.model<IInterviewSession>(
    "InterviewSession",
    interviewSessionSchema,
  );
