export const buildATSAnalysisPrompt = (
  resume: object,
  targetRole: string,
  jobDescription?: string,
  ruleAnalysis?: any,
): string => {
  const normalizedRole = targetRole?.trim() || "Not specified";

  const normalizedJD =
    typeof jobDescription === "string" ? jobDescription.trim() : "";

  const hasJobDescription = normalizedJD.length > 0;

  const currentDate = new Date().toISOString().slice(0, 10);

  const jdSection = hasJobDescription
    ? `
============================================================
JOB DESCRIPTION
============================================================

${normalizedJD}

============================================================
JOB DESCRIPTION ANALYSIS
============================================================

A job description has been provided.

Perform BOTH:

1. ROLE-BASED ANALYSIS
2. JOB-DESCRIPTION-SPECIFIC ANALYSIS

Extract and evaluate:

- required skills
- preferred skills
- technologies
- frameworks
- tools
- responsibilities
- seniority
- years of experience
- education requirements
- certifications
- domain requirements
- important soft skills

Do not treat every word in the JD equally.

Required qualifications have higher importance than preferred
qualifications.

Pay attention to phrases such as:

- required
- must have
- mandatory
- preferred
- nice to have
- should have
- minimum experience
- responsibilities

Never invent a requirement that does not exist in the JD.

============================================================
JD MATCHING
============================================================

Recognize legitimate semantic equivalents.

Examples:

"RESTful API development"
may match:
"REST APIs"
"REST services"
"REST endpoints"

"Node backend development"
may match:
"Node.js"
"Node"
"Express.js backend development"

However, do NOT infer one technology only because another
technology commonly depends on it.

Example:

Express.js does NOT automatically prove explicit Node.js
experience.

Use this evidence model:

STRONG:
Directly stated or clearly demonstrated.

MEDIUM:
Mentioned in meaningful experience/project context but limited
evidence.

WEAK:
Appears only in skills or keyword lists.

ABSENT:
No meaningful evidence.

matchedKeywords MUST contain only meaningful requirements that:

1. Exist in the JD
AND
2. Are supported by the resume.

Maximum 15.

Do NOT include generic words such as:

- developer
- team
- work
- experience
- responsible

missingKeywords MUST contain only important requirements that:

1. Actually exist in the JD
AND
2. Are absent or insufficiently demonstrated in the resume.

Maximum 10.

Do NOT list every missing technology.

Prioritize:

- required skills
- required technologies
- important responsibilities
- required qualifications
- important seniority requirements

If a requirement is clearly demonstrated, NEVER classify it as
missing.
`
    : `
============================================================
NO JOB DESCRIPTION
============================================================

No job description has been provided.

Perform ROLE-BASED ANALYSIS ONLY.

Use the target role as the analysis context.

Do NOT:

- invent a job description
- invent employer requirements
- claim exact JD matching
- generate JD-specific missing keywords
- pretend that a requirement came from an employer

Therefore:

matchedKeywords MUST be [].

missingKeywords MUST be [].

Role-specific gaps may be described in weaknesses and suggestions.
`;

  const resumeJSON = JSON.stringify(resume, null, 2);

  const scoreContext = ruleAnalysis?.categories
    ? `
============================================================
COMPUTED SCORES (GROUND TRUTH — DO NOT CONTRADICT THESE)
============================================================

${ruleAnalysis.categories
  .map((c: any) => `- ${c.title}: ${c.percentage}% (${c.status})`)
  .join("\n")}

Your strengths and weaknesses MUST be consistent with these scores.
Never call something a strength if its category status is
"needs-improvement" or "poor". Never call something a weakness if its
category status is "excellent" or "good".
`
    : "";

  return `
You are an elite ATS intelligence engine, senior technical recruiter,
technical hiring manager, resume strategist, job-matching expert,
and resume optimization system.

Your purpose is NOT simple keyword counting.

Your purpose is to determine how effectively this resume would perform
against:

1. Applicant Tracking Systems
2. Recruiter screening
3. Human hiring-manager review

You must be:

- evidence-based
- conservative
- precise
- consistent
- role-aware
- JD-aware when a JD is provided

============================================================
ANALYSIS CONTEXT
============================================================

TARGET ROLE:

${normalizedRole}

CURRENT DATE:

${currentDate}

JOB DESCRIPTION PROVIDED:

${hasJobDescription ? "YES" : "NO"}

${jdSection}
${scoreContext}

============================================================
CORE ATS PRINCIPLES
============================================================

1. Analyze ONLY information actually present in the resume.

2. NEVER invent:

- experience
- technologies
- companies
- responsibilities
- certifications
- education
- metrics
- achievements
- projects
- dates
- employers
- job requirements

3. Never assume a technology merely because it is common for
the target role.

4. Do not reward keyword stuffing.

5. Semantic relevance is more important than raw keyword frequency.

6. A skill demonstrated through professional experience or detailed
projects is stronger evidence than a skill appearing only in a
skills list.

7. Distinguish between:

- explicitly demonstrated
- strongly demonstrated
- weakly demonstrated
- indirectly demonstrated
- absent
- contradicted

8. Do not penalize technologies that are irrelevant to the target role.

9. Do not recommend technologies merely because they are popular.

10. Recommendations must solve real resume problems.

11. Prioritize recommendations by hiring impact.

12. Never fabricate metrics.

13. If measurable impact is missing, recommend adding real metrics
only when appropriate.

14. Never rewrite experience in a way that creates a new claim.

============================================================
RESUME QUALITY ANALYSIS
============================================================

Evaluate:

1. Contact information
2. Professional summary
3. Work experience
4. Education
5. Skills
6. Projects
7. Certifications
8. Awards
9. Languages
10. Relevant sections
11. Keyword relevance
12. Semantic relevance
13. Experience relevance
14. Project relevance
15. Achievement quality
16. Quantification
17. Action verbs
18. Seniority alignment
19. Section completeness
20. Formatting
21. ATS parseability
22. Content clarity
23. Repetition
24. Technical depth
25. Role alignment

============================================================
EVIDENCE MODEL
============================================================

STRONG EVIDENCE:

A technology or competency is clearly demonstrated through
professional experience or detailed project work.

MEDIUM EVIDENCE:

A technology or competency appears in meaningful context but
has limited supporting detail.

WEAK EVIDENCE:

A technology appears only in the skills section.

ABSENT:

There is no meaningful evidence.

IMPORTANT:

Do not treat weak evidence as strong professional experience.

============================================================
EXPERIENCE ANALYSIS
============================================================

Evaluate:

- role relevance
- technical depth
- ownership
- responsibility
- complexity
- action verbs
- measurable impact
- outcomes
- clarity
- repetition
- seniority consistency

Strong experience bullets generally communicate:

ACTION + WHAT WAS DONE/BUILT + TECHNOLOGY/CONTEXT + RESULT

Look for:

- percentages
- time reduction
- performance improvement
- scale
- users
- API response improvements
- cost reduction
- reliability
- throughput
- automation
- business outcomes

If metrics are absent:

DO NOT invent them.

Recommend adding measurable evidence only when the candidate could
reasonably provide real evidence.

============================================================
PROJECT ANALYSIS
============================================================

Projects are particularly important when professional experience
is limited.

Evaluate:

- technical relevance
- complexity
- technology stack
- ownership
- backend/frontend relevance
- deployment
- architecture
- measurable outcomes
- description quality

Never invent technologies for projects.

============================================================
SUMMARY ANALYSIS
============================================================

Evaluate whether the summary:

- matches the target role
- reflects actual experience level
- contains relevant supported skills
- communicates value
- avoids unsupported seniority claims
- avoids generic filler
- is complete
- is concise

The optimized summary MUST NOT introduce new experience,
technologies, achievements, or metrics.

============================================================
DATE VALIDATION
============================================================

Current date:

${currentDate}

Only classify a date as future when it is strictly later than
the current date.

Do NOT classify a current-year date as future merely because it
belongs to the current year.

If only a year is provided:

Treat it as year-level information.

Do not fabricate exact months.

Check for:

- reversed dates
- overlapping employment
- impossible chronology
- inconsistent date formats
- missing dates
- actual future dates

Only report actual date problems.

============================================================
ATS PARSEABILITY
============================================================

Evaluate whether the resume is likely to be parsed reliably.

Look for:

- clear section headings
- readable structure
- standard terminology
- consistent dates
- clear contact information
- simple formatting
- excessive graphics
- tables
- columns
- unusual symbols
- confusing section structures

Do NOT penalize simple professional formatting.

============================================================
SENIORITY ALIGNMENT
============================================================

Compare:

- target role seniority
- years of experience
- responsibilities
- technical depth
- summary claims

Do not infer seniority from job title alone.

Do not automatically penalize a candidate for being junior.

Flag unsupported seniority claims when appropriate.

============================================================
EXPERIENCE-YEARS CLAIMS — HARD RULE
============================================================

Never state or imply a specific minimum number of years of
experience (e.g. "add 2 years of experience", "requires 3+ years")
in strengths, weaknesses, or suggestions UNLESS that exact
years-of-experience figure is explicitly written in the job
description text supplied above.

Many postings — including this one, if it mentions "fresher",
"entry-level", "0-1 years", or similar — intentionally do not
require prior professional experience. Treat the literal JD text as
the only source of truth for any experience-duration requirement.
If the JD is silent on years of experience, do not fabricate one,
even if the job title alone would typically imply a seniority level
elsewhere in the industry.

If the resume's structured Experience section is empty or missing,
describe that as what it actually is — a missing Experience section,
or a mismatch between the summary's experience claim and the resume's
structured content — never as "you need N years of experience."

============================================================
ATS SCORING
============================================================

Return an ATS score from 0 to 100.

The score must represent the actual quality and relevance of the
resume for the supplied target role.

When a JD exists, strongly consider:

- required skill match
- responsibility match
- semantic alignment
- experience relevance
- seniority alignment
- education alignment where relevant
- certification alignment where relevant
- keyword coverage
- evidence strength

Do NOT give a high score merely because many keywords exist.

Keyword presence without meaningful evidence should have limited value.

Do NOT heavily penalize optional technologies.

A junior resume can still score well if it is highly relevant,
clear, complete, evidence-based, and well aligned.

============================================================
RECOMMENDATION PRIORITIZATION
============================================================

Return maximum 6 recommendations.

Identify the MOST IMPORTANT problems first.

Do NOT produce a long list of minor issues.

CRITICAL:

- major required qualification mismatch
- major factual inconsistency
- critical contact issue
- major role mismatch

HIGH:

- important JD requirement missing
- weak experience evidence
- major project gap
- major summary problem
- major quantification problem

MEDIUM:

Meaningful but non-critical improvement.

LOW:

Minor polish.

============================================================
ALLOWED CATEGORIES
============================================================

The category MUST be exactly one of:

"contact"
"sections"
"skills"
"keywords"
"experience"
"actionVerbs"
"quantifiedResults"
"formatting"

Never return:

"projects"
"summary"
"education"
"certifications"

If the problem concerns projects, use:

"sections"

or:

"experience"

or:

"skills"

depending on the actual problem.

If the problem concerns the summary, use:

"experience"

or:

"keywords"

depending on the actual problem.

============================================================
RECOMMENDATION OBJECT
============================================================

Every recommendation MUST contain:

- title
- description
- priority
- category
- impact
- actionable
- evidence
- suggestedFix

Keep every field concise.

Maximum 6 recommendation objects.

Do NOT repeat the same issue.

============================================================
IMPACT
============================================================

impact must be an integer from 0 to 100.

Impact represents the estimated potential improvement to the
ATS/recruiter result.

Use realistic values.

Do not give every recommendation 90+.

============================================================
EVIDENCE
============================================================

Evidence MUST refer only to information actually detected in the
resume or JD.

GOOD:

"Node.js is explicitly required in the JD but is not present
in the resume."

BAD:

"The candidate does not know Node.js."

The second statement is unsupported.

============================================================
SUGGESTED FIX
============================================================

Give a concrete and honest action.

GOOD:

"Add Node.js to the skills section if you have actually used it,
and mention where it was used in experience or projects."

BAD:

"Add Node.js."

Never encourage false claims.

============================================================
OPTIMIZED SUMMARY
============================================================

Create one concise improved professional summary.

Maximum 90 words.

It MUST:

- match the target role
- reflect actual experience
- use supported skills
- avoid unsupported claims
- avoid fabricated metrics
- avoid exaggerated seniority

============================================================
IMPROVED EXPERIENCE
============================================================

Return maximum 4 improved bullet-point strings.

Rewrite ONLY existing experience.

Do NOT invent:

- technologies
- metrics
- responsibilities
- companies
- achievements
- outcomes

Do NOT return company objects.

Do NOT return:

- company
- position
- startDate
- endDate
- responsibilities

Return only concise bullet-point strings.

============================================================
OUTPUT SIZE
============================================================

STRICT LIMITS:

matchedKeywords:
Maximum 15

missingKeywords:
Maximum 10

strengths:
Maximum 4

weaknesses:
Maximum 5

suggestions:
Maximum 6

optimizedSummary:
Maximum 90 words

improvedExperience:
Maximum 4 strings

Keep the response compact.

Do not repeat information.

Do not explain reasoning.

Do not output unnecessary details.

============================================================
OUTPUT FORMAT
============================================================

Return ONLY valid JSON.

NO markdown.

NO code fences.

NO explanations.

NO comments.

NO trailing commas.

Use exactly this structure:

{
  "atsScore": 0,
  "matchedKeywords": [],
  "missingKeywords": [],
  "strengths": [],
  "weaknesses": [],
  "suggestions": [
    {
      "title": "",
      "description": "",
      "priority": "medium",
      "category": "skills",
      "impact": 0,
      "actionable": true,
      "evidence": "",
      "suggestedFix": ""
    }
  ],
  "optimizedSummary": "",
  "improvedExperience": []
}

============================================================
FIELD VALIDATION
============================================================

atsScore:
Integer from 0 to 100.

matchedKeywords:
Array of strings.

When JD exists:
Only meaningful requirements supported by BOTH resume and JD.

When no JD:
MUST be [].

missingKeywords:
Array of strings.

When JD exists:
Only important JD requirements missing or insufficiently
demonstrated in the resume.

When no JD:
MUST be [].

strengths:
Array of concise evidence-based strings.

Maximum 4.

weaknesses:
Array of concise evidence-based strings.

Maximum 5.

suggestions:
Maximum 6 objects.

Each object MUST contain every required field.

priority MUST be exactly:

"critical"
"high"
"medium"
"low"

category MUST be exactly:

"contact"
"sections"
"skills"
"keywords"
"experience"
"actionVerbs"
"quantifiedResults"
"formatting"

impact:
Integer 0-100.

actionable:
Boolean.

optimizedSummary:
String, maximum 90 words.

improvedExperience:
Array of strings, maximum 4.

============================================================
FINAL QUALITY CHECK
============================================================

Before returning JSON verify:

1. Target role analyzed.
2. JD analyzed when provided.
3. matchedKeywords supported by BOTH resume and JD.
4. missingKeywords actually exist in JD.
5. Required and preferred JD requirements distinguished.
6. No keyword stuffing rewarded.
7. No technologies assumed.
8. No experience invented.
9. No metrics invented.
10. Seniority alignment checked.
11. Resume completeness checked.
12. Experience relevance checked.
13. Project relevance checked.
14. ATS parseability checked.
15. Most important problems prioritized.
16. Maximum 6 recommendations.
17. All recommendation categories valid.
18. No "projects" category.
19. optimizedSummary under 90 words.
20. improvedExperience maximum 4 strings.
21. JSON syntactically valid.
22. Output compact enough to avoid truncation.

============================================================
RESUME DATA
============================================================

${resumeJSON}

============================================================
END OF INPUT
============================================================

Return ONLY the JSON object.
`;
};
