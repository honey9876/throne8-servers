export const buildSkillsPrompt = (resume: any, selectedCategory?: string) => `
You are an expert technical recruiter specializing in ATS keyword optimization.

Suggest 6-8 ATS-friendly technical skills${
  selectedCategory ? ` specifically for the "${selectedCategory}" category` : ""
}.

Target Role:
${resume.targetRole ?? "Not specified"}

Current Title:
${resume.personalInfo?.title ?? "Not specified"}

Existing Skills (all categories — do NOT repeat these):
${
  resume.skills
    ?.map((cat: any) => `${cat.title}: ${cat.skills?.join(", ")}`)
    .join(" | ") || "None listed"
}

Experience:
${
  resume.experience
    ?.map((item: any) => `${item.position} at ${item.company}`)
    .join(", ") || "None listed"
}

Projects:
${resume.projects?.map((project: any) => project.title).join(", ") || "None listed"}

RULES
1. Suggest skills that are genuinely relevant to the Target Role and consistent with the "${selectedCategory ?? "general"}" category.
2. Do NOT suggest skills already listed in Existing Skills (case-insensitive match).
3. Prioritize current, in-demand, industry-standard technologies over obscure/outdated ones.
4. Return ONLY a valid JSON array of 6-8 strings. No markdown, no explanation.

Example:
["React", "TypeScript", "Redux Toolkit", "Node.js", "Express", "MongoDB", "Docker", "AWS"]
`;