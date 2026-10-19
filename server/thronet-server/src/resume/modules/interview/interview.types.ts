export interface StartInterviewRequest {
  resumeId: string;
  targetRole: string;
  jobDescription?: string;
  preparationNotes?: string;
  questionType: "technical" | "hr" | "behavioral" | "mixed";
  difficulty: "easy" | "medium" | "hard";
  totalQuestions: 5 | 10 | 15;
}

export interface SubmitAnswerRequest {
  sessionId: string;
  questionIndex: number;
  answerText: string;
  timeTakenSeconds?: number;
}

export interface GeneratedQuestion {
  question: string;
  isFollowUp: boolean;
}

export interface AnswerFeedback {
  strengths: string[];
  improvements: string[];
  clarity: number;
  structure: number;
  technicalAccuracy: number;
  overallScore: number;
  comment: string;
}

export interface EvaluateAndNextResult {
  feedback: AnswerFeedback;
  nextQuestion: GeneratedQuestion | null;
}

export interface InterviewSummary {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  comment: string;
}
