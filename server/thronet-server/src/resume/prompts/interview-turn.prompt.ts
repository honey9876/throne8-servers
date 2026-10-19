interface PreviousTurn {
  question: string;
  isFollowUp: boolean;
  answerText: string;
}

interface BuildInterviewTurnPromptArgs {
  resume: object;
  targetRole: string;
  jobDescription?: string;
  preparationNotes?: string;
  questionType: string;
  difficulty: string;
  totalQuestions: number;
  currentQuestionNumber: number; // 1-based index of the question being produced
  history: PreviousTurn[]; // all previous question/answer pairs in this session
}

/**
 * Builds a single prompt that does TWO jobs in one LLM call:
 *
 *  1. Evaluate the most recent answer (if any) and return structured feedback.
 *  2. Decide the NEXT question — either a follow-up that digs deeper into the
 *     answer just given, or a fresh question on a new topic — while staying
 *     within the fixed totalQuestions budget the user picked.
 *
 * Combining both into one call halves the number of round trips compared to
 * "evaluate" + "generate" as two separate requests.
 */
export const buildInterviewTurnPrompt = ({
  resume,
  targetRole,
  jobDescription,
  preparationNotes,
  questionType,
  difficulty,
  totalQuestions,
  currentQuestionNumber,
  history,
}: BuildInterviewTurnPromptArgs): string => {
  const normalizedJD =
    typeof jobDescription === "string" ? jobDescription.trim() : "";

  const hasJobDescription = normalizedJD.length > 0;

  const hasHistory = history.length > 0;

  const lastTurn = hasHistory ? history[history.length - 1] : null;

  const historyBlock = hasHistory
    ? history
        .map(
          (turn, i) =>
            `Q${i + 1} (${turn.isFollowUp ? "follow-up" : "new topic"}): ${turn.question}\nCandidate's answer: ${turn.answerText}`,
        )
        .join("\n\n")
    : "None yet — this is the first question of the session.";

  const isFinalQuestion = currentQuestionNumber > totalQuestions;

  return `
You are an experienced technical interviewer conducting a mock interview.

============================================================
CANDIDATE CONTEXT
============================================================

Target role: ${targetRole}

Resume (structured JSON):
${JSON.stringify(resume)}

${
  hasJobDescription
    ? `Job description the candidate is preparing for:\n${normalizedJD}\n`
    : "No job description was provided — base questions on the target role and resume only.\n"
}

${
  preparationNotes
    ? `Candidate's own notes on what they want to practice:\n${preparationNotes}\n`
    : ""
}

============================================================
SESSION SETTINGS
============================================================

Question type focus: ${questionType} (technical | hr | behavioral | mixed)
Difficulty: ${difficulty}
Total questions in this session: ${totalQuestions}
This is question number: ${currentQuestionNumber} of ${totalQuestions}

============================================================
CONVERSATION SO FAR
============================================================

${historyBlock}

============================================================
YOUR TASK
============================================================

${
  lastTurn
    ? `1. Evaluate the candidate's most recent answer above ("${lastTurn.answerText.slice(0, 40)}...") on clarity, structure, and technical accuracy (each 0-10), list concrete strengths and improvements, and give a short overall comment plus an overallScore (0-100).`
    : `1. There is no previous answer yet, so return null for "feedback".`
}

2. ${
    isFinalQuestion
      ? `This is the LAST question of the session (question ${currentQuestionNumber} of ${totalQuestions}) — after this one there are no more questions, so set "nextQuestion" to null.`
      : `Decide the next question to ask (this will become question ${currentQuestionNumber} of ${totalQuestions}). Choose ONE of:
   - A FOLLOW-UP that digs deeper into the candidate's last answer, if it was vague, incomplete, or invites a natural probe (set isFollowUp: true)
   - A NEW question on a different topic relevant to the target role/resume/JD and the requested question type + difficulty (set isFollowUp: false)
   Do not repeat a question already asked. Stay strictly within the "${questionType}" focus and "${difficulty}" difficulty band.`
  }

Respond with ONLY this JSON shape, no extra text:

{
  "feedback": ${
    lastTurn
      ? `{
    "strengths": string[],
    "improvements": string[],
    "clarity": number,
    "structure": number,
    "technicalAccuracy": number,
    "overallScore": number,
    "comment": string
  }`
      : "null"
  },
  "nextQuestion": ${
    isFinalQuestion
      ? "null"
      : `{
    "question": string,
    "isFollowUp": boolean
  }`
  }
}
`.trim();
};
