/**
 * Plan catalog for paid AI credits. This is the ONLY source of truth for
 * prices and credit amounts: the API reads prices from here and never
 * trusts an amount sent by the client. Keep plan ids in sync with the
 * frontend pricing page (builder/frontend/src/features/pricing/plans.ts).
 *
 * Prices are in rupees, one-time payments, no GST added (not registered).
 */

export type CreditType =
  | "resumeRuns"
  | "resumeEdits"
  | "coverRuns"
  | "coverEdits"
  | "interview5"
  | "interview10"
  | "interview15";

export const CREDIT_TYPES: CreditType[] = [
  "resumeRuns",
  "resumeEdits",
  "coverRuns",
  "coverEdits",
  "interview5",
  "interview10",
  "interview15",
];

export type CreditAmounts = Partial<Record<CreditType, number>>;

export type InterviewQuestionCount = 5 | 10 | 15;

/** Interview credits match the session's question count exactly. */
export const interviewCreditType = (
  totalQuestions: InterviewQuestionCount,
): CreditType => `interview${totalQuestions}` as CreditType;

/**
 * One-time free credits every user gets (manual resume and manual cover
 * letter building are always free and are not credit based).
 * The free AI interview is a 5 question session.
 */
export const FREE_CREDITS: Record<CreditType, number> = {
  resumeRuns: 1,
  resumeEdits: 2,
  coverRuns: 1,
  coverEdits: 2,
  interview5: 1,
  interview10: 0,
  interview15: 0,
};

/** AIUsage features that count as one AI "run" or "edit" of a resume. */
export const RESUME_RUN_FEATURES = ["generate-resume"] as const;

export const RESUME_EDIT_FEATURES = [
  "generate-summary",
  "rewrite-experience",
  "suggest-skills",
  "generate-experience",
  "generate-project-description",
  "generate-coursework",
  "generate-custom-section",
  "generate-internship",
] as const;

export const COVER_RUN_FEATURES = ["generate-cover-letter"] as const;
export const COVER_EDIT_FEATURES = ["regenerate-cover-letter"] as const;

export interface ResumePlan {
  id: string;
  name: string;
  /** Price in rupees. */
  price: number;
  credits: CreditAmounts;
}

const interviewPlan = (
  questions: InterviewQuestionCount,
  sessions: 2 | 5,
  price: number,
): ResumePlan => ({
  id: `interview-ai-${questions}q-${sessions}`,
  name: `AI interview, ${sessions} sessions of ${questions} questions`,
  price,
  credits: { [interviewCreditType(questions)]: sessions },
});

export const RESUME_PLAN_LIST: ResumePlan[] = [
  {
    id: "resume-ai-5",
    name: "Resume AI Starter",
    price: 25,
    credits: { resumeRuns: 5, resumeEdits: 10 },
  },
  {
    id: "resume-ai-10",
    name: "Resume AI Plus",
    price: 50,
    credits: { resumeRuns: 10, resumeEdits: 20 },
  },
  {
    id: "cover-ai-2",
    name: "Cover letter AI Starter",
    price: 19,
    credits: { coverRuns: 2, coverEdits: 4 },
  },
  {
    id: "cover-ai-5",
    name: "Cover letter AI Plus",
    price: 29,
    credits: { coverRuns: 5, coverEdits: 10 },
  },
  interviewPlan(5, 2, 26),
  interviewPlan(5, 5, 65),
  interviewPlan(10, 2, 52),
  interviewPlan(10, 5, 129),
  interviewPlan(15, 2, 79),
  interviewPlan(15, 5, 199),
  {
    id: "all-in-one",
    name: "All-in-one",
    price: 69,
    credits: {
      resumeRuns: 2,
      resumeEdits: 4,
      coverRuns: 2,
      coverEdits: 4,
      interview10: 2,
    },
  },
];

const PLANS_BY_ID = new Map(RESUME_PLAN_LIST.map((plan) => [plan.id, plan]));

export const getPlan = (planId: string): ResumePlan | undefined =>
  PLANS_BY_ID.get(planId);

export const planAmountPaise = (plan: ResumePlan): number =>
  Math.round(plan.price * 100);
