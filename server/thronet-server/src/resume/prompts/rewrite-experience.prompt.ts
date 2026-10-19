export const buildExperiencePrompt = (
  experience: string,
  targetRole: string
) => `
You are a senior resume writer for top technology companies.

Rewrite the following work experience into ATS-friendly resume bullet points.

Rules:
- Use strong action verbs
- Focus on measurable impact
- Generate exactly 3 bullet points
- Keep each bullet under 25 words
- Optimize for the role: ${targetRole}

Experience:
${experience}

Return only bullet points.
`;