interface CustomSectionContext {
  whatDone?: string;
  problemSolved?: string;
  teamRole?: string;
  result?: string;
}

export const buildCustomSectionPrompt = (
  sectionType: string,
  itemTitle: string,
  itemSubtitle: string | undefined,
  context?: CustomSectionContext
) => `
You are an expert resume writer specializing in ATS-optimized descriptions for resume sections beyond standard experience/education.

Section Type: ${sectionType}
Title: ${itemTitle}
${itemSubtitle ? `Subtitle/Organization: ${itemSubtitle}` : ""}

${
  context && (context.whatDone || context.problemSolved || context.teamRole || context.result)
    ? `
ADDITIONAL CONTEXT PROVIDED BY CANDIDATE (use this as the primary source of truth):
- What was done: ${context.whatDone || "Not specified"}
- Problem/challenge addressed: ${context.problemSolved || "Not specified"}
- Team size / role: ${context.teamRole || "Not specified"}
- Result / achievement: ${context.result || "Not specified"}
`
    : `
No additional context was provided. Generate a strong, plausible, general-purpose description based only on the title and section type. Keep it realistic — do NOT invent specific metrics or outcomes that weren't given.
`
}

RULES
1. Write 2-3 concise bullet points (or 1 short paragraph if the section type suits prose better, e.g. Publications abstract).
2. Each bullet starts with a strong action verb.
3. Maximum 25 words per bullet.
4. If a result/achievement was provided, state it clearly and specifically.
5. Do NOT use generic filler: "responsible for", "worked on", "helped with".
6. Do NOT invent specific metrics or outcomes not provided in the context.
7. Return ONLY the description text. If multiple bullets, separate with newlines. No markdown, no explanation, no numbering.
`;