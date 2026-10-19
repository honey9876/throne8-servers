export const buildSkillsPrompt = (
  jobTitle: string
) => `
You are an expert technical recruiter.

Suggest the top 15 relevant skills for this role.

Rules:
- Include technical skills only
- Mix frameworks, tools, and concepts
- Return a JSON array only

Role:
${jobTitle}
`;