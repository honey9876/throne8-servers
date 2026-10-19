export type RegenerateCoverLetterTarget =
  | "full"
  | "opening"
  | "closing"
  | `paragraph:${number}`;

interface RegenerateCoverLetterPromptInput {
  currentLetter: unknown;
  target: RegenerateCoverLetterTarget;
  reason: string;
}

const describeTarget = (target: RegenerateCoverLetterTarget): string => {
  if (target === "full") return "the entire letter body (opening, all middle paragraphs, and closing)";
  if (target === "opening") return "only the opening paragraph";
  if (target === "closing") return "only the closing paragraph";

  const index = Number(target.split(":")[1]);
  return `only middle body paragraph number ${index + 1} (1-indexed, i.e. index ${index} in the paragraphs array)`;
};

export const buildRegenerateCoverLetterPrompt = ({
  currentLetter,
  target,
  reason,
}: RegenerateCoverLetterPromptInput) => `
You are an expert professional cover letter editor.

Below is the candidate's current cover letter (as JSON):
${JSON.stringify(currentLetter, null, 2)}

The candidate wants you to regenerate ${describeTarget(target)}.

REASON / INSTRUCTION FROM THE CANDIDATE (apply this precisely):
"${reason}"

RULES:
- Only change the part described above. Do not alter any other part of the letter's content or facts.
- The rewritten part must still flow naturally with the surrounding paragraphs that are staying the same — match their tone and continue logically from what comes before/after.
- Never fabricate companies, job titles, dates, metrics, or technologies not already present in the existing letter.
- Keep it concise: 3-5 sentences for a single paragraph.

Return ONLY valid JSON. No markdown, no code fences, no commentary.

${
  target === "full"
    ? `Return EXACTLY this structure with the full rewritten body:
{
  "opening": "",
  "paragraphs": ["", ""],
  "closing": ""
}`
    : target === "opening"
      ? `Return EXACTLY this structure:
{
  "opening": ""
}`
      : target === "closing"
        ? `Return EXACTLY this structure:
{
  "closing": ""
}`
        : `Return EXACTLY this structure (the single rewritten paragraph):
{
  "paragraph": ""
}`
}
`;
