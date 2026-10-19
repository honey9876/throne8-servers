interface ProjectContext {
  whatBuilt?: string;
  problemSolved?: string;
  teamSize?: string;
  impact?: string;
}

export const buildProjectDescriptionPrompt = (
  projectName: string,
  technologies: string[],
  context?: ProjectContext
) => `
You are an expert resume writer specializing in ATS-optimized project descriptions.

Generate exactly 5 professional bullet points describing this project.

Project Name: ${projectName}
Technologies: ${technologies.join(", ") || "Not specified"}

${
  context && (context.whatBuilt || context.problemSolved || context.teamSize || context.impact)
    ? `
ADDITIONAL CONTEXT PROVIDED BY CANDIDATE (use this as the primary source of truth):
- What was built: ${context.whatBuilt || "Not specified"}
- Problem solved / key feature: ${context.problemSolved || "Not specified"}
- Team size / role: ${context.teamSize || "Not specified"}
- Result / impact: ${context.impact || "Not specified"}
`
    : `
No additional context was provided. Generate strong, plausible bullet points based only on the project name and technologies. Keep them realistic and general — do NOT invent specific metrics or features that weren't given.
`
}

RULES
1. Exactly 5 bullet points.
2. Each bullet starts with a strong, varied action verb (never repeat the same verb twice).
3. Each bullet is maximum 22 words.
4. Naturally weave the technologies into 2-3 bullets as ATS keywords — don't just list them.
5. If a result/impact was provided, use it in at least one bullet as a quantified metric.
6. Do NOT use generic filler: "responsible for", "worked on", "helped with".
7. Do NOT invent specific metrics, user counts, or percentages that weren't provided in the context.
8. Return ONLY a valid JSON array of 5 strings. No markdown, no explanation, no numbering.

Example format:
["Architected a real-time notification system using WebSockets, reducing message latency by 40%", "..."]
`;