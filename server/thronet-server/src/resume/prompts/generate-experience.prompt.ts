interface ExperienceContext {
  workedOn?: string;
  technologies?: string;
  scope?: string;
  impact?: string;
}

export const buildGenerateExperiencePrompt = (
  company: string,
  position: string,
  context?: ExperienceContext
) => `
You are an expert resume writer specializing in ATS-optimized, quantified resume bullet points.

Generate 5 professional resume bullet points for this role.

Company: ${company}
Position: ${position}

${
  context && (context.workedOn || context.technologies || context.scope || context.impact)
    ? `
ADDITIONAL CONTEXT PROVIDED BY CANDIDATE (use this as the primary source of truth — be specific, don't generalize away from it):
- What they worked on: ${context.workedOn || "Not specified"}
- Technologies/tools used: ${context.technologies || "Not specified"}
- Scope/scale: ${context.scope || "Not specified"}
- Specific result/impact: ${context.impact || "Not specified"}
`
    : `
No additional context was provided. Generate strong, plausible, role-appropriate bullet points based only on standard responsibilities for a "${position}" role. Keep them realistic and general — do NOT invent specific numbers, company names, or achievements that weren't given.
`
}

RULES
1. Each bullet starts with a strong, varied action verb (never repeat the same verb twice).
2. Each bullet is maximum 25 words.
3. If a specific result/impact was provided, use it in at least one bullet as a quantified metric (%, numbers, scale).
4. If technologies were provided, naturally weave them into 2-3 bullets as ATS keywords — don't just list them.
5. Do NOT use generic filler: "responsible for", "worked on", "helped with", "assisted in".
6. Do NOT invent specific metrics, user counts, or percentages that weren't provided in the context.
7. Return ONLY a valid JSON array of 5 strings. No markdown, no explanation, no numbering.

Example format:
["Architected a real-time notification system using WebSockets, reducing message latency by 40%", "..."]
`;