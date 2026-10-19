export const buildCourseworkPrompt = (
  degree: string,
  fieldOfStudy: string,
  targetRole?: string
) => `
You are an academic advisor helping a student list relevant coursework on their resume.

Degree: ${degree}
Field of Study: ${fieldOfStudy}
${targetRole ? `Target Job Role: ${targetRole}` : ""}

Generate 5-6 relevant coursework subjects that:
1. Are standard, real courses typically taught in this degree/field.
2. Are most relevant to the target role if one is specified (prioritize technical/practical courses over generic ones).
3. Use standard academic naming (e.g. "Data Structures & Algorithms", "Database Management Systems", not vague terms).

RULES
- Return ONLY a comma-separated list of course names. No numbering, no bullets, no explanation.
- Do not include quotes or markdown.
- Exactly 5-6 courses, no more, no less.

Example output:
Data Structures & Algorithms, Database Management Systems, Operating Systems, Computer Networks, Object-Oriented Programming, Web Technologies
`;