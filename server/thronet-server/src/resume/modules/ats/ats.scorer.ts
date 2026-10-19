import {
  ATS_ACTION_VERBS,
  ATS_SCORE_CATEGORIES,
  ATS_STANDARD_SECTIONS,
  ATS_WEAK_BULLET_PATTERNS,
  ATS_METRIC_PATTERNS,
  ATS_YEAR_PATTERN,
  ATSBreakdown,
  ATSCategoryResult,
  ATSContactAnalysis,
  ATSSectionAnalysis,
  ATSSkillsAnalysis,
  ATSKeywordAnalysis,
  ATSExperienceAnalysis,
  ATSActionVerbAnalysis,
  ATSQuantifiedResultAnalysis,
  ATSAchievementAnalysis,
  ATSProjectAnalysis,
  ATSEducationAnalysis,
  ATSFormattingAnalysis,
  ATSRuleAnalysis,
  ATSRecommendation,
  ATSCategoryStatus,
  ATSScoreCategory,
  ATSDateConsistencyAnalysis,
  ATSMatchStatus,
  ATSEvidenceStrength,
  ATSJobRequirement,
  ATSRequirementMatch,
  ATSJobDescriptionAnalysis,
  clampATSScore,
  calculateATSPercentage,
  getATSCategoryStatus,
  ATSRequirementPriority,
  ATSFinding,
  ATSSectionDeepDive,
  ATSSectionDeepDivePriority,
  getATSSectionDeepDivePriority,
} from "./ats.types";
import { generateJSON } from "../../providers/gemini.provider";
import {
  getRoleMatchInfo,
  getRoleSkillPool,
  getRoleCoreSkillPool,
  getRoleKeywordPool,
  getRoleResponsibilityPool,
  getRoleProjectSignals,
  getRoleAchievementSignals,
  getRoleSenioritySignals,
  getPreferredRoleSections,
  hasRoleBenchmark,
} from "./role-intelligence";

// ============================================================
// RESUME SHAPE
// ============================================================

/**
 * ATS does not mutate the Resume document.
 *
 * We intentionally use a lightweight internal shape here so
 * the scorer remains independent from Mongoose.
 */
interface ATSResume {
  targetRole?: string;

  sections?: Array<{
    id?: string;
    type?: string;
    title?: string;
    enabled?: boolean;
    order?: number;
  }>;

  personalInfo?: {
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    address?: string;
    linkedIn?: string;
    github?: string;
    portfolio?: string;
  };

  summary?: string;

  skills?: Array<{
    title?: string;
    skills?: string[];
  }>;

  experience?: Array<{
    company?: string;
    position?: string;
    startDate?: string;
    endDate?: string;
    currentlyWorking?: boolean;
    responsibilities?: string[];
    achievements?: string[];
    location?: string;
  }>;

  internships?: Array<{
    company?: string;
    role?: string;
    startDate?: string;
    endDate?: string;
    currentlyInterning?: boolean;
    responsibilities?: string[];
    achievements?: string[];
  }>;

  education?: Array<{
    institution?: string;
    degree?: string;
    fieldOfStudy?: string;
    startYear?: number;
    endYear?: number;
    cgpa?: string;
  }>;

  // projects?: Array<{
  //   title?: string;
  //   role?: string;
  //   description?: string;
  //   technologies?: string[];
  //   github?: string;
  //   link?: string;
  // }>;

  projects?: Array<{
    title?: string;
    role?: string;
    description?: string | string[];
    technologies?: string[];
    github?: string;
    link?: string;
  }>;

  certifications?: string[];

  languages?: Array<{
    name?: string;
    level?: string;
  }>;

  awards?: string[];

  interests?: string[];

  achievements?: string[];

  strengths?: Array<{
    title?: string;
    description?: string;
  }>;

  customSections?: Array<{
    id?: string;
    type?: string;
    title?: string;
    enabled?: boolean;
    order?: number;
    items?: Array<{
      title?: string;
      subtitle?: string;
      description?: string;
    }>;
  }>;
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

const cleanText = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeText = (value: unknown): string => {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#./-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// ============================================================
// JD EXPERIENCE-EXPECTATION SIGNAL
// ============================================================

/**
 * Whether the resume is even expected to show formal professional
 * experience at all, based on the raw JD text (this runs before the
 * JD has been AI-parsed, so only the raw string is available here).
 *
 * Used by Section Completeness (and its deep-dive card) so a missing
 * Experience section isn't penalized — or recommended as a fix — for
 * fresher/entry-level postings that explicitly don't require it.
 */
const FRESHER_JD_SIGNALS = [
  "fresher",
  "freshers",
  "entry level",
  "entry-level",
  "no experience required",
  "no prior experience",
  "0-1 year",
  "0 to 1 year",
  "campus hire",
  "graduate trainee",
  "internship only",
];

export const isExperienceExpectedFromJD = (jobDescription?: string): boolean => {
  const text = cleanText(jobDescription);

  if (!text) {
    // No JD at all — we don't know the role's seniority bar, so keep
    // the traditional assumption that a resume should show experience.
    return true;
  }

  const normalized = normalizeText(text);

  const isFresherRole = FRESHER_JD_SIGNALS.some((signal) =>
    normalized.includes(normalizeText(signal)),
  );

  return !isFresherRole;
};

// const containsNormalizedPhrase = (text: string, phrase: string): boolean => {
//   const normalizedText = normalizeRequirementForMatch(text)
//     .toLowerCase()
//     .replace(/[./+#-]+/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();

//   const normalizedPhrase = normalizeRequirementForMatch(phrase)
//     .toLowerCase()
//     .replace(/[./+#-]+/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();

//   if (!normalizedText || !normalizedPhrase) {
//     return false;
//   }

//   // Exact phrase
//   if (normalizedText.includes(normalizedPhrase)) {
//     return true;
//   }

//   // Token-based matching
//   const textTokens = new Set(normalizedText.split(/\s+/));

//   const phraseTokens = normalizedPhrase.split(/\s+/);

//   // Single-word requirement
//   if (phraseTokens.length === 1) {
//     return textTokens.has(phraseTokens[0]);
//   }

//   // Multi-word requirement:
//   // all important words must exist
//   return phraseTokens.every((token) => textTokens.has(token));
// };

const containsNormalizedPhrase = (text: string, phrase: string): boolean => {
  const normalizedText = normalizeRequirementForMatch(text)
    .toLowerCase()
    .replace(/[/-]+/g, " ")
    .replace(/[./+#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normalizedPhrase = normalizeRequirementForMatch(phrase)
    .toLowerCase()
    .replace(/[/-]+/g, " ")
    .replace(/[./+#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedText || !normalizedPhrase) {
    return false;
  }

  const textTokens = normalizedText.split(/\s+/);
  const textTokenSet = new Set(textTokens);
  const phraseTokens = normalizedPhrase.split(/\s+/);

  // Single-word requirement: must match a WHOLE token.
  // Never fall back to substring — that's what let "ts" match
  // inside "posts" / "achievements".
  if (phraseTokens.length === 1) {
    return textTokenSet.has(phraseTokens[0]);
  }

  // Multi-word requirement: match as a contiguous run of tokens,
  // not just "all words appear somewhere in the text" (which can
  // also false-positive when the words are unrelated to each other).
  for (let i = 0; i <= textTokens.length - phraseTokens.length; i++) {
    if (phraseTokens.every((token, j) => textTokens[i + j] === token)) {
      return true;
    }
  }

  return false;
};

const countMatchingSignals = (
  textValues: string[],
  signals: string[],
): number => {
  if (!textValues.length || !signals.length) {
    return 0;
  }

  return signals.filter((signal) =>
    textValues.some((text) => containsNormalizedPhrase(text, signal)),
  ).length;
};

const uniqueStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);

    if (!cleaned) {
      continue;
    }

    const key = normalizeText(cleaned);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }

  return result;
};

const flattenStrings = (values: unknown[]): string[] => {
  return values
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return flattenStrings(value);
      }

      if (typeof value === "string") {
        return [value];
      }

      return [];
    })
    .filter(Boolean);
};

const getCategory = (id: string) => {
  return ATS_SCORE_CATEGORIES.find((category) => category.id === id);
};

export const getCategoryMaxScore = (id: string): number => {
  return getCategory(id)?.maxScore ?? 0;
};

export const makeCategoryResult = (
  categoryId: string,
  score: number,
  summary: string,
  issues: string[],
  suggestions: string[],
): ATSCategoryResult => {
  const category = getCategory(categoryId);

  const maxScore = category?.maxScore ?? 0;

  const safeScore = Math.round(clampATSScore(score, 0, maxScore));

  const percentage = Math.round(calculateATSPercentage(safeScore, maxScore));

  const status: ATSCategoryStatus = getATSCategoryStatus(percentage);

  return {
    category: categoryId as ATSScoreCategory,

    title: category?.title ?? categoryId,

    score: safeScore,

    maxScore,

    percentage,

    status,

    summary,

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// CONTACT ANALYSIS
// ============================================================

export const analyzeContact = (resume: ATSResume): ATSContactAnalysis => {
  const personalInfo = resume.personalInfo ?? {};

  const fullName = cleanText(personalInfo.fullName).length > 0;

  const email = cleanText(personalInfo.email).length > 0;

  const phone = cleanText(personalInfo.phone).length > 0;

  const linkedIn = cleanText(personalInfo.linkedIn).length > 0;

  const github = cleanText(personalInfo.github).length > 0;

  const portfolio = cleanText(personalInfo.portfolio).length > 0;

  /**
   * Contact scoring:
   *
   * Name       2
   * Email      2
   * Phone      2
   * LinkedIn   1.5
   * GitHub     1.5
   * Portfolio  1
   *
   * Total = 10
   */
  let score = 0;

  if (fullName) score += 2;
  if (email) score += 2;
  if (phone) score += 2;
  if (linkedIn) score += 1.5;
  if (github) score += 1.5;
  if (portfolio) score += 1;

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (!fullName) {
    issues.push("Full name is missing.");

    suggestions.push("Add your full professional name.");
  }

  if (!email) {
    issues.push("Email address is missing.");

    suggestions.push("Add a professional email address.");
  }

  if (!phone) {
    issues.push("Phone number is missing.");

    suggestions.push("Add a reachable phone number.");
  }

  if (!linkedIn) {
    suggestions.push("Add a LinkedIn profile if available.");
  }

  if (!github) {
    suggestions.push("Add GitHub when applying for technical roles.");
  }

  if (!portfolio) {
    suggestions.push("Add a portfolio when it strengthens your application.");
  }

  return {
    fullName,
    email,
    phone,
    linkedIn,
    github,
    portfolio,
    score,
    issues: uniqueStrings(issues),
    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// SECTION ANALYSIS
// ============================================================

export const analyzeSections = (
  resume: ATSResume,
  jobDescription?: string,
): ATSSectionAnalysis => {
  const experienceExpected = isExperienceExpectedFromJD(jobDescription);

  const sections = resume.sections ?? [];

  const enabledSections = sections.filter(
    (section) => section.enabled !== false,
  );

  const present = uniqueStrings(
    enabledSections.map((section) => section.type || section.id || ""),
  );

  const disabled = uniqueStrings(
    sections
      .filter((section) => section.enabled === false)
      .map((section) => section.type || section.id || ""),
  );

  const missing = ATS_STANDARD_SECTIONS.filter(
    (section) =>
      !present.some(
        (existing) => normalizeText(existing) === normalizeText(section),
      ),
  );

  const empty: string[] = [];

  if (present.includes("summary") && !cleanText(resume.summary)) {
    empty.push("summary");
  }

  if (
    present.includes("skills") &&
    !(resume.skills ?? []).some(
      (category) => (category.skills ?? []).length > 0,
    )
  ) {
    empty.push("skills");
  }

  if (
    present.includes("experience") &&
    (resume.experience ?? []).length === 0
  ) {
    empty.push("experience");
  }

  if (present.includes("projects") && (resume.projects ?? []).length === 0) {
    empty.push("projects");
  }
  if (
    present.includes("achievements") &&
    (resume.achievements ?? []).length === 0
  ) {
    empty.push("achievements");
  }

  if (
    present.includes("certifications") &&
    (resume.certifications ?? []).length === 0
  ) {
    empty.push("certifications");
  }

  if (present.includes("languages") && (resume.languages ?? []).length === 0) {
    empty.push("languages");
  }

  if (present.includes("awards") && (resume.awards ?? []).length === 0) {
    empty.push("awards");
  }
  const issues: string[] = [];
  const suggestions: string[] = [];

  const targetRole = cleanText(resume.targetRole);

  const preferredRoleSections = targetRole
    ? getPreferredRoleSections(targetRole)
    : [];

  const missingPreferredRoleSections = preferredRoleSections.filter(
    (section) =>
      !present.some(
        (existing) => normalizeText(existing) === normalizeText(section),
      ),
  );

  if (hasRoleBenchmark(targetRole) && missingPreferredRoleSections.length > 0) {
    suggestions.push(
      `Consider adding role-relevant sections: ${missingPreferredRoleSections.slice(0, 3).join(", ")}.`,
    );
  }

  if (missing.includes("summary")) {
    issues.push("Professional summary section is missing.");
  }

  if (empty.length > 0) {
    issues.push(`Empty sections detected: ${empty.join(", ")}.`);

    suggestions.push("Remove empty sections or add meaningful content.");
  }

  if (!present.includes("experience") && !present.includes("internships")) {
    if (experienceExpected) {
      suggestions.push("Add relevant professional or internship experience.");
    } else {
      // This role doesn't require prior experience — don't nudge the
      // candidate toward something the JD never asked for.
      suggestions.push(
        "This role doesn't require prior professional experience — strong Projects and Skills sections can carry equivalent weight.",
      );
    }
  }

  if (!present.includes("skills")) {
    issues.push("Skills section is missing.");

    suggestions.push("Add a dedicated skills section.");
  }

  if (!present.includes("education")) {
    suggestions.push("Include education when relevant to the target role.");
  }

  /**
   * Base section score.
   *
   * 15 points distributed according to important
   * section availability and completeness.
   */
  const importantSections = experienceExpected
    ? ["summary", "experience", "education", "skills", "projects"]
    : ["summary", "education", "skills", "projects"];

  const availableImportantSections = importantSections.filter(
    (section) => present.includes(section) && !empty.includes(section),
  ).length;

  let score = (availableImportantSections / importantSections.length) * 10;

  if (present.length >= 5) {
    score += 2;
  }

  if (
    (present.includes("certifications") && !empty.includes("certifications")) ||
    (present.includes("achievements") && !empty.includes("achievements"))
  ) {
    score += 1;
  }

  if (
    (present.includes("languages") && !empty.includes("languages")) ||
    (present.includes("awards") && !empty.includes("awards"))
  ) {
    score += 1;
  }
  if (empty.length === 0) {
    score += 1;
  }

  // Exceeding the bar: the JD doesn't require experience, but the
  // candidate has a genuine, filled Experience section anyway. A
  // modest bonus (not a blanket +20%, since this category only has 15
  // points total to give) rather than a big arbitrary jump.
  if (
    !experienceExpected &&
    present.includes("experience") &&
    !empty.includes("experience")
  ) {
    score += 2;
  }

  return {
    present,
    missing,
    disabled,
    empty,
    duplicate: [],
    score: clampATSScore(score, 0, getCategoryMaxScore("sections")),
    issues: uniqueStrings(issues),
    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// SKILLS ANALYSIS
// ============================================================

export const analyzeSkills = (resume: ATSResume): ATSSkillsAnalysis => {
  const categories = resume.skills ?? [];

  const allSkills = flattenStrings(
    categories.map((category) => category.skills ?? []),
  );

  const normalizedMap = new Map<string, string>();

  const duplicateSkills: string[] = [];

  for (const skill of allSkills) {
    const normalized = normalizeText(skill);

    if (!normalized) {
      continue;
    }

    if (normalizedMap.has(normalized)) {
      duplicateSkills.push(skill);
    } else {
      normalizedMap.set(normalized, skill);
    }
  }

  const skills = uniqueStrings(allSkills);

  // ------------------------------------------------------------
  // TARGET ROLE
  // ------------------------------------------------------------

  const targetRole = cleanText(resume.targetRole);

  // Resolve the user's target role to the
  // official Role Intelligence profile name.
  //
  // Example:
  // "react" -> "Frontend Developer"
  // "node js" -> "Backend Developer"
  // "full stack java developer" -> matched role profile
  const roleMatchInfo = targetRole ? getRoleMatchInfo(targetRole) : null;

  const displayRole = roleMatchInfo?.matchedProfile ?? targetRole;

  // ------------------------------------------------------------
  // ROLE SKILL BENCHMARK
  // ------------------------------------------------------------

  const roleSkillPool = targetRole ? getRoleSkillPool(targetRole) : [];

  const roleCoreSkillPool = targetRole ? getRoleCoreSkillPool(targetRole) : [];

  // const roleMatchedSkills = roleSkillPool.filter((roleSkill) =>
  //   skills.some((skill) => containsNormalizedPhrase(skill, roleSkill)),
  // );

  // const roleCoreMatchedSkills = roleCoreSkillPool.filter((roleSkill) =>
  //   skills.some((skill) => containsNormalizedPhrase(skill, roleSkill)),
  // );

  const roleMatchedSkills = roleSkillPool.filter((roleSkill) =>
    skills.some((skill) =>
      getRequirementAliases(roleSkill).some((alias) =>
        containsNormalizedPhrase(skill, alias),
      ),
    ),
  );

  const roleCoreMatchedSkills = roleCoreSkillPool.filter((roleSkill) =>
    skills.some((skill) =>
      getRequirementAliases(roleSkill).some((alias) =>
        containsNormalizedPhrase(skill, alias),
      ),
    ),
  );

  const roleCoverage =
    roleSkillPool.length === 0
      ? 0
      : (roleMatchedSkills.length / roleSkillPool.length) * 100;

  const coreCoverage =
    roleCoreSkillPool.length === 0
      ? 0
      : (roleCoreMatchedSkills.length / roleCoreSkillPool.length) * 100;

  const issues: string[] = [];
  const suggestions: string[] = [];

  // ------------------------------------------------------------
  // SKILL VALIDATION
  // ------------------------------------------------------------

  if (skills.length === 0) {
    issues.push("No skills were detected.");

    suggestions.push("Add relevant technical or professional skills.");
  }

  if (skills.length < 5) {
    issues.push("Very few skills are listed.");

    suggestions.push("Add the most relevant skills for your target role.");
  }

  if (duplicateSkills.length > 0) {
    issues.push("Duplicate skills were detected.");

    suggestions.push("Remove duplicate skills and keep one clean occurrence.");
  }

  if (categories.length === 0) {
    suggestions.push("Organize skills into clear categories.");
  }

  // ------------------------------------------------------------
  // ROLE BENCHMARK
  // ------------------------------------------------------------

  if (
    hasRoleBenchmark(targetRole) &&
    roleSkillPool.length > 0 &&
    roleCoverage < 40
  ) {
    issues.push(
      `Low alignment with the ${displayRole} role benchmark (${Number(
        roleCoverage.toFixed(1),
      )}% skill coverage).`,
    );

    suggestions.push(
      `Add relevant ${displayRole} skills only when you genuinely have those skills.`,
    );
  }

  if (
    hasRoleBenchmark(targetRole) &&
    roleCoreSkillPool.length > 0 &&
    coreCoverage < 50
  ) {
    suggestions.push("Prioritize core skills expected for the target role.");
  }

  // ------------------------------------------------------------
  // SKILL SCORE
  // ------------------------------------------------------------

  let score = 0;

  if (skills.length >= 5) {
    score += 4;
  }

  if (skills.length >= 10) {
    score += 3;
  }

  if (skills.length >= 15) {
    score += 2;
  }

  // Category bonuses only apply when
  // the resume actually contains skills.
  if (skills.length > 0 && categories.length >= 2) {
    score += 2;
  }

  if (skills.length > 0 && categories.length >= 4) {
    score += 2;
  }

  // Do not reward duplicate-free structure
  // when there are no skills.
  if (skills.length > 0 && duplicateSkills.length === 0) {
    score += 1;
  }

  // Too many skills can reduce readability.
  if (skills.length >= 20) {
    score -= 1;
  }

  // ------------------------------------------------------------
  // ROLE ALIGNMENT
  // ------------------------------------------------------------

  // Role alignment only contributes when
  // actual skills exist.
  if (
    skills.length > 0 &&
    hasRoleBenchmark(targetRole) &&
    roleSkillPool.length > 0
  ) {
    score += (Math.min(roleCoverage, 100) / 100) * 3;
  }

  // ------------------------------------------------------------
  // FINAL RESULT
  // ------------------------------------------------------------

  return {
    totalSkills: skills.length,

    categories: categories.length,

    skills,

    duplicateSkills: uniqueStrings(duplicateSkills),

    suspiciousSkills: [],

    score: clampATSScore(score, 0, getCategoryMaxScore("skills")),

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// EXPERIENCE ANALYSIS
// ============================================================

/**
 * project.description is stored as string[] (one entry per
 * bullet) in the real resume schema, but has historically been
 * treated as a single string by cleanText() — which silently
 * returns "" for any non-string input. That bug caused every
 * project to look content-less to both analyzeProjects and the
 * section deep dive. These two helpers are the single source of
 * truth for reading project bullets from here on.
 */
const getProjectDescriptionLines = (project: {
  description?: string | string[];
}): string[] => {
  const raw = project.description;

  if (Array.isArray(raw)) {
    return raw.map((line) => cleanText(line)).filter(Boolean);
  }

  return cleanText(raw)
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);
};

const getProjectDescriptionText = (project: {
  description?: string | string[];
}): string => getProjectDescriptionLines(project).join(" ");

const getExperienceBullets = (resume: ATSResume): string[] => {
  const experienceBullets = (resume.experience ?? []).flatMap((experience) => [
    ...(experience.responsibilities ?? []),
    ...(experience.achievements ?? []),
  ]);

  const internshipBullets = (resume.internships ?? []).flatMap((internship) => [
    ...(internship.responsibilities ?? []),
    ...(internship.achievements ?? []),
  ]);

  return [...experienceBullets, ...internshipBullets].filter(
    (bullet) => cleanText(bullet).length > 0,
  );
};

const isWeakBullet = (bullet: string): boolean => {
  const text = cleanText(bullet);

  return ATS_WEAK_BULLET_PATTERNS.some((pattern) => pattern.test(text));
};

const containsMetric = (bullet: string): boolean => {
  return (
    // bullet.match(ATS_METRIC_PATTERNS.percentage) !== null ||
    // bullet.match(ATS_METRIC_PATTERNS.currency) !== null ||
    // bullet.match(ATS_METRIC_PATTERNS.time) !== null ||
    // bullet.match(ATS_METRIC_PATTERNS.impactNumber) !== null

    bullet.match(ATS_METRIC_PATTERNS.percentage) !== null ||
    bullet.match(ATS_METRIC_PATTERNS.currency) !== null ||
    bullet.match(ATS_METRIC_PATTERNS.time) !== null ||
    bullet.match(ATS_METRIC_PATTERNS.impactNumber) !== null ||
    bullet.match(ATS_METRIC_PATTERNS.plusQuantifier) !== null
  );
};
const containsActionVerb = (bullet: string): boolean => {
  const normalized = normalizeText(bullet);

  if (!normalized) {
    return false;
  }

  const firstWord = normalized.split(" ")[0];

  return ATS_ACTION_VERBS.some((verb) => verb === firstWord);
};

export const analyzeExperience = (resume: ATSResume): ATSExperienceAnalysis => {
  const experience = resume.experience ?? [];

  const internships = resume.internships ?? [];

  const bullets = getExperienceBullets(resume);

  const responsibilityBullets =
    experience.reduce(
      (count, item) => count + (item.responsibilities?.length ?? 0),
      0,
    ) +
    internships.reduce(
      (count, item) => count + (item.responsibilities?.length ?? 0),
      0,
    );

  const achievementBullets =
    experience.reduce(
      (count, item) => count + (item.achievements?.length ?? 0),
      0,
    ) +
    internships.reduce(
      (count, item) => count + (item.achievements?.length ?? 0),
      0,
    );

  const quantifiedBullets = bullets.filter(containsMetric).length;

  const weakBullets = bullets.filter(isWeakBullet);

  const strongBullets = bullets.filter(
    (bullet) => containsActionVerb(bullet) && containsMetric(bullet),
  );

  const repetitiveBullets: string[] = [];

  const seen = new Set<string>();

  for (const bullet of bullets) {
    const normalized = normalizeText(bullet);

    if (seen.has(normalized)) {
      repetitiveBullets.push(bullet);
    }

    seen.add(normalized);
  }

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (experience.length === 0 && internships.length === 0) {
    issues.push("No professional experience or internships were detected.");

    suggestions.push(
      "Add relevant internships, projects or experience where appropriate.",
    );
  }

  if (bullets.length > 0 && achievementBullets === 0) {
    issues.push(
      "Experience contains responsibilities but no explicit achievements.",
    );

    suggestions.push(
      "Convert important responsibilities into measurable achievements.",
    );
  }

  if (quantifiedBullets === 0 && bullets.length > 0) {
    issues.push("No measurable results were detected in experience bullets.");

    suggestions.push("Add numbers, percentages, scale or measurable outcomes.");
  }

  if (weakBullets.length > 0) {
    issues.push(`${weakBullets.length} weakly phrased bullet(s) detected.`);

    suggestions.push("Replace weak openings with strong action verbs.");
  }

  if (repetitiveBullets.length > 0) {
    issues.push("Repeated experience bullets were detected.");

    suggestions.push("Remove duplicate or highly repetitive statements.");
  }

  const targetRole = cleanText(resume.targetRole);

  const displayRole =
    cleanText(getRoleMatchInfo(targetRole).matchedProfile) ||
    targetRole ||
    "target role";

  const roleResponsibilities = targetRole
    ? getRoleResponsibilityPool(targetRole)
    : [];

  const roleSenioritySignals = targetRole
    ? getRoleSenioritySignals(targetRole)
    : {
        entry: [],
        mid: [],
        senior: [],
        lead: [],
      };

  const roleRelevantBullets =
    roleResponsibilities.length > 0
      ? bullets.filter((bullet) =>
          roleResponsibilities.some((signal) =>
            containsNormalizedPhrase(bullet, signal),
          ),
        )
      : [];

  const senioritySignalBullets = bullets.filter((bullet) =>
    [
      ...roleSenioritySignals.entry,
      ...roleSenioritySignals.mid,
      ...roleSenioritySignals.senior,
      ...roleSenioritySignals.lead,
    ].some((signal) => containsNormalizedPhrase(bullet, signal)),
  );

  const roleRelevanceCoverage =
    roleResponsibilities.length === 0 || bullets.length === 0
      ? 0
      : (roleRelevantBullets.length / bullets.length) * 100;

  const resolvedRoleInfo = targetRole ? getRoleMatchInfo(targetRole) : null;

  if (
    hasRoleBenchmark(targetRole) &&
    bullets.length > 0 &&
    roleResponsibilities.length > 0 &&
    roleRelevantBullets.length === 0
  ) {
    issues.push(
      `Experience bullets show weak alignment with the ${displayRole} role benchmark.`,
    );

    suggestions.push(
      `Rewrite experience bullets to emphasize responsibilities that genuinely match the ${displayRole} role.`,
    );
  }

  if (
    hasRoleBenchmark(targetRole) &&
    bullets.length > 0 &&
    senioritySignalBullets.length === 0
  ) {
    suggestions.push(
      "Use role-appropriate ownership and impact language that accurately reflects your seniority.",
    );
  }

  let score = 0;

  if (experience.length > 0) {
    score += 4;
  } else if (internships.length > 0) {
    score += 3;
  }

  if (bullets.length >= 3) {
    score += 2;
  }

  if (achievementBullets > 0) {
    score += 3;
  }

  if (quantifiedBullets > 0) {
    score += 2;
  }

  if (strongBullets.length > 0) {
    score += 2;
  }

  // Role relevance contributes up to 2 points.
  if (
    hasRoleBenchmark(targetRole) &&
    roleResponsibilities.length > 0 &&
    bullets.length > 0
  ) {
    score += (Math.min(roleRelevanceCoverage, 100) / 100) * 2;
  }

  if (weakBullets.length === 0 && bullets.length > 0) {
    score += 1;
  }

  if (repetitiveBullets.length > 0) {
    score -= 1;
  }

  return {
    experienceCount: experience.length,

    internshipCount: internships.length,

    totalBullets: bullets.length,

    responsibilityBullets,

    achievementBullets,

    quantifiedBullets,

    weakBullets: uniqueStrings(weakBullets),

    strongBullets: uniqueStrings(strongBullets),

    repetitiveBullets: uniqueStrings(repetitiveBullets),

    relevanceIssues: [],

    score: clampATSScore(score, 0, getCategoryMaxScore("experience")),

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// ACTION VERB ANALYSIS
// ============================================================

export const analyzeActionVerbs = (
  resume: ATSResume,
): ATSActionVerbAnalysis => {
  const bullets = getExperienceBullets(resume);

  const bulletsWithActionVerbs = bullets.filter(containsActionVerb);

  const detectedVerbs = bulletsWithActionVerbs.map(
    (bullet) => normalizeText(bullet).split(" ")[0],
  );

  const verbFrequency = new Map<string, number>();

  for (const verb of detectedVerbs) {
    verbFrequency.set(verb, (verbFrequency.get(verb) ?? 0) + 1);
  }

  const repeatedVerbs = Array.from(verbFrequency.entries())
    .filter(([, count]) => count >= 3)
    .map(([verb]) => verb);

  const weakOpenings = bullets.filter((bullet) => !containsActionVerb(bullet));

  const coverage =
    bullets.length === 0
      ? 0
      : (bulletsWithActionVerbs.length / bullets.length) * 100;

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (bullets.length > 0 && coverage < 50) {
    issues.push("Many bullets do not begin with strong action verbs.");

    suggestions.push(
      "Start achievement and responsibility bullets with precise action verbs.",
    );
  }

  if (repeatedVerbs.length > 0) {
    issues.push(`Repeated action verbs detected: ${repeatedVerbs.join(", ")}.`);

    suggestions.push(
      "Use varied action verbs where they accurately describe the work.",
    );
  }

  let score = (coverage / 100) * getCategoryMaxScore("actionVerbs");

  if (repeatedVerbs.length > 0) {
    score -= 1;
  }

  return {
    totalBullets: bullets.length,

    bulletsWithActionVerbs: bulletsWithActionVerbs.length,

    actionVerbCoverage: Number(coverage.toFixed(2)),

    detectedVerbs: uniqueStrings(detectedVerbs),

    weakOpenings: uniqueStrings(weakOpenings),

    repeatedVerbs: uniqueStrings(repeatedVerbs),

    score: clampATSScore(score, 0, getCategoryMaxScore("actionVerbs")),

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// QUANTIFIED RESULT ANALYSIS
// ============================================================

const extractMatches = (regex: RegExp, text: string): string[] => {
  /**
   * String.match() avoids manually managing lastIndex
   * for global regexes.
   */
  return text.match(regex) ?? [];
};

export const analyzeQuantifiedResults = (
  resume: ATSResume,
): ATSQuantifiedResultAnalysis => {
  const bullets = getExperienceBullets(resume);

  const allText = bullets.join(" ");

  const percentages = extractMatches(ATS_METRIC_PATTERNS.percentage, allText);

  const currencies = extractMatches(ATS_METRIC_PATTERNS.currency, allText);

  const timeMetrics = extractMatches(ATS_METRIC_PATTERNS.time, allText);

  const numbers = extractMatches(ATS_METRIC_PATTERNS.impactNumber, allText);

  const quantifiedBullets = bullets.filter(
    (bullet) =>
      // extractMatches(ATS_METRIC_PATTERNS.percentage, bullet).length > 0 ||
      // extractMatches(ATS_METRIC_PATTERNS.currency, bullet).length > 0 ||
      // extractMatches(ATS_METRIC_PATTERNS.time, bullet).length > 0 ||
      // extractMatches(ATS_METRIC_PATTERNS.impactNumber, bullet).length > 0,

      extractMatches(ATS_METRIC_PATTERNS.percentage, bullet).length > 0 ||
      extractMatches(ATS_METRIC_PATTERNS.currency, bullet).length > 0 ||
      extractMatches(ATS_METRIC_PATTERNS.time, bullet).length > 0 ||
      extractMatches(ATS_METRIC_PATTERNS.impactNumber, bullet).length > 0 ||
      extractMatches(ATS_METRIC_PATTERNS.plusQuantifier, bullet).length > 0,
  ).length;

  const metricCoverage =
    bullets.length === 0 ? 0 : (quantifiedBullets / bullets.length) * 100;

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (bullets.length > 0 && quantifiedBullets === 0) {
    issues.push("No measurable impact was detected.");

    suggestions.push(
      "Add measurable outcomes such as growth, speed, scale, users, revenue or efficiency.",
    );
  } else if (metricCoverage < 30) {
    suggestions.push("Add measurable outcomes to more experience bullets.");
  }

  const score =
    (metricCoverage / 100) * getCategoryMaxScore("quantifiedResults");

  return {
    totalBullets: bullets.length,

    quantifiedBullets,

    percentages: uniqueStrings(percentages),

    numbers: uniqueStrings(numbers),

    currencies: uniqueStrings(currencies),

    timeMetrics: uniqueStrings(timeMetrics),

    performanceMetrics: uniqueStrings([...percentages, ...numbers]),

    metricCoverage: Number(metricCoverage.toFixed(2)),

    score: clampATSScore(score, 0, getCategoryMaxScore("quantifiedResults")),

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// ACHIEVEMENT ANALYSIS
// ============================================================

export const analyzeAchievements = (
  resume: ATSResume,
): ATSAchievementAnalysis => {
  const achievements = [
    ...(resume.achievements ?? []),
    ...(resume.experience ?? []).flatMap((item) => item.achievements ?? []),
    ...(resume.internships ?? []).flatMap((item) => item.achievements ?? []),
  ].filter(Boolean);

  const quantifiedAchievements = achievements.filter(containsMetric);

  const impactStatements = achievements.filter(
    (achievement) =>
      containsActionVerb(achievement) || containsMetric(achievement),
  );

  const weakAchievements = achievements.filter(isWeakBullet);

  const strongAchievements = achievements.filter(
    (achievement) =>
      containsActionVerb(achievement) && containsMetric(achievement),
  );

  const targetRole = cleanText(resume.targetRole);

  const roleAchievementSignals = targetRole
    ? getRoleAchievementSignals(targetRole)
    : [];

  const roleRelevantAchievements =
    roleAchievementSignals.length > 0
      ? achievements.filter((achievement) =>
          roleAchievementSignals.some((signal) =>
            containsNormalizedPhrase(achievement, signal),
          ),
        )
      : [];

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (achievements.length === 0) {
    issues.push("No achievements were found.");
    suggestions.push(
      "Add meaningful achievements where you have measurable results.",
    );
  }

  if (achievements.length > 0 && quantifiedAchievements.length === 0) {
    suggestions.push(
      "Quantify important achievements with measurable outcomes.",
    );
  }

  if (
    hasRoleBenchmark(targetRole) &&
    achievements.length > 0 &&
    roleAchievementSignals.length > 0 &&
    roleRelevantAchievements.length === 0
  ) {
    suggestions.push(
      `Emphasize measurable achievements relevant to ${targetRole}, such as ${roleAchievementSignals.slice(0, 3).join(", ")}.`,
    );
  }

  return {
    totalAchievements: achievements.length,

    quantifiedAchievements: quantifiedAchievements.length,

    impactStatements: impactStatements.length,

    weakAchievements: uniqueStrings(weakAchievements),

    strongAchievements: uniqueStrings(strongAchievements),

    score: 0,

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// PROJECT ANALYSIS
// ============================================================

export const analyzeProjects = (resume: ATSResume): ATSProjectAnalysis => {
  const projects = resume.projects ?? [];

  const projectsWithTechnologies = projects.filter(
    (project) => (project.technologies ?? []).length > 0,
  ).length;

  const projectsWithDescription = projects.filter(
    (project) => getProjectDescriptionText(project).length > 0,
  ).length;

  const projectsWithLinks = projects.filter(
    (project) =>
      Boolean(cleanText(project.github)) || Boolean(cleanText(project.link)),
  ).length;

  const projectsWithImpact = projects.filter((project) =>
    containsMetric(getProjectDescriptionText(project)),
  ).length;

  const projectsWithMetrics = projectsWithImpact;

  const weakProjects = projects
    .filter((project) => !getProjectDescriptionText(project))
    .map((project) => cleanText(project.title));

  const strongProjects = projects
    .filter(
      (project) =>
        getProjectDescriptionText(project) &&
        (project.technologies ?? []).length > 0 &&
        containsMetric(getProjectDescriptionText(project)),
    )
    .map((project) => cleanText(project.title));
  const targetRole = cleanText(resume.targetRole);

  const roleProjectSignals = targetRole
    ? getRoleProjectSignals(targetRole)
    : [];

  const roleRelevantProjects =
    roleProjectSignals.length > 0
      ? projects.filter((project) =>
          roleProjectSignals.some((signal) =>
            containsNormalizedPhrase(
              [
                project.title,
                project.role,
                project.description,
                ...(project.technologies ?? []),
              ]
                .filter(Boolean)
                .join(" "),
              signal,
            ),
          ),
        )
      : [];

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (projects.length > 0 && projectsWithDescription < projects.length) {
    issues.push("Some projects do not have descriptions.");
  }

  if (projects.length > 0 && projectsWithTechnologies < projects.length) {
    suggestions.push("Add relevant technologies to projects.");
  }

  if (projects.length > 0 && projectsWithImpact === 0) {
    suggestions.push(
      "Describe project outcomes or measurable impact where possible.",
    );
  }

  if (
    hasRoleBenchmark(targetRole) &&
    projects.length > 0 &&
    roleProjectSignals.length > 0 &&
    roleRelevantProjects.length === 0
  ) {
    suggestions.push(
      `Highlight projects that genuinely demonstrate ${targetRole}-relevant work such as ${roleProjectSignals.slice(0, 3).join(", ")}.`,
    );
  }

  return {
    projectCount: projects.length,

    projectsWithTechnologies,

    projectsWithDescription,

    projectsWithLinks,

    projectsWithImpact,

    projectsWithMetrics,

    weakProjects: uniqueStrings(weakProjects),

    strongProjects: uniqueStrings(strongProjects),

    score: 0,

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// SECTION DEEP DIVE — DETERMINISTIC BULLET TAGGING
//
// No AI involved here. Every experience/internship bullet and
// every project description gets tagged with plain rule-based
// problems, reusing the exact same helpers the scoring
// categories already rely on (isWeakBullet, containsActionVerb,
// containsMetric) so the deep dive stays consistent with the
// score breakdown shown elsewhere.
//
// whyItMatters / suggestedFix / quantificationExamples are left
// empty here — those are filled in the next build step (a
// batched AI pass over just the flagged bullets).
// ============================================================

const TOO_GENERIC_MIN_WORDS = 5;

const isTooGeneric = (bullet: string): boolean => {
  const wordCount = cleanText(bullet).split(/\s+/).filter(Boolean).length;

  return wordCount > 0 && wordCount < TOO_GENERIC_MIN_WORDS;
};

/**
 * Tags a single bullet against the same rules the scorer already
 * uses elsewhere. `repeatedVerbs` is the set of first-words that
 * appear 3+ times across the whole section (see
 * analyzeActionVerbs) — passed in so every bullet in the section
 * is checked against the same shared set.
 */
const tagBullet = (
  bullet: string,
  repeatedVerbs: Set<string>,
): {
  problems: string[];
  needsQuantification: boolean;
} => {
  const problems: string[] = [];

  const weakOpening = isWeakBullet(bullet) || !containsActionVerb(bullet);

  if (weakOpening) {
    problems.push("Weak action verb");
  }

  const firstWord = normalizeText(bullet).split(" ")[0];

  if (!weakOpening && firstWord && repeatedVerbs.has(firstWord)) {
    problems.push("Repeated action verb");
  }

  if (isTooGeneric(bullet)) {
    problems.push("Too generic");
  }

  const hasMetric = containsMetric(bullet);

  if (!hasMetric) {
    problems.push("No measurable impact");
  }

  return {
    problems,
    needsQuantification: !hasMetric,
  };
};

const buildFinding = (id: string, targetText: string): ATSFinding => {
  const emptyFinding: ATSFinding = {
    id,

    targetText,

    verdict: "excellent",

    problems: [],

    whyItMatters: "",

    suggestedFix: "",

    needsQuantification: false,

    quantificationExamples: [],
  };

  const text = cleanText(targetText);

  if (!text) {
    return emptyFinding;
  }

  return emptyFinding;
};

export const buildExperienceFindings = (resume: ATSResume): ATSFinding[] => {
  const bullets = getExperienceBullets(resume);

  if (bullets.length === 0) {
    return [];
  }

  // Reuse the exact same repeated-verb detection analyzeActionVerbs uses.
  const detectedVerbs = bullets
    .filter(containsActionVerb)
    .map((bullet) => normalizeText(bullet).split(" ")[0]);

  const verbFrequency = new Map<string, number>();

  for (const verb of detectedVerbs) {
    verbFrequency.set(verb, (verbFrequency.get(verb) ?? 0) + 1);
  }

  const repeatedVerbs = new Set(
    Array.from(verbFrequency.entries())
      .filter(([, count]) => count >= 3)
      .map(([verb]) => verb),
  );

  return bullets.map((bullet, index) => {
    const finding = buildFinding(`experience-${index}`, bullet);

    const { problems, needsQuantification } = tagBullet(bullet, repeatedVerbs);

    if (problems.length === 0) {
      return finding;
    }

    return {
      ...finding,

      verdict: "needs-improvement",

      problems,

      needsQuantification,
    };
  });
};

export const buildProjectFindings = (resume: ATSResume): ATSFinding[] => {
  const projects = resume.projects ?? [];

  const findings: ATSFinding[] = [];

  projects.forEach((project, projectIndex) => {
    const bullets = getProjectDescriptionLines(project);

    if (bullets.length === 0) {
      return;
    }

    const detectedVerbs = bullets
      .filter(containsActionVerb)
      .map((bullet) => normalizeText(bullet).split(" ")[0]);

    const verbFrequency = new Map<string, number>();

    for (const verb of detectedVerbs) {
      verbFrequency.set(verb, (verbFrequency.get(verb) ?? 0) + 1);
    }

    const repeatedVerbs = new Set(
      Array.from(verbFrequency.entries())
        .filter(([, count]) => count >= 3)
        .map(([verb]) => verb),
    );

    bullets.forEach((bullet, bulletIndex) => {
      const finding = buildFinding(
        `project-${projectIndex}-${bulletIndex}`,
        bullet,
      );

      const { problems, needsQuantification } = tagBullet(
        bullet,
        repeatedVerbs,
      );

      if (problems.length === 0) {
        findings.push(finding);

        return;
      }

      findings.push({
        ...finding,

        verdict: "needs-improvement",

        problems,

        needsQuantification,
      });
    });
  });

  return findings;
};

// export const buildDeterministicSectionDeepDive = (
//   resume: ATSResume,
//   categories: ATSCategoryResult[],
// ): ATSSectionDeepDive[] => {
//   const sections: ATSSectionDeepDive[] = [];

//   const buildFromFindings = (
//     sectionId: ATSScoreCategory,
//     title: string,
//     findings: ATSFinding[],
//     categoryOverride?: ATSCategoryResult,
//   ): ATSSectionDeepDive | null => {
//     if (findings.length === 0) {
//       return null;
//     }

//     const excellentCount = findings.filter(
//       (finding) => finding.verdict === "excellent",
//     ).length;

//     const percentage =
//       categoryOverride?.percentage ??
//       Number(((excellentCount / findings.length) * 100).toFixed(1));

//     const status: ATSCategoryStatus =
//       categoryOverride?.status ?? getATSCategoryStatus(percentage);

//     return {
//       sectionId,

//       title,

//       percentage,

//       priority: getATSSectionDeepDivePriority(status, percentage),

//       isFullyOptimized: excellentCount === findings.length,

//       findings,
//     };
//   };

//   const experienceCategory = categories.find(
//     (category) => category.category === "experience",
//   );

//   const experienceSection = buildFromFindings(
//     "experience",
//     "Experience",
//     buildExperienceFindings(resume),
//     experienceCategory,
//   );

//   if (experienceSection) {
//     sections.push(experienceSection);
//   }

//   // Projects has its own sectionId even though it isn't one of
//   // the 8 scored categories in ATS_SCORE_CATEGORIES — sectionId
//   // is intentionally a string & {} union so this is safe, and
//   // it lets the frontend key off it distinctly from "experience".
//   const projectsSection = buildFromFindings(
//     "projects",
//     "Projects",
//     buildProjectFindings(resume),
//   );

//   if (projectsSection) {
//     sections.push(projectsSection);
//   }

//   return sections;
// };

// ============================================================
// SKILLS DEEP DIVE — FROM EXISTING JD MATCH DATA
//
// No new AI call here — reuses jdAnalysis.matches, which is
// already computed (lexically, then semantically) earlier in the
// pipeline. Only missing/partial technical requirements become
// findings; matched skills are already visible in the top-level
// matchedKeywords list, so repeating them here would be noise.
//
// "Required by JD" vs "Preferred by JD" comes straight from the
// JD's own stated priority — this is a more reliable signal of
// urgency than guessing whether a missing skill "matches the
// candidate's stack", and needs no extra AI call to produce.
// ============================================================

export const buildSkillsDeepDiveFromJD = (
  jdAnalysis: ATSJobDescriptionAnalysis | undefined,
): ATSSectionDeepDive | null => {
  if (!jdAnalysis || jdAnalysis.matches.length === 0) {
    return null;
  }

  const requirementById = new Map(
    (jdAnalysis.requirements ?? []).map((requirement) => [
      requirement.id,
      requirement,
    ]),
  );

  const technicalCategories = new Set([
    "skill",
    "technology",
    "framework",
    "database",
    "cloud",
    "devops",
    "testing",
    "tool",
    "api",
    "architecture",
    "other",
  ]);

  const skillMatches = jdAnalysis.matches.filter((match) => {
    const requirement = requirementById.get(match.requirementId);

    return requirement ? technicalCategories.has(requirement.category) : false;
  });

  if (skillMatches.length === 0) {
    return null;
  }

  const buildSkillFinding = (match: ATSRequirementMatch): ATSFinding => {
    const isRequired = match.priority === "required";

    const problems = [isRequired ? "Required by JD" : "Preferred by JD"];

    if (match.status === "partial") {
      problems.push("Only weakly demonstrated");
    }

    const suggestedFix = isRequired
      ? `Add "${match.requirement}" to your skills section if you genuinely have experience with it — the JD lists it as required.`
      : `Consider adding "${match.requirement}" if you have real experience with it — the JD lists it as a preferred (optional) skill.`;

    return {
      id: `skill-${match.requirementId}`,

      targetText: match.requirement,

      verdict: "needs-improvement",

      problems,

      whyItMatters:
        match.explanation ||
        `This ${isRequired ? "required" : "preferred"} skill from the job description isn't clearly demonstrated in your resume.`,

      suggestedFix,

      needsQuantification: false,

      quantificationExamples: [],
    };
  };

  const requiredPresent = skillMatches
    .filter(
      (match) => match.priority === "required" && match.status === "matched",
    )
    .map((match) => match.requirement);

  const requiredMissing = skillMatches
    .filter(
      (match) => match.priority === "required" && match.status !== "matched",
    )
    .map(buildSkillFinding);

  const goodToHave = skillMatches
    .filter(
      (match) => match.priority === "preferred" && match.status !== "matched",
    )
    .map(buildSkillFinding);

  const isFullyOptimized =
    requiredMissing.length === 0 && goodToHave.length === 0;

  const percentage = Number(
    (
      ((skillMatches.length - (requiredMissing.length + goodToHave.length)) /
        skillMatches.length) *
      100
    ).toFixed(1),
  );

  const status = getATSCategoryStatus(percentage);

  return {
    sectionId: "skills",

    title: "Skills",

    percentage,

    priority: getATSSectionDeepDivePriority(status, percentage),

    isFullyOptimized,

    findings: [],

    skillsBreakdown: {
      requiredPresent,

      requiredMissing,

      goodToHave,
    },
  };
};

/**
 * Assembles the deterministic (pre-AI) section deep dive. Returns
 * one ATSSectionDeepDive per section that actually has content —
 * a section with zero bullets/projects is omitted entirely rather
 * than shown as an empty block.
 *
 * Priority/percentage for "experience" comes straight from the
 * already-computed scoring category, so the deep dive stays
 * consistent with the score breakdown shown elsewhere. Projects
 * has no dedicated scoring category today, so its percentage is
 * derived from the ratio of excellent findings instead. Skills
 * (only populated when a JD was provided) reuses jdAnalysis
 * directly.
 *
 * The returned array is always sorted critical -> high -> medium
 * -> low, so the frontend can render it as-is.
 */
/**
 * Generic builder for sections that aren't itemized bullet-by-
 * bullet — Education, Achievements. Reuses whatever ruleAnalysis
 * already computed for that section (issues[] / suggestions[])
 * rather than re-deriving anything or making a new AI call. A
 * section with zero issues still gets an entry here
 * (isFullyOptimized: true, empty findings) rather than being
 * silently omitted.
 */
const buildSectionFromIssues = (
  sectionId: ATSScoreCategory,
  title: string,
  analysis: { issues?: string[]; suggestions?: string[] } | undefined,
  categoryOverride?: ATSCategoryResult,
): ATSSectionDeepDive => {
  const issues = analysis?.issues ?? [];
  const suggestions = analysis?.suggestions ?? [];

  if (issues.length === 0) {
    const percentage = categoryOverride?.percentage ?? 100;

    return {
      sectionId,
      title,
      percentage,
      priority: getATSSectionDeepDivePriority(
        categoryOverride?.status ?? "excellent",
        percentage,
      ),
      isFullyOptimized: true,
      findings: [],
    };
  }

  const findings: ATSFinding[] = issues.map((issue, index) => ({
    id: `${sectionId}-${index}`,
    targetText: issue,
    verdict: "needs-improvement",
    problems: [issue],
    whyItMatters: issue,
    suggestedFix: suggestions[index] ?? suggestions[0] ?? "",
    needsQuantification: false,
    quantificationExamples: [],
  }));

  // No dedicated scoring category for education/achievements —
  // fall back to a simple deterministic estimate from issue count.
  const percentage =
    categoryOverride?.percentage ?? Math.max(40, 100 - issues.length * 20);

  const status = categoryOverride?.status ?? getATSCategoryStatus(percentage);

  return {
    sectionId,
    title,
    percentage,
    priority: getATSSectionDeepDivePriority(status, percentage),
    isFullyOptimized: false,
    findings,
  };
};

const buildSummaryJDAlignmentTip = (
  summary: string,
  jdAnalysis?: ATSJobDescriptionAnalysis,
): string | undefined => {
  if (!jdAnalysis) return undefined;

  const jdKeywords = uniqueStrings([
    ...jdAnalysis.requiredSkills.map((requirement) => requirement.name),
    ...jdAnalysis.technologies.map((requirement) => requirement.name),
    ...jdAnalysis.domains.map((requirement) => requirement.name),
  ]);

  const missingFromSummary = jdKeywords.filter(
    (keyword) => !containsNormalizedPhrase(summary, keyword),
  );

  if (missingFromSummary.length === 0) return undefined;

  const highlighted = missingFromSummary.slice(0, 3).join(", ");
  return `To match this job description more closely, consider mentioning: ${highlighted}. This is optional — only add it if it's true for you.`;
};

/**
 * Summary gets its own small deterministic check — no AI call.
 * Flags a missing summary, an unusually short/long one, or one
 * that never mentions the target role.
 */
const buildSummaryDeepDive = (
  resume: ATSResume,
  jdAnalysis?: ATSJobDescriptionAnalysis,
): ATSSectionDeepDive => {
  const summary = cleanText(resume.summary);
  if (!summary) {
    return {
      sectionId: "summary",
      title: "Summary",
      percentage: 0,
      priority: "critical",
      isFullyOptimized: false,
      findings: [
        {
          id: "summary-missing",
          targetText: "",
          verdict: "needs-improvement",
          problems: ["Missing summary"],
          whyItMatters:
            "A summary gives recruiters a fast overview of who you are — without one, they have to piece it together from the rest of the resume.",
          suggestedFix:
            "Add a 2-3 sentence summary highlighting your role, core skills, and biggest strength.",
          needsQuantification: false,
          quantificationExamples: [],
        },
      ],
    };
  }

  const wordCount = summary.split(/\s+/).filter(Boolean).length;

  const problems: string[] = [];

  if (wordCount < 20) {
    problems.push("Too short");
  }

  if (wordCount > 80) {
    problems.push("Too long");
  }

  const targetRole = cleanText(resume.targetRole);

  if (
    targetRole &&
    !normalizeText(summary).includes(normalizeText(targetRole))
  ) {
    problems.push("Doesn't mention target role");
  }

  // NEW: flag generic summaries with no concrete evidence —
  // no metric/number AND no named skill/technology from the
  // resume's own skills section.
  const skillNamesInSummary = flattenStrings(
    (resume.skills ?? []).map((category) => category.skills ?? []),
  ).some((skill) => containsNormalizedPhrase(summary, skill));

  if (!containsMetric(summary) && !skillNamesInSummary) {
    problems.push(
      "Generic — no concrete skills or measurable experience mentioned",
    );
  }
  const jdAlignmentTip = buildSummaryJDAlignmentTip(summary, jdAnalysis);

  if (problems.length === 0) {
    return {
      sectionId: "summary",
      title: "Summary",
      percentage: 100,
      priority: "low",
      // Still "fully optimized" — a JD tip is a nudge, not a flaw.
      isFullyOptimized: true,
      findings: jdAlignmentTip
        ? [
            {
              id: "summary-0",
              targetText: summary,
              verdict: "excellent",
              problems: [],
              whyItMatters: "",
              suggestedFix: "",
              needsQuantification: false,
              quantificationExamples: [],
              jdAlignmentTip,
            },
          ]
        : [],
    };
  }

  const percentage = Math.max(40, 100 - problems.length * 20);

  return {
    sectionId: "summary",
    title: "Summary",
    percentage,
    priority: getATSSectionDeepDivePriority(
      getATSCategoryStatus(percentage),
      percentage,
    ),
    isFullyOptimized: false,
    findings: [
      {
        id: "summary-0",
        targetText: summary,
        verdict: "needs-improvement",
        problems,
        jdAlignmentTip,
        whyItMatters:
          "Your summary is often the first thing a recruiter reads — it should clearly position you for the role you're targeting.",
        suggestedFix: "",
        needsQuantification: false,
        quantificationExamples: [],
      },
    ],
  };
};

/**
 * Builds a deep-dive entry directly from an already-scored
 * ATSCategoryResult (contact, formatting, ...) — these already
 * carry percentage/status/issues/suggestions, so no new
 * computation is needed, just reshaping into ATSFinding form.
 */
const buildSectionFromCategory = (
  category: ATSCategoryResult | undefined,
  sectionId: ATSScoreCategory,
  title: string,
): ATSSectionDeepDive => {
  const issues = category?.issues ?? [];
  const suggestions = category?.suggestions ?? [];

  // A category can have zero "issues" (nothing hard-broken) while
  // still carrying "suggestions" for optional-but-scored items — e.g.
  // Contact has no *issue* for a missing LinkedIn/GitHub/Portfolio
  // link, only a suggestion, yet those are worth real points. Labelling
  // that "Fully Optimized" contradicted a percentage below 100 and
  // hid the very suggestions that would close the gap. Only call it
  // fully optimized when there's truly nothing left to flag or
  // suggest.
  if (issues.length === 0 && suggestions.length === 0) {
    const percentage = category?.percentage ?? 100;

    return {
      sectionId,
      title,
      percentage,
      priority: getATSSectionDeepDivePriority(
        category?.status ?? "excellent",
        percentage,
      ),
      isFullyOptimized: true,
      findings: [],
    };
  }

  const issueFindings: ATSFinding[] = issues.map((issue, index) => ({
    id: `${sectionId}-issue-${index}`,
    targetText: issue,
    verdict: "needs-improvement",
    problems: [issue],
    whyItMatters: issue,
    suggestedFix: suggestions[index] ?? suggestions[0] ?? "",
    needsQuantification: false,
    quantificationExamples: [],
  }));

  // Suggestions that don't correspond 1:1 to a hard issue (e.g.
  // optional fields) still deserve a visible finding, otherwise the
  // score reflects them but the deep dive stays silent about why.
  const extraSuggestions = suggestions.slice(issues.length);

  const suggestionFindings: ATSFinding[] = extraSuggestions.map(
    (suggestion, index) => ({
      id: `${sectionId}-suggestion-${index}`,
      targetText: suggestion,
      verdict: "needs-improvement",
      problems: ["Optional enhancement"],
      whyItMatters:
        "This is optional, but adding it strengthens your score and gives recruiters more ways to verify or reach you.",
      suggestedFix: suggestion,
      needsQuantification: false,
      quantificationExamples: [],
    }),
  );

  const findings = [...issueFindings, ...suggestionFindings];

  const percentage = category?.percentage ?? 100;

  return {
    sectionId,
    title,
    percentage,
    priority: getATSSectionDeepDivePriority(
      category?.status ?? getATSCategoryStatus(percentage),
      percentage,
    ),
    isFullyOptimized: false,
    findings,
  };
};

/**
 * "Section Completeness" scores whether important resume sections
 * exist/are filled in, but previously had no matching deep-dive
 * card — so a 67% score had nowhere to explain *which* sections to
 * add to close the gap. This builds one, naming the specific
 * missing/empty sections and what to do about each.
 */
const SECTION_TITLE_LABELS: Record<string, string> = {
  summary: "Summary",
  experience: "Experience",
  internships: "Internships",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  languages: "Languages",
  awards: "Awards",
  achievements: "Achievements",
  interests: "Interests",
  strengths: "Strengths",
};

const humanizeSectionName = (id: string): string =>
  SECTION_TITLE_LABELS[id] ??
  id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, " $1");

const buildSectionCompletenessDeepDive = (
  sectionAnalysis: ATSSectionAnalysis,
  categoryOverride?: ATSCategoryResult,
  experienceExpected = true,
): ATSSectionDeepDive => {
  const percentage = categoryOverride?.percentage ?? sectionAnalysis.score;

  // Important sections worth actively recommending if absent —
  // mirrors the weighting used when this category is scored. Skip
  // "experience" here when the JD doesn't actually call for it, so
  // this card doesn't tell a fresher to add something the role never
  // required.
  const highValueMissing = sectionAnalysis.missing.filter((section) => {
    if (section === "experience" && !experienceExpected) {
      return false;
    }
    return ["experience", "projects", "certifications", "languages", "awards"].includes(
      section,
    );
  });

  const findings: ATSFinding[] = [];

  highValueMissing.forEach((section, index) => {
    findings.push({
      id: `sections-missing-${index}`,
      targetText: humanizeSectionName(section),
      verdict: "needs-improvement",
      problems: ["Section missing"],
      whyItMatters: `A ${humanizeSectionName(
        section,
      )} section is one recruiters and ATS parsers commonly look for — leaving it out can cost you points and context.`,
      suggestedFix: `Add a ${humanizeSectionName(section)} section${
        section === "experience"
          ? " with your relevant work or internship history."
          : section === "projects"
            ? " showcasing 2-3 relevant projects."
            : "."
      }`,
      needsQuantification: false,
      quantificationExamples: [],
    });
  });

  sectionAnalysis.empty.forEach((section, index) => {
    findings.push({
      id: `sections-empty-${index}`,
      targetText: humanizeSectionName(section),
      verdict: "needs-improvement",
      problems: ["Section present but empty"],
      whyItMatters: `Your resume includes a ${humanizeSectionName(
        section,
      )} section, but it has no content — an empty section signals incompleteness to both recruiters and ATS parsers.`,
      suggestedFix: `Fill in your ${humanizeSectionName(section)} section, or remove it if it doesn't apply.`,
      needsQuantification: false,
      quantificationExamples: [],
    });
  });

  // Lower-priority missing sections (interests, strengths, ...) still
  // get a lightweight mention via the category's own suggestions,
  // covering anything not already called out above.
  const alreadyCovered = new Set([
    ...highValueMissing,
    ...sectionAnalysis.empty,
  ]);

  const remainingSuggestions = (categoryOverride?.suggestions ?? []).filter(
    (suggestion) =>
      !findings.some((finding) => suggestion.includes(finding.targetText)),
  );

  remainingSuggestions.forEach((suggestion, index) => {
    // Avoid duplicating a suggestion that's just a generic restatement
    // of something we already built a targeted finding for.
    if ([...alreadyCovered].some((section) => suggestion.toLowerCase().includes(section))) {
      return;
    }

    findings.push({
      id: `sections-suggestion-${index}`,
      targetText: suggestion,
      verdict: "needs-improvement",
      problems: ["Optional enhancement"],
      whyItMatters:
        "Rounding out your section coverage helps both recruiters and ATS parsers get a complete picture of your background.",
      suggestedFix: suggestion,
      needsQuantification: false,
      quantificationExamples: [],
    });
  });

  if (findings.length === 0) {
    return {
      sectionId: "sections",
      title: "Section Completeness",
      percentage,
      priority: getATSSectionDeepDivePriority(
        categoryOverride?.status ?? getATSCategoryStatus(percentage),
        percentage,
      ),
      isFullyOptimized: true,
      findings: [],
    };
  }

  return {
    sectionId: "sections",
    title: "Section Completeness",
    percentage,
    priority: getATSSectionDeepDivePriority(
      categoryOverride?.status ?? getATSCategoryStatus(percentage),
      percentage,
    ),
    isFullyOptimized: false,
    findings,
  };
};

/**
 * Assembles the deterministic (pre-AI) section deep dive. Every
 * resume section gets an entry — summary, contact, skills,
 * experience, projects, education, formatting, achievements —
 * with isFullyOptimized: true and empty findings when there's
 * nothing to flag, rather than being silently omitted.
 *
 * Priority/percentage for the 8 scored categories (contact,
 * experience, formatting, ...) come straight from
 * ATS_SCORE_CATEGORIES, so the deep dive stays consistent with
 * the score breakdown shown elsewhere. Sections with no dedicated
 * score (projects, education, achievements) derive a simple
 * estimate instead. Skills (only populated when a JD was
 * provided) reuses jdAnalysis directly.
 *
 * The returned array is always sorted critical -> high -> medium
 * -> low, so the frontend can render it as-is.
 */

/**
 * Checks whether a section type actually exists and is enabled
 * on this resume — used to decide whether the section deep dive
 * should show a card for it at all.
 */
const isSectionEnabled = (resume: ATSResume, type: string): boolean => {
  const sections = resume.sections ?? [];

  return sections.some(
    (section) =>
      section.enabled !== false &&
      normalizeText(section.type || section.id || "") === normalizeText(type),
  );
};

export const buildDeterministicSectionDeepDive = (
  resume: ATSResume,
  ruleAnalysis: ATSRuleAnalysis,
  jdAnalysis?: ATSJobDescriptionAnalysis,
  jobDescription?: string,
): ATSSectionDeepDive[] => {
  const { categories } = ruleAnalysis;

  const findCategory = (id: string) =>
    categories.find((category) => category.category === id);

  const sections: ATSSectionDeepDive[] = [];

  // --- Summary: only if a summary section actually exists ---
  if (
    isSectionEnabled(resume, "summary") &&
    Boolean(cleanText(resume.summary))
  ) {
    sections.push(buildSummaryDeepDive(resume, jdAnalysis));
  }

  // --- Contact & Formatting: intrinsic to every resume, always shown ---
  sections.push(
    buildSectionFromCategory(findCategory("contact"), "contact", "Contact"),
  );

  sections.push(
    buildSectionFromCategory(
      findCategory("formatting"),
      "formatting",
      "Formatting",
    ),
  );

  // --- Section Completeness: intrinsic, always shown ---
  sections.push(
    buildSectionCompletenessDeepDive(
      ruleAnalysis.sections,
      findCategory("sections"),
      isExperienceExpectedFromJD(jobDescription),
    ),
  );

  // --- Education: only if an education section actually exists ---
  if (
    isSectionEnabled(resume, "education") &&
    (resume.education ?? []).length > 0
  ) {
    sections.push(
      buildSectionFromIssues("education", "Education", ruleAnalysis.education),
    );
  }

  // --- Achievements: only if an achievements section actually exists ---
  if (
    isSectionEnabled(resume, "achievements") &&
    (resume.achievements ?? []).length > 0
  ) {
    sections.push(
      buildSectionFromIssues(
        "achievements",
        "Achievements",
        ruleAnalysis.achievements,
      ),
    );
  }
  // --- Experience: itemized, per-bullet findings ---
  const buildFromFindings = (
    sectionId: ATSScoreCategory,
    title: string,
    findings: ATSFinding[],
    categoryOverride?: ATSCategoryResult,
  ): ATSSectionDeepDive => {
    if (findings.length === 0) {
      const percentage = categoryOverride?.percentage ?? 100;

      return {
        sectionId,
        title,
        percentage,
        priority: getATSSectionDeepDivePriority(
          categoryOverride?.status ?? "excellent",
          percentage,
        ),
        isFullyOptimized: true,
        findings: [],
      };
    }

    const excellentCount = findings.filter(
      (finding) => finding.verdict === "excellent",
    ).length;

    const percentage =
      categoryOverride?.percentage ??
      Number(((excellentCount / findings.length) * 100).toFixed(1));

    const status: ATSCategoryStatus =
      categoryOverride?.status ?? getATSCategoryStatus(percentage);

    return {
      sectionId,
      title,
      percentage,
      priority: getATSSectionDeepDivePriority(status, percentage),
      isFullyOptimized: excellentCount === findings.length,
      findings,
    };
  };

  // --- Experience: only if an experience (or internship) section exists ---
  if (
    (isSectionEnabled(resume, "experience") ||
      isSectionEnabled(resume, "internships")) &&
    (resume.experience ?? []).length > 0
  ) {
    sections.push(
      buildFromFindings(
        "experience",
        "Experience",
        buildExperienceFindings(resume),
        findCategory("experience"),
      ),
    );
  }

  // --- Projects: only if a projects section actually exists ---

  if (
    isSectionEnabled(resume, "projects") &&
    (resume.projects ?? []).length > 0
  ) {
    sections.push(
      buildFromFindings("projects", "Projects", buildProjectFindings(resume)),
    );
  }

  // --- Skills: only if a skills section actually exists ---
  if (isSectionEnabled(resume, "skills")) {
    const skillsSection = buildSkillsDeepDiveFromJD(jdAnalysis);
    sections.push(
      skillsSection ?? {
        sectionId: "skills",
        title: "Skills",
        percentage: 100,
        priority: "low",
        isFullyOptimized: true,
        findings: [],
      },
    );
  }

  const priorityOrder: Record<ATSSectionDeepDivePriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...sections].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );
};

const enrichSectionFindingsWithAI = async (
  title: string,
  findings: ATSFinding[],
): Promise<ATSFinding[]> => {
  const flagged = findings.filter(
    (finding) => finding.verdict === "needs-improvement",
  );

  if (flagged.length === 0) {
    return findings;
  }

  const bulletList = flagged
    .map(
      (finding) =>
        `- id: ${finding.id}\n  text: "${finding.targetText}"\n  problems: ${finding.problems.join(", ")}`,
    )
    .join("\n");

  const prompt = `
You are helping a candidate improve the "${title}" section of their resume
for ATS scanning and recruiter readability.

Each bullet below already has problem tags detected by rule-based analysis.
For every bullet, produce:

1. "whyItMatters" — one short, plain-language sentence explaining why these
   specific problems hurt the bullet, from a recruiter's point of view.

2. "suggestedFix" — a rewritten version of the bullet that fixes wording
   issues (weak action verb, repeated action verb, too generic) using ONLY
   information already present in the original bullet. Do NOT add numbers,
   tools, outcomes, or scope that are not already stated. If "No measurable
   impact" is the ONLY problem listed for a bullet (no other problem tags),
   leave "suggestedFix" as an empty string — the wording itself is fine and
   only quantificationExamples should be filled in for that bullet.

3. "quantificationExamples" — ONLY when "No measurable impact" is one of
   the listed problems for that bullet: give 2-3 short, clearly generic
   example phrasings showing the TYPE of metric that would strengthen a
   bullet like this (e.g. users served, performance improvement, time
   saved, team size, revenue, number of items shipped). These are
   illustrative templates only — never present them as facts about this
   candidate. If "No measurable impact" is not listed for a bullet, return
   an empty array for it.

BULLETS TO REVIEW:
${bulletList}

Return ONLY valid JSON. No markdown. No text outside the JSON. Use exactly
this structure:

{
  "findings": [
    {
      "id": "",
      "whyItMatters": "",
      "suggestedFix": "",
      "quantificationExamples": [""]
    }
  ]
}

Rules:
- "id" must exactly match one of the ids given above.
- Include every bullet from the list exactly once.
- Never fabricate facts, numbers, tools, or outcomes not present in the
  original bullet text.
`;

  let aiResult: {
    findings?: Array<{
      id: string;
      whyItMatters?: string;
      suggestedFix?: string;
      quantificationExamples?: string[];
    }>;
  };

  try {
    aiResult = await generateJSON(prompt);
  } catch (error) {
    // Fail safe: keep the deterministic findings (problems still
    // show, just without the AI-written explanation/rewrite).
    return findings;
  }

  if (!aiResult || !Array.isArray(aiResult.findings)) {
    return findings;
  }

  const aiById = new Map(aiResult.findings.map((item) => [item.id, item]));

  return findings.map((finding) => {
    if (finding.verdict !== "needs-improvement") {
      return finding;
    }

    const aiFinding = aiById.get(finding.id);

    if (!aiFinding) {
      return finding;
    }

    return {
      ...finding,

      whyItMatters: aiFinding.whyItMatters || finding.whyItMatters,

      suggestedFix: aiFinding.suggestedFix ?? finding.suggestedFix,

      quantificationExamples: finding.needsQuantification
        ? (aiFinding.quantificationExamples ?? finding.quantificationExamples)
        : [],
    };
  });
};

const buildResumeContextForSummary = (resume: ATSResume): string => {
  const skills = (resume.skills ?? [])
    .flatMap((category) => category.skills ?? [])
    .filter(Boolean)
    .join(", ");

  const experienceLines = (resume.experience ?? [])
    .map((exp) => {
      const bullets = [
        ...(exp.responsibilities ?? []),
        ...(exp.achievements ?? []),
      ].join(" ");

      return `${cleanText(exp.position)} at ${cleanText(exp.company)}: ${bullets}`;
    })
    .join("\n");

  const projectLines = (resume.projects ?? [])
    .map((proj) => {
      const tech = (proj.technologies ?? []).join(", ");
      return `${cleanText(proj.title)} (${tech}): ${cleanText(proj.description)}`;
    })
    .join("\n");

  return `SKILLS: ${skills}\n\nEXPERIENCE:\n${experienceLines}\n\nPROJECTS:\n${projectLines}`;
};

const enrichSummaryWithAI = async (
  resume: ATSResume,
  targetRole: string,
  jobDescription: string | undefined,
  section: ATSSectionDeepDive,
): Promise<ATSSectionDeepDive> => {
  const finding = section.findings[0];

  if (!finding) {
    return section;
  }

  const resumeContext = buildResumeContextForSummary(resume);

  const prompt = `
You are a professional resume writer. Rewrite this candidate's resume
summary so it is tailored to the target role and (if provided) the job
description below.

CURRENT SUMMARY:
"${finding.targetText || "(missing)"}"

TARGET ROLE: ${targetRole}

${jobDescription ? `JOB DESCRIPTION:\n${jobDescription}` : ""}

CANDIDATE'S ACTUAL BACKGROUND (use ONLY facts from here — never invent
skills, technologies, years of experience, or achievements not present
below):
${resumeContext}

Write a 2-3 sentence professional summary that:
- Leads with the target role and years of experience, if stated in the background.
- Highlights 2-4 of the candidate's most relevant skills/technologies that also
  appear in the job description, ONLY if they are genuinely present in the
  candidate's background above.
- Mentions one concrete piece of real experience or project work from the
  background, if available.
- Uses natural, confident, non-generic language.
- Does NOT fabricate any skill, number, or outcome not present above.

Return ONLY valid JSON, no markdown, no extra text:
{ "summary": "" }
`;

  try {
    const result = await generateJSON<{ summary?: string }>(prompt);

    if (result?.summary) {
      return {
        ...section,
        findings: [{ ...finding, suggestedFix: result.summary }],
      };
    }
  } catch (error) {
    // Fail safe: keep the deterministic finding, no AI rewrite.
  }

  return section;
};

// ============================================================
// EDUCATION ANALYSIS
// ============================================================

export const enrichSectionDeepDiveWithAI = async (
  sections: ATSSectionDeepDive[],
  resume: ATSResume,
  targetRole: string,
  jobDescription?: string,
): Promise<ATSSectionDeepDive[]> => {
  const enriched: ATSSectionDeepDive[] = [];

  for (const section of sections) {
    if (section.isFullyOptimized || section.sectionId === "skills") {
      enriched.push(section);
      continue;
    }

    if (section.sectionId === "summary") {
      enriched.push(
        await enrichSummaryWithAI(resume, targetRole, jobDescription, section),
      );
      continue;
    }

    const findings = await enrichSectionFindingsWithAI(
      section.title,
      section.findings,
    );

    enriched.push({ ...section, findings });
  }

  return enriched;
};

export const analyzeEducation = (resume: ATSResume): ATSEducationAnalysis => {
  const education = resume.education ?? [];

  const completeEntries = education.filter(
    (entry) =>
      Boolean(cleanText(entry.institution)) &&
      Boolean(cleanText(entry.degree)) &&
      Boolean(cleanText(entry.fieldOfStudy)),
  ).length;

  const incompleteEntries = education.length - completeEntries;

  const hasDegree = education.some((entry) => Boolean(cleanText(entry.degree)));

  const hasInstitution = education.some((entry) =>
    Boolean(cleanText(entry.institution)),
  );

  const hasFieldOfStudy = education.some((entry) =>
    Boolean(cleanText(entry.fieldOfStudy)),
  );

  const hasDates = education.some(
    (entry) => Boolean(entry.startYear) || Boolean(entry.endYear),
  );

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (education.length === 0) {
    issues.push("No education section was found.");
    suggestions.push("Add education details when relevant to the role.");
  }

  if (incompleteEntries > 0) {
    issues.push("Some education entries are incomplete.");
  }

  return {
    educationCount: education.length,

    completeEntries,

    incompleteEntries,

    hasDegree,

    hasInstitution,

    hasFieldOfStudy,

    hasDates,

    score: 0,

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

export const analyzeDateConsistency = (
  resume: ATSResume,
): ATSDateConsistencyAnalysis => {
  const invalidDates: string[] = [];
  const overlappingDates: string[] = [];
  const reversedDateRanges: string[] = [];
  const inconsistentDateFormats: string[] = [];
  const missingDates: string[] = [];

  const issues: string[] = [];
  const suggestions: string[] = [];

  type DateEntry = {
    label: string;
    type: "experience" | "internship" | "education";
    startDate?: string;
    endDate?: string;
    currentlyActive: boolean;
  };

  const entries: DateEntry[] = [];

  (resume.experience ?? []).forEach((entry, index) => {
    const label =
      cleanText(entry.position) ||
      cleanText(entry.company) ||
      `Experience ${index + 1}`;

    entries.push({
      label,
      type: "experience", // <-- ADD
      startDate: cleanText(entry.startDate),
      endDate: cleanText(entry.endDate),
      currentlyActive: entry.currentlyWorking === true,
    });
  });

  (resume.internships ?? []).forEach((entry, index) => {
    const label =
      cleanText(entry.role) ||
      cleanText(entry.company) ||
      `Internship ${index + 1}`;

    entries.push({
      label,
      type: "internship", // <-- ADD
      startDate: cleanText(entry.startDate),
      endDate: cleanText(entry.endDate),
      currentlyActive: entry.currentlyInterning === true,
    });
  });

  (resume.education ?? []).forEach((entry, index) => {
    const label =
      cleanText(entry.degree) ||
      cleanText(entry.institution) ||
      `Education ${index + 1}`;

    entries.push({
      label,
      type: "education", // <-- ADD
      startDate: entry.startYear ? String(entry.startYear) : undefined,
      endDate: entry.endYear ? String(entry.endYear) : undefined,
      currentlyActive: false,
    });
  });

  // ------------------------------------------------------------
  // DATE PARSER
  // ------------------------------------------------------------

  const parseDate = (value?: string): Date | null => {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toLowerCase();

    if (
      normalized === "present" ||
      normalized === "current" ||
      normalized === "now"
    ) {
      return new Date();
    }

    // YYYY
    if (/^\d{4}$/.test(normalized)) {
      const year = Number(normalized);

      if (year >= 1900 && year <= 2100) {
        return new Date(year, 0, 1);
      }

      return null;
    }

    // YYYY-MM
    if (/^\d{4}-\d{1,2}$/.test(normalized)) {
      const [yearString, monthString] = normalized.split("-");

      const year = Number(yearString);

      const month = Number(monthString);

      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1);
      }

      return null;
    }

    // MM/YYYY
    if (/^\d{1,2}\/\d{4}$/.test(normalized)) {
      const [monthString, yearString] = normalized.split("/");

      const month = Number(monthString);

      const year = Number(yearString);

      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
        return new Date(year, month - 1, 1);
      }

      return null;
    }

    // Month YYYY
    const monthYearMatch = normalized.match(
      /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})$/,
    );

    if (monthYearMatch) {
      const months: Record<string, number> = {
        january: 0,
        february: 1,
        march: 2,
        april: 3,
        may: 4,
        june: 5,
        july: 6,
        august: 7,
        september: 8,
        october: 9,
        november: 10,
        december: 11,
      };

      const month = months[monthYearMatch[1]];

      const year = Number(monthYearMatch[2]);

      return new Date(year, month, 1);
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  };

  // ------------------------------------------------------------
  // DATE FORMAT DETECTION
  // ------------------------------------------------------------

  const getDateFormat = (value: string): string => {
    const normalized = value.trim().toLowerCase();

    if (/^\d{4}$/.test(normalized)) {
      return "YYYY";
    }

    if (/^\d{4}-\d{1,2}$/.test(normalized)) {
      return "YYYY-MM";
    }

    if (/^\d{1,2}\/\d{4}$/.test(normalized)) {
      return "MM/YYYY";
    }

    if (/^[a-z]+\s+\d{4}$/i.test(normalized)) {
      return "Month YYYY";
    }

    if (
      normalized === "present" ||
      normalized === "current" ||
      normalized === "now"
    ) {
      return "CURRENT";
    }

    return "OTHER";
  };

  // ------------------------------------------------------------
  // VALIDATE INDIVIDUAL ENTRIES
  // ------------------------------------------------------------

  for (const entry of entries) {
    const { label, startDate, endDate, currentlyActive } = entry;

    if (!startDate && !endDate) {
      missingDates.push(`${label}: missing start and end dates.`);

      continue;
    }

    if (!startDate) {
      missingDates.push(`${label}: missing start date.`);
    }

    if (!endDate && !currentlyActive) {
      missingDates.push(`${label}: missing end date.`);
    }

    if (startDate) {
      const parsedStart = parseDate(startDate);

      if (!parsedStart) {
        invalidDates.push(`${label}: invalid start date "${startDate}".`);
      } else if (parsedStart > new Date()) {
        invalidDates.push(
          `${label}: start date "${startDate}" is in the future.`,
        );
      }
    }

    if (endDate && endDate.trim().toLowerCase() !== "present") {
      const parsedEnd = parseDate(endDate);

      if (!parsedEnd) {
        invalidDates.push(`${label}: invalid end date "${endDate}".`);
      } else if (parsedEnd > new Date()) {
        invalidDates.push(`${label}: end date "${endDate}" is in the future.`);
      }
    }

    // ----------------------------------------------------------
    // REVERSED DATE RANGE
    // ----------------------------------------------------------

    if (startDate && endDate) {
      const parsedStart = parseDate(startDate);

      const parsedEnd = parseDate(endDate);

      const normalizedEnd = endDate.trim().toLowerCase();

      if (
        parsedStart &&
        parsedEnd &&
        normalizedEnd !== "present" &&
        parsedEnd < parsedStart
      ) {
        reversedDateRanges.push(
          `${label}: end date "${endDate}" is before start date "${startDate}".`,
        );
      }
    }

    // ----------------------------------------------------------
    // DATE FORMAT
    // ----------------------------------------------------------

    const formats = [startDate, endDate]
      .filter((value): value is string => Boolean(value))
      .map(getDateFormat)
      .filter((format) => format !== "CURRENT");

    if (formats.length > 1) {
      const uniqueFormats = uniqueStrings(formats);

      if (uniqueFormats.length > 1) {
        inconsistentDateFormats.push(
          `${label}: inconsistent date formats used (${uniqueFormats.join(
            ", ",
          )}).`,
        );
      }
    }
  }

  // ------------------------------------------------------------
  // OVERLAPPING ACTIVE/PERIODS
  // ------------------------------------------------------------

  const datedEntries = entries
    .map((entry) => {
      const start = entry.startDate ? parseDate(entry.startDate) : null;

      const end = entry.endDate
        ? parseDate(entry.endDate)
        : entry.currentlyActive
          ? new Date()
          : null;

      return {
        ...entry,
        start,
        end,
      };
    })
    .filter(
      (
        entry,
      ): entry is typeof entry & {
        start: Date;
        end: Date;
      } => Boolean(entry.start && entry.end),
    );

  for (let i = 0; i < datedEntries.length; i++) {
    for (let j = i + 1; j < datedEntries.length; j++) {
      const first = datedEntries[i];

      const second = datedEntries[j];

      if (first.start <= second.end && second.start <= first.end) {
        const isEducationPairedWithWork =
          (first.type === "education" &&
            (second.type === "experience" || second.type === "internship")) ||
          (second.type === "education" &&
            (first.type === "experience" || first.type === "internship"));

        if (isEducationPairedWithWork) {
          // Normal — working or interning during a degree is expected.
          // Skip entirely; don't treat it as an issue.
          continue;
        }

        overlappingDates.push(`${first.label} overlaps with ${second.label}.`);
      }
    }
  }

  // ------------------------------------------------------------
  // ISSUES
  // ------------------------------------------------------------

  if (invalidDates.length > 0) {
    issues.push("Invalid or future dates were detected.");

    suggestions.push(
      "Correct invalid or future dates before submitting the resume.",
    );
  }

  if (reversedDateRanges.length > 0) {
    issues.push("Some date ranges are reversed.");

    suggestions.push("Ensure every end date is on or after its start date.");
  }

  if (overlappingDates.length > 0) {
    issues.push("Overlapping experience or internship dates were detected.");

    suggestions.push(
      "Review overlapping roles and make the timeline clear and accurate.",
    );
  }

  if (inconsistentDateFormats.length > 0) {
    issues.push("Inconsistent date formats were detected.");

    suggestions.push("Use one consistent date format throughout the resume.");
  }

  if (missingDates.length > 0) {
    issues.push("Some experience or internship entries have incomplete dates.");

    suggestions.push("Add accurate start and end dates where available.");
  }

  // ------------------------------------------------------------
  // SCORE
  // ------------------------------------------------------------

  // ------------------------------------------------------------
  // SCORE
  // ------------------------------------------------------------

  // Overlaps are checked pairwise across entries (every entry
  // compared against every other), not per-entry like the other
  // four checks — so the denominator needs its own term for the
  // number of possible pairs, or a resume with many entries would
  // be penalized less per-overlap than one with few.
  const possiblePairs = (entries.length * (entries.length - 1)) / 2;

  const totalChecks = entries.length * 3 + possiblePairs;

  const issueCount =
    invalidDates.length +
    reversedDateRanges.length +
    inconsistentDateFormats.length +
    missingDates.length +
    overlappingDates.length;

  let score = 10;

  if (totalChecks > 0) {
    const penalty = Math.min(10, (issueCount / totalChecks) * 10);

    score = 10 - penalty;
  }

  return {
    invalidDates: uniqueStrings(invalidDates),

    overlappingDates: uniqueStrings(overlappingDates),

    reversedDateRanges: uniqueStrings(reversedDateRanges),

    inconsistentDateFormats: uniqueStrings(inconsistentDateFormats),

    missingDates: uniqueStrings(missingDates),

    score: Number(Math.max(0, Math.min(10, score)).toFixed(2)),

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// FORMATTING ANALYSIS
// ============================================================

export const analyzeFormatting = (resume: ATSResume): ATSFormattingAnalysis => {
  const sections = resume.sections ?? [];

  const hasContactInfo = Boolean(resume.personalInfo);

  const hasStandardSections = sections.some((section) => {
    const sectionName = normalizeText(section.type ?? section.id ?? "");

    return ATS_STANDARD_SECTIONS.some(
      (standardSection) => normalizeText(standardSection) === sectionName,
    );
  });

  // const hasUnusualSectionNames = sections.some((section) => {
  //   const type = normalizeText(section.type ?? section.id ?? "");

  //   return (
  //     Boolean(type) &&
  //     !ATS_STANDARD_SECTIONS.some(
  //       (standard) => normalizeText(standard) === type,
  //     ) &&
  //     type !== "personalinfo" &&
  //     type !== "custom"
  //   );
  // });

  const hasUnusualSectionNames = sections.some((section) => {
    if (section.enabled === false) return false; // <-- ADD this line

    const type = normalizeText(section.type ?? section.id ?? "");

    return (
      Boolean(type) &&
      !ATS_STANDARD_SECTIONS.some(
        (standard) => normalizeText(standard) === type,
      ) &&
      type !== "personalinfo" &&
      type !== "custom"
    );
  });

  const hasEmptySections = sections.some(
    (section) => section.enabled !== false && !section.type && !section.id,
  );

  const hasExcessiveLinks =
    [
      resume.personalInfo?.linkedIn,
      resume.personalInfo?.github,
      resume.personalInfo?.portfolio,
      ...(resume.projects ?? []).flatMap((project) => [
        project.github,
        project.link,
      ]),
    ].filter(Boolean).length > 10;

  const allText = JSON.stringify(resume);

  const suspiciousCharacters = /[�]/.test(allText);

  const hasPotentialParserIssues =
    suspiciousCharacters || hasUnusualSectionNames;

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (hasUnusualSectionNames) {
    issues.push(
      "Some non-standard section names may reduce parser consistency.",
    );

    suggestions.push("Prefer conventional section headings where possible.");
  }

  if (hasExcessiveLinks) {
    issues.push("An unusually high number of links was detected.");

    suggestions.push("Keep only relevant professional links.");
  }

  if (suspiciousCharacters) {
    issues.push("Suspicious replacement characters were detected.");

    suggestions.push("Remove corrupted or unsupported characters.");
  }

  let score = getCategoryMaxScore("formatting");

  if (hasUnusualSectionNames) {
    score -= 3;
  }

  if (hasExcessiveLinks) {
    score -= 2;
  }

  if (suspiciousCharacters) {
    score -= 3;
  }

  return {
    hasContactInfo,

    hasStandardSections,

    hasUnusualSectionNames,

    hasEmptySections,

    hasExcessiveLinks,

    hasSuspiciousCharacters: suspiciousCharacters,

    hasPotentialParserIssues,

    hasPotentialColumnRisk: false,

    hasPotentialTableRisk: false,

    score: clampATSScore(score, 0, getCategoryMaxScore("formatting")),

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// CATEGORY RESULT BUILDING
// ============================================================

const buildCategoryResults = (analysis: {
  contact: ATSContactAnalysis;
  sections: ATSSectionAnalysis;
  skills: ATSSkillsAnalysis;
  keywords: ATSKeywordAnalysis;
  experience: ATSExperienceAnalysis;
  actionVerbs: ATSActionVerbAnalysis;
  quantifiedResults: ATSQuantifiedResultAnalysis;
  formatting: ATSFormattingAnalysis;
  dateConsistency: ATSDateConsistencyAnalysis;
}): ATSCategoryResult[] => {
  return [
    makeCategoryResult(
      "contact",
      analysis.contact.score,
      "Evaluates essential professional contact information.",
      analysis.contact.issues,
      analysis.contact.suggestions,
    ),

    makeCategoryResult(
      "sections",
      analysis.sections.score,
      "Evaluates the completeness and organization of important resume sections.",
      analysis.sections.issues,
      analysis.sections.suggestions,
    ),

    makeCategoryResult(
      "skills",
      analysis.skills.score,
      "Evaluates the breadth and organization of listed skills.",
      analysis.skills.issues,
      analysis.skills.suggestions,
    ),

    makeCategoryResult(
      "keywords",
      analysis.keywords.score,
      "Evaluates keyword coverage and relevance.",
      analysis.keywords.issues,
      analysis.keywords.suggestions,
    ),

    makeCategoryResult(
      "experience",
      analysis.experience.score,
      "Evaluates experience content and achievement quality.",
      analysis.experience.issues,
      analysis.experience.suggestions,
    ),

    makeCategoryResult(
      "actionVerbs",
      analysis.actionVerbs.score,
      "Evaluates strong and varied action verbs.",
      analysis.actionVerbs.issues,
      analysis.actionVerbs.suggestions,
    ),

    makeCategoryResult(
      "quantifiedResults",
      analysis.quantifiedResults.score,
      "Evaluates measurable professional impact.",
      analysis.quantifiedResults.issues,
      analysis.quantifiedResults.suggestions,
    ),

    makeCategoryResult(
      "formatting",
      analysis.formatting.score,
      "Evaluates potential ATS parsing and formatting risks.",
      analysis.formatting.issues,
      analysis.formatting.suggestions,
    ),

    makeCategoryResult(
      "dateConsistency",
      analysis.dateConsistency.score,
      "Evaluates whether work, internship and education dates are valid, non-overlapping and consistently formatted.",
      analysis.dateConsistency.issues,
      analysis.dateConsistency.suggestions,
    ),
  ].filter((result) => {
    const category = getCategory(result.category);

    return category?.enabled === true;
  });
};

// ============================================================
// GENERIC SCORE CALCULATION
// ============================================================

export const calculateOverallScore = (categories: ATSCategoryResult[]): number => {
  const totalMax = categories.reduce(
    (sum, category) => sum + category.maxScore,
    0,
  );

  const totalScore = categories.reduce(
    (sum, category) => sum + category.score,
    0,
  );

  if (totalMax <= 0) {
    return 0;
  }

  return Number(((totalScore / totalMax) * 100).toFixed(2));
};

// ============================================================
// RECOMMENDATIONS
// ============================================================

const buildRecommendations = (
  categories: ATSCategoryResult[],
): ATSRecommendation[] => {
  const recommendations: ATSRecommendation[] = [];

  for (const category of categories) {
    if (category.status === "excellent") {
      continue;
    }

    const priority =
      category.percentage < 40
        ? "high"
        : category.percentage < 60
          ? "medium"
          : "low";

    for (const issue of category.issues) {
      recommendations.push({
        title: `${category.title} needs improvement`,

        description: issue,

        priority,

        category: category.category,

        impact: Number(
          Math.max(0, category.maxScore - category.score).toFixed(2),
        ),

        actionable: true,

        suggestedFix: category.suggestions[0],
      });
    }
  }

  return recommendations.slice(0, 10);
};

// ============================================================
// STRENGTHS
// ============================================================

export const buildStrengths = (categories: ATSCategoryResult[]): string[] => {
  // return categories
  //   .filter(
  //     (category) =>
  //       category.status === "excellent" || category.status === "good",
  //   )
  //   .map((category) => `${category.title}: ${category.summary}`)
  //   .slice(0, 8);

  return categories
    .filter((c) => c.status === "excellent" || c.status === "good")
    .filter((c) => c.issues.length === 0) // only truly clean categories
    .map((c) => `Strong ${c.title.toLowerCase()} (${c.percentage}%).`)
    .slice(0, 5);
};

// ============================================================
// WEAKNESSES
// ============================================================

export const buildWeaknesses = (categories: ATSCategoryResult[]): string[] => {
  // return categories
  //   .filter(
  //     (category) =>
  //       category.status === "poor" || category.status === "needs-improvement",
  //   )
  //   .flatMap((category) =>
  //     category.issues.map((issue) => `${category.title}: ${issue}`),
  //   )
  //   .slice(0, 10);

  return categories
    .filter((c) => c.status === "poor" || c.status === "needs-improvement")
    .filter((c) => c.issues.length > 0)
    .map((c) => `${c.title}: ${c.issues.join("; ")}`)
    .slice(0, 8);
};

// ============================================================
// MAIN ATS SCORER
// ============================================================

/**
 * Main rule-based ATS analysis.
 *
 * IMPORTANT:
 *
 * This function does NOT call Gemini.
 * It does NOT access MongoDB.
 * It does NOT modify the resume.
 *
 * It only performs deterministic analysis.
 */
export const analyzeResumeATS = (
  resume: ATSResume,
  jobDescription?: string,
): ATSRuleAnalysis => {
  const contact = analyzeContact(resume);

  const sections = analyzeSections(resume, jobDescription);

  const skills = analyzeSkills(resume);

  /**
   * General ATS v1 does not have a JD yet.
   *
   * Keyword analysis therefore uses resume-internal
   * terminology for now.
   *
   * JD-specific keyword matching will be implemented
   * separately in the Job Matcher layer.
   */
  const keywordAnalysis = analyzeResumeKeywords(resume, jobDescription);

  const experience = analyzeExperience(resume);

  const actionVerbs = analyzeActionVerbs(resume);

  const quantifiedResults = analyzeQuantifiedResults(resume);

  const achievements = analyzeAchievements(resume);

  const projects = analyzeProjects(resume);

  const education = analyzeEducation(resume);

  const dateConsistency = analyzeDateConsistency(resume);

  const formatting = analyzeFormatting(resume);

  /**
   * Optional detailed analyses are calculated here,
   * but they are not yet independent scoring categories.
   *
   * We will add their category configuration only when
   * we intentionally expand the scoring model.
   */

  const categories = buildCategoryResults({
    contact,
    sections,
    skills,
    keywords: keywordAnalysis,
    experience,
    actionVerbs,
    quantifiedResults,
    formatting,
    dateConsistency,
  });

  const overallScore = calculateOverallScore(categories);

  const recommendations = buildRecommendations(categories);

  const strengths = buildStrengths(categories);

  const weaknesses = buildWeaknesses(categories);

  const breakdown: ATSBreakdown = {};

  for (const category of categories) {
    breakdown[category.category] = category.score;
  }

  return {
    overallScore,

    breakdown,

    categories,

    contact,

    sections,

    skills,

    keywords: keywordAnalysis,

    experience,

    actionVerbs,

    quantifiedResults,

    achievements,

    projects,

    education,

    dateConsistency,

    formatting,

    strengths,

    weaknesses,

    recommendations,
  };
};

// ============================================================
// JD REQUIREMENT MATCHING ENGINE
// ============================================================

const getResumeEvidenceSources = (
  resume: ATSResume,
): Array<{
  section: string;
  text: string;
}> => {
  const sources: Array<{
    section: string;
    text: string;
  }> = [];

  if (resume.summary) {
    sources.push({
      section: "summary",
      text: resume.summary,
    });
  }

  for (const skillGroup of resume.skills ?? []) {
    for (const skill of skillGroup.skills ?? []) {
      sources.push({
        section: "skills",
        text: skill,
      });
    }
  }

  for (const experience of resume.experience ?? []) {
    for (const bullet of [
      ...(experience.responsibilities ?? []),
      ...(experience.achievements ?? []),
    ]) {
      sources.push({
        section: "experience",
        text: bullet,
      });
    }
  }

  for (const internship of resume.internships ?? []) {
    for (const bullet of [
      ...(internship.responsibilities ?? []),
      ...(internship.achievements ?? []),
    ]) {
      sources.push({
        section: "internship",
        text: bullet,
      });
    }
  }

  for (const project of resume.projects ?? []) {
    const projectDescriptionText = getProjectDescriptionText(project);

    if (projectDescriptionText) {
      sources.push({
        section: "projects",
        text: projectDescriptionText,
      });
    }

    for (const technology of project.technologies ?? []) {
      sources.push({
        section: "projects",
        text: technology,
      });
    }
  }

  return sources;
};

const normalizeRequirementForMatch = (value: string): string => {
  return normalizeText(value)
    .replace(/\bnode\s*\.\s*js\b/g, "node.js")
    .replace(/\bnodejs\b/g, "node.js")
    .replace(/\bnode\s+js\b/g, "node.js")

    .replace(/\bexpress\s*\.\s*js\b/g, "express")
    .replace(/\bexpressjs\b/g, "express")

    .replace(/\breact\s*\.\s*js\b/g, "react")
    .replace(/\breactjs\b/g, "react")

    .replace(/\brestful\s+apis?\b/g, "rest api")
    .replace(/\brest\s+apis?\b/g, "rest api")

    .replace(/\bpostgres\b/g, "postgresql")
    .replace(/\bmongo\b/g, "mongodb")

    .trim();
};

const getRequirementAliases = (requirement: string): string[] => {
  const normalized = normalizeRequirementForMatch(requirement);

  const aliases = new Set<string>();

  const add = (value: string) => {
    const normalizedValue = normalizeRequirementForMatch(value);

    if (normalizedValue) {
      aliases.add(normalizedValue);
    }
  };

  // Always keep original requirement
  add(requirement);

  const aliasMap: Record<string, string[]> = {
    javascript: ["javascript", "js", "ecmascript"],

    typescript: ["typescript", "ts"],

    "node.js": ["node.js", "nodejs", "node js", "node"],

    express: ["express", "express.js", "expressjs"],

    "rest api": [
      "rest api",
      "rest apis",
      "restful api",
      "restful apis",
      "restful",
      "rest api development",
      "restful api development",
      "rest api development using express",
    ],

    "rest api development": [
      "rest api development",
      "rest api",
      "restful api development",
      "restful apis",
      "restful api",
      "restful",
      "developed rest apis",
      "developed restful apis",
      "built rest apis",
      "build rest apis",
    ],

    mongodb: ["mongodb", "mongo", "mongo db"],

    mongoose: ["mongoose"],

    postgresql: ["postgresql", "postgres", "postgres db"],

    authentication: [
      "authentication",
      "authenticate",
      "authenticated",
      "auth",
      "jwt authentication",
      "user authentication",
    ],

    authorization: [
      "authorization",
      "authorize",
      "authorized",
      "rbac",
      "role based access control",
      "role-based access control",
    ],

    jwt: ["jwt", "json web token", "json web tokens"],

    redis: ["redis", "redis cache", "redis caching"],

    git: ["git", "version control"],

    github: ["github", "git hub"],

    postman: ["postman", "api testing with postman", "api testing"],

    "api testing": [
      "api testing",
      "api tests",
      "tested apis",
      "testing apis",
      "postman",
    ],

    "database schemas": [
      "database schemas",
      "database schema",
      "design database schemas",
      "designed database schemas",
      "database design",
      "designed database",
    ],

    "database design": [
      "database design",
      "database schema",
      "database schemas",
      "designed database",
      "designed database schemas",
    ],

    "api design": [
      "api design",
      "api architecture",
      "rest api design",
      "restful api design",
      "designed apis",
      "designed rest apis",
    ],

    "api architecture": [
      "api architecture",
      "api design",
      "rest api architecture",
      "restful api architecture",
      "designed api architecture",
    ],

    "error handling": [
      "error handling",
      "error handler",
      "exception handling",
      "handled errors",
    ],

    logging: ["logging", "application logging", "error logging", "logger"],

    security: [
      "security",
      "backend security",
      "api security",
      "application security",
      "secure apis",
    ],

    scalability: [
      "scalability",
      "scalable",
      "scalable backend",
      "scalable apis",
      "scalable rest apis",
    ],

    caching: ["caching", "cache", "redis caching", "redis cache"],

    "problem-solving": [
      "problem solving",
      "problem-solving",
      "problem solving skills",
      "problem-solving skills",
    ],

    debugging: ["debugging", "debug", "debugging skills", "debug backend"],

    "ci/cd": [
      "ci/cd",
      "continuous integration",
      "continuous delivery",
      "continuous deployment",
    ],
  };

  // Find aliases by exact normalized key
  for (const [key, values] of Object.entries(aliasMap)) {
    const normalizedKey = normalizeRequirementForMatch(key);

    if (
      normalized === normalizedKey ||
      values.some((value) => normalizeRequirementForMatch(value) === normalized)
    ) {
      values.forEach(add);
      add(key);
    }
  }

  // ----------------------------------------------------------
  // GENERIC COMPOSITE REQUIREMENT EXPANSION
  // ----------------------------------------------------------

  if (normalized.includes("rest api") || normalized.includes("restful api")) {
    add("rest api");
    add("rest apis");
    add("restful api");
    add("restful apis");
    add("restful");
  }

  if (
    normalized.includes("database schema") ||
    normalized.includes("database schemas")
  ) {
    add("database schema");
    add("database schemas");
    add("database design");
  }

  if (normalized.includes("authentication")) {
    add("authentication");
    add("auth");
    add("jwt authentication");
  }

  if (normalized.includes("authorization") || normalized.includes("rbac")) {
    add("authorization");
    add("rbac");
    add("role based access control");
  }

  if (normalized.includes("api testing")) {
    add("api testing");
    add("postman");
  }

  if (normalized.includes("security")) {
    add("security");
    add("api security");
    add("backend security");
  }

  return Array.from(aliases);
};

//

const getResponsibilityAliases = (requirement: string): string[] => {
  const normalized = normalizeRequirementForMatch(requirement);

  const aliases: Record<string, string[]> = {
    "develop and maintain backend apis": [
      "backend api",
      "backend apis",
      "rest api",
      "restful api",
      "rest apis",
      "api development",
      "api development",
      "api development using express",
      "developed apis",
      "develop apis",
      "maintain apis",
    ],

    "design database schemas": [
      "database schema",
      "database schemas",
      "mongodb schema",
      "mongoose schema",
      "designed database",
      "database design",
      "schema design",
      "data modeling",
    ],

    "implement authentication and authorization": [
      "authentication",
      "authorization",
      "jwt authentication",
      "jwt",
      "auth",
      "rbac",
      "role based access",
      "access control",
      "login authentication",
    ],

    "integrate third-party apis": [
      "third party api",
      "third-party api",
      "third party apis",
      "external api",
      "external apis",
      "api integration",
      "integrated api",
      "api integrations",
    ],

    "debug and optimize backend services": [
      "debug backend",
      "debugging backend",
      "backend debugging",
      "optimize backend",
      "backend optimization",
      "optimized backend",
      "performance optimization",
      "api optimization",
      "debugged",
      "optimized",
    ],

    "collaborate with frontend developers": [
      "frontend developers",
      "front end developers",
      "frontend team",
      "frontend development",
      "worked with frontend",
      "collaborated with frontend",
      "api integration with frontend",
      "frontend backend integration",
    ],

    "problem-solving": [
      "problem solving",
      "problem-solving",
      "debugging",
      "troubleshooting",
      "resolved issues",
      "solved technical issues",
    ],
  };

  return [normalized, ...(aliases[normalized] ?? [])];
};
const findRequirementEvidence = (
  requirement: string,
  resume: ATSResume,
): {
  status: ATSMatchStatus;
  evidenceStrength: ATSEvidenceStrength;
  evidence: string[];
  sections: string[];
  confidence: number;
  explanation: string;
} => {
  const sources = getResumeEvidenceSources(resume);

  const aliases = getRequirementAliases(requirement);

  // ----------------------------------------------------------
  // DEBUG
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // MATCHED SOURCES
  // ----------------------------------------------------------

  const matchedSources: Array<{
    section: string;
    text: string;
  }> = [];

  // ----------------------------------------------------------
  // FIND EVIDENCE
  // ----------------------------------------------------------

  for (const source of sources) {
    const sourceText = normalizeRequirementForMatch(source.text);

    if (!sourceText) {
      continue;
    }

    const matched = aliases.some((alias) => {
      const result = containsNormalizedPhrase(sourceText, alias);

      // Keep debug only for important requirements.
      if (["Node.js", "Express.js", "TypeScript"].includes(requirement)) {
        // console.log(
        //   "MATCH CHECK:",
        //   {
        //     requirement,
        //     sourceText,
        //     alias,
        //     result,
        //   }
        // );
      }

      return result;
    });

    if (matched) {
      matchedSources.push(source);
    }
  }

  // ----------------------------------------------------------
  // NO EVIDENCE
  // ----------------------------------------------------------

  if (matchedSources.length === 0) {
    return {
      status: "missing",

      evidenceStrength: "missing",

      evidence: [],

      sections: [],

      confidence: 95,

      explanation: `"${requirement}" is not demonstrated anywhere in the resume.`,
    };
  }

  // ----------------------------------------------------------
  // BUILD EVIDENCE
  // ----------------------------------------------------------

  const sections = uniqueStrings(matchedSources.map((item) => item.section));

  const evidence = uniqueStrings(matchedSources.map((item) => item.text)).slice(
    0,
    5,
  );

  // ----------------------------------------------------------
  // EVIDENCE LEVEL
  //
  // Experience / Internship
  //      ↓
  // Projects
  //      ↓
  // Skills
  //      ↓
  // Other
  // ----------------------------------------------------------

  const hasExperience = sections.includes("experience");

  const hasInternship =
    sections.includes("internship") || sections.includes("internships");

  const hasProject = sections.includes("projects");

  const hasSkills = sections.includes("skills");

  // ----------------------------------------------------------
  // STRONG EVIDENCE: EXPERIENCE / INTERNSHIP
  // ----------------------------------------------------------

  if (hasExperience || hasInternship) {
    return {
      status: "matched",

      evidenceStrength: "strong",

      evidence,

      sections,

      confidence: 95,

      explanation: `"${requirement}" is directly demonstrated through practical experience.`,
    };
  }

  // ----------------------------------------------------------
  // STRONG EVIDENCE: PROJECT
  // ----------------------------------------------------------

  if (hasProject) {
    return {
      status: "matched",

      evidenceStrength: "strong",

      evidence,

      sections,

      confidence: 90,

      explanation: `"${requirement}" is demonstrated through project work.`,
    };
  }

  // ----------------------------------------------------------
  // PARTIAL EVIDENCE: SKILLS ONLY
  // ----------------------------------------------------------

  if (hasSkills) {
    return {
      status: "partial",

      evidenceStrength: "moderate",

      evidence,

      sections,

      confidence: 80,

      explanation: `"${requirement}" is listed in the skills section but lacks supporting evidence in experience or projects.`,
    };
  }

  // ----------------------------------------------------------
  // WEAK EVIDENCE
  // ----------------------------------------------------------

  return {
    status: "partial",

    evidenceStrength: "weak",

    evidence,

    sections,

    confidence: 70,

    explanation: `"${requirement}" appears in the resume but has limited supporting evidence.`,
  };
};

// ============================================================
// JD REQUIREMENT MATCHING
// ============================================================

const analyzeJDRequirements = (
  resume: ATSResume,
  jd: ATSJobDescriptionAnalysis,
): ATSJobDescriptionAnalysis => {
  console.log("🔥 NEW analyzeJDRequirements RUNNING 🔥");
  const requirements = [
    ...jd.requiredSkills,
    ...jd.preferredSkills,
    ...jd.responsibilities,
    ...jd.softSkills,
    ...jd.tools,
    ...jd.technologies,
    ...jd.domains,
    ...jd.requirements,
  ];

  const uniqueRequirements = Array.from(
    new Map(
      requirements.map((item) => [
        normalizeRequirementForMatch(item.name),
        item,
      ]),
    ).values(),
  );

  const matches: ATSRequirementMatch[] = uniqueRequirements.map(
    (requirement) => {
      const evidence = findRequirementEvidence(requirement.name, resume);

      return {
        requirementId: requirement.id,

        requirement: requirement.name,

        normalizedRequirement: normalizeRequirementForMatch(requirement.name),

        priority: requirement.priority,

        status: evidence.status,

        evidenceStrength: evidence.evidenceStrength,

        matchedResumeEvidence: evidence.evidence,

        matchedResumeSections: evidence.sections,

        confidence: evidence.confidence,

        explanation: evidence.explanation,
      };
    },
  );

  //     console.log(
  //   "========== JD REQUIREMENT CLASSIFICATION =========="
  // );

  // matches.forEach((match) => {
  //   console.log({
  //     requirement: match.requirement,
  //     priority: match.priority,
  //     status: match.status,
  //   });
  // });

  // console.log(
  //   "=================================================="
  // );

  const calculatePercentage = (items: ATSRequirementMatch[]): number => {
    if (items.length === 0) {
      return 0;
    }

    let points = 0;

    for (const item of items) {
      if (item.status === "matched") {
        points += 1;
      } else if (item.status === "partial") {
        points += 0.5;
      }
    }

    return Number(((points / items.length) * 100).toFixed(1));
  };

  const requiredMatches = matches.filter(
    (match) => match.priority === "required",
  );

  const preferredMatches = matches.filter(
    (match) => match.priority === "preferred",
  );

  const responsibilityMatches = (jd.responsibilities ?? [])
    .map((responsibility) => {
      const evidence = findRequirementEvidence(responsibility.name, resume);

      return {
        responsibility,
        evidence,
      };
    })
    .filter(
      ({ evidence }) =>
        evidence.status === "matched" || evidence.status === "partial",
    );

  const responsibilityMatchPercentage = jd.responsibilities?.length
    ? Number(
        (
          (responsibilityMatches.length / jd.responsibilities.length) *
          100
        ).toFixed(1),
      )
    : 0;

  const requiredMatchPercentage = calculatePercentage(requiredMatches);

  const preferredMatchPercentage = calculatePercentage(preferredMatches);

  const otherMatches = matches.filter(
    (match) =>
      !requiredMatches.includes(match) && !preferredMatches.includes(match),
  );

  const otherMatchPercentage = calculatePercentage(otherMatches);

  const overallMatchPercentage = Number(
    (
      requiredMatchPercentage * 0.6 +
      responsibilityMatchPercentage * 0.2 +
      preferredMatchPercentage * 0.1 +
      otherMatchPercentage * 0.1
    ).toFixed(1),
  );

  const criticalMissingRequirements = matches
    .filter(
      (match) => match.priority === "required" && match.status === "missing",
    )
    .map((match) => match.requirement);

  const partialRequirements = matches
    .filter((match) => match.status === "partial")
    .map((match) => match.requirement);

  const matchedRequirements = matches
    .filter((match) => match.status === "matched")
    .map((match) => match.requirement);

  return {
    ...jd,

    matches,

    requiredMatchPercentage,

    preferredMatchPercentage,

    responsibilityMatchPercentage,

    overallMatchPercentage,

    criticalMissingRequirements,

    partialRequirements,

    matchedRequirements,

    issues: [...(jd.issues ?? [])],

    suggestions: [...(jd.suggestions ?? [])],
  };
};

// ============================================================
// JD ANALYSIS + REQUIREMENT MATCHING
// ============================================================

// export const analyzeJobDescriptionMatch = (
//   resume: ATSResume,
//   jd: ATSJobDescriptionAnalysis,
// ): ATSJobDescriptionAnalysis => {
//   const allRequirements: ATSJobRequirement[] = Array.isArray(jd.requirements)
//     ? jd.requirements
//     : [];

//   const uniqueRequirements = Array.from(
//     new Map(
//       allRequirements.map((item) => [
//         normalizeRequirementForMatch(item.name),
//         item,
//       ]),
//     ).values(),
//   );

//   console.log("========== LIVE JD REQUIREMENTS ==========");

//   console.log(
//     allRequirements.map((item) => ({
//       name: item.name,
//       priority: item.priority,
//     })),
//   );

//   console.log("========== LIVE JD RESPONSIBILITIES ==========");

//   console.log(
//     jd.responsibilities.map((item) => ({
//       name: item.name,
//       priority: item.priority,
//     })),
//   );

//   console.log("=============================================");

//   const matches: ATSRequirementMatch[] = uniqueRequirements.map(
//     (requirement) => {
//       const evidence = findRequirementEvidence(requirement.name, resume);

//       return {
//         requirementId: requirement.id,

//         requirement: requirement.name,

//         normalizedRequirement: normalizeRequirementForMatch(requirement.name),

//         priority: requirement.priority,

//         status: evidence.status,

//         evidenceStrength: evidence.evidenceStrength,

//         matchedResumeEvidence: evidence.evidence,

//         matchedResumeSections: evidence.sections,

//         confidence: evidence.confidence,

//         explanation: evidence.explanation,
//       };
//     },
//   );

//   const requiredMatches = matches.filter(
//     (match) => match.priority === "required",
//   );

//   const preferredMatches = matches.filter(
//     (match) => match.priority === "preferred",
//   );

//   const responsibilityMatches = matches.filter((match) =>
//     jd.responsibilities?.some((responsibility) => {
//       const responsibilityText = normalizeRequirementForMatch(
//         responsibility.name,
//       );

//       const matchText = match.normalizedRequirement;

//       return (
//         responsibilityText === matchText ||
//         responsibilityText.includes(matchText) ||
//         matchText.includes(responsibilityText)
//       );
//     }),
//   );

//   const calculateMatchPercentage = (items: ATSRequirementMatch[]): number => {
//     if (items.length === 0) {
//       return 0;
//     }

//     let score = 0;

//     for (const item of items) {
//       if (item.status === "matched") {
//         score += 1;
//       } else if (item.status === "partial") {
//         score += 0.5;
//       }
//     }

//     return Number(((score / items.length) * 100).toFixed(1));
//   };

//   const requiredMatchPercentage = calculateMatchPercentage(requiredMatches);

//   const preferredMatchPercentage = calculateMatchPercentage(preferredMatches);

//   const responsibilityMatchPercentage = calculateMatchPercentage(
//     responsibilityMatches,
//   );

//   //     console.log(
//   //   "========== RESPONSIBILITY MATCH DEBUG =========="
//   // );

//   // console.log(
//   //   "JD responsibilities:",
//   //   jd.responsibilities?.map((r) => ({
//   //     name: r.name,
//   //     normalized: normalizeRequirementForMatch(r.name),
//   //   }))
//   // );

//   // console.log(
//   //   "Requirement matches:",
//   //   matches.map((m) => ({
//   //     requirement: m.requirement,
//   //     normalized: m.normalizedRequirement,
//   //     priority: m.priority,
//   //     status: m.status,
//   //   }))
//   // );

//   // console.log(
//   //   "Responsibility matches:",
//   //   responsibilityMatches.map((m) => ({
//   //     requirement: m.requirement,
//   //     status: m.status,
//   //   }))
//   // );

//   // console.log(
//   //   "Responsibility percentage:",
//   //   responsibilityMatchPercentage
//   // );

//   // console.log(
//   //   "==============================================="
//   // );

//   /*
//    * Required requirements get the highest weight.
//    *
//    * 60% Required
//    * 20% Responsibilities
//    * 10% Preferred
//    * 10% Other JD requirements
//    */

//   const otherMatches = matches.filter(
//     (match) =>
//       !requiredMatches.includes(match) &&
//       !preferredMatches.includes(match) &&
//       !responsibilityMatches.includes(match),
//   );

//   const otherMatchPercentage = calculateMatchPercentage(otherMatches);
//   console.log("========== JD SCORE BREAKDOWN ==========");
//   console.log("Required:", requiredMatchPercentage);
//   console.log("Responsibilities:", responsibilityMatchPercentage);
//   console.log("Preferred:", preferredMatchPercentage);
//   console.log("Other:", otherMatchPercentage);
//   console.log(
//     "Calculated Overall:",
//     (
//       requiredMatchPercentage * 0.6 +
//       responsibilityMatchPercentage * 0.2 +
//       preferredMatchPercentage * 0.1 +
//       otherMatchPercentage * 0.1
//     ).toFixed(1),
//   );
//   console.log("========================================");

//   const overallMatchPercentage = Number(
//     (
//       requiredMatchPercentage * 0.6 +
//       responsibilityMatchPercentage * 0.2 +
//       preferredMatchPercentage * 0.1 +
//       otherMatchPercentage * 0.1
//     ).toFixed(1),
//   );

//   const criticalMissingRequirements = requiredMatches
//     .filter((match) => match.status === "missing")
//     .map((match) => match.requirement);

//   const partialRequirements = matches
//     .filter((match) => match.status === "partial")
//     .map((match) => match.requirement);

//   const matchedRequirements = matches
//     .filter((match) => match.status === "matched")
//     .map((match) => match.requirement);

//   const issues: string[] = [];

//   const suggestions: string[] = [];

//   if (criticalMissingRequirements.length > 0) {
//     issues.push(
//       `${criticalMissingRequirements.length} required JD requirement(s) are missing from the resume.`,
//     );

//     suggestions.push(
//       `Address required requirements such as ${criticalMissingRequirements
//         .slice(0, 5)
//         .join(", ")} if you genuinely have experience with them.`,
//     );
//   }

//   if (responsibilityMatchPercentage < 60) {
//     issues.push(
//       "Resume experience does not sufficiently demonstrate the responsibilities described in the JD.",
//     );

//     suggestions.push(
//       "Rewrite relevant experience and project bullets to demonstrate the JD responsibilities using truthful evidence.",
//     );
//   }

//   if (requiredMatchPercentage < 70) {
//     issues.push(`Required-skill match is only ${requiredMatchPercentage}%.`);
//   }

//   if (overallMatchPercentage < 70) {
//     suggestions.push(
//       "Prioritize high-impact missing requirements before optimizing secondary keywords.",
//     );
//   }

//   return {
//     ...jd,

//     matches,

//     requiredMatchPercentage,

//     preferredMatchPercentage,

//     responsibilityMatchPercentage,

//     overallMatchPercentage,

//     criticalMissingRequirements,

//     partialRequirements,

//     matchedRequirements,

//     issues: Array.from(new Set([...(jd.issues ?? []), ...issues])),

//     suggestions: Array.from(
//       new Set([...(jd.suggestions ?? []), ...suggestions]),
//     ),
//   };
// };

// ============================================================
// JD MATCH AGGREGATES (shared by lexical + AI-refined passes)
// ============================================================

const buildJDMatchAggregates = (
  jd: ATSJobDescriptionAnalysis,
  matches: ATSRequirementMatch[],
): ATSJobDescriptionAnalysis => {
  const requiredMatches = matches.filter(
    (match) => match.priority === "required",
  );

  const preferredMatches = matches.filter(
    (match) => match.priority === "preferred",
  );

  const responsibilityMatches = matches.filter((match) =>
    jd.responsibilities?.some((responsibility) => {
      const responsibilityText = normalizeRequirementForMatch(
        responsibility.name,
      );

      const matchText = match.normalizedRequirement;

      return (
        responsibilityText === matchText ||
        responsibilityText.includes(matchText) ||
        matchText.includes(responsibilityText)
      );
    }),
  );

  const calculateMatchPercentage = (items: ATSRequirementMatch[]): number => {
    if (items.length === 0) {
      return 0;
    }

    let score = 0;

    for (const item of items) {
      if (item.status === "matched") {
        score += 1;
      } else if (item.status === "partial") {
        score += 0.5;
      }
    }

    return Number(((score / items.length) * 100).toFixed(1));
  };

  const requiredMatchPercentage = calculateMatchPercentage(requiredMatches);

  const preferredMatchPercentage = calculateMatchPercentage(preferredMatches);

  const responsibilityMatchPercentage = calculateMatchPercentage(
    responsibilityMatches,
  );

  /*
   * Required requirements get the highest weight.
   *
   * 60% Required
   * 20% Responsibilities
   * 10% Preferred
   * 10% Other JD requirements
   */

  const otherMatches = matches.filter(
    (match) =>
      !requiredMatches.includes(match) &&
      !preferredMatches.includes(match) &&
      !responsibilityMatches.includes(match),
  );

  const otherMatchPercentage = calculateMatchPercentage(otherMatches);

  const overallMatchPercentage = Number(
    (
      requiredMatchPercentage * 0.6 +
      responsibilityMatchPercentage * 0.2 +
      preferredMatchPercentage * 0.1 +
      otherMatchPercentage * 0.1
    ).toFixed(1),
  );

  const criticalMissingRequirements = requiredMatches
    .filter((match) => match.status === "missing")
    .map((match) => match.requirement);

  const partialRequirements = matches
    .filter((match) => match.status === "partial")
    .map((match) => match.requirement);

  const matchedRequirements = matches
    .filter((match) => match.status === "matched")
    .map((match) => match.requirement);

  const issues: string[] = [];

  const suggestions: string[] = [];

  if (criticalMissingRequirements.length > 0) {
    issues.push(
      `${criticalMissingRequirements.length} required JD requirement(s) are missing from the resume.`,
    );

    suggestions.push(
      `Address required requirements such as ${criticalMissingRequirements
        .slice(0, 5)
        .join(", ")} if you genuinely have experience with them.`,
    );
  }

  if (responsibilityMatchPercentage < 60) {
    issues.push(
      "Resume experience does not sufficiently demonstrate the responsibilities described in the JD.",
    );

    suggestions.push(
      "Rewrite relevant experience and project bullets to demonstrate the JD responsibilities using truthful evidence.",
    );
  }

  if (requiredMatchPercentage < 70) {
    issues.push(`Required-skill match is only ${requiredMatchPercentage}%.`);
  }

  if (overallMatchPercentage < 70) {
    suggestions.push(
      "Prioritize high-impact missing requirements before optimizing secondary keywords.",
    );
  }

  return {
    ...jd,

    matches,

    requiredMatchPercentage,

    preferredMatchPercentage,

    responsibilityMatchPercentage,

    overallMatchPercentage,

    criticalMissingRequirements,

    partialRequirements,

    matchedRequirements,

    issues: Array.from(new Set([...(jd.issues ?? []), ...issues])),

    suggestions: Array.from(
      new Set([...(jd.suggestions ?? []), ...suggestions]),
    ),
  };
};

// ============================================================
// JD ANALYSIS + REQUIREMENT MATCHING (LEXICAL / FAST PASS)
// ============================================================

export const analyzeJobDescriptionMatch = (
  resume: ATSResume,
  jd: ATSJobDescriptionAnalysis,
): ATSJobDescriptionAnalysis => {
  const allRequirements: ATSJobRequirement[] = Array.isArray(jd.requirements)
    ? jd.requirements
    : [];

  const uniqueRequirements = Array.from(
    new Map(
      allRequirements.map((item) => [
        normalizeRequirementForMatch(item.name),
        item,
      ]),
    ).values(),
  );

  const matches: ATSRequirementMatch[] = uniqueRequirements.map(
    (requirement) => {
      const evidence = findRequirementEvidence(requirement.name, resume);

      return {
        requirementId: requirement.id,

        requirement: requirement.name,

        normalizedRequirement: normalizeRequirementForMatch(requirement.name),

        priority: requirement.priority,

        status: evidence.status,

        evidenceStrength: evidence.evidenceStrength,

        matchedResumeEvidence: evidence.evidence,

        matchedResumeSections: evidence.sections,

        confidence: evidence.confidence,

        explanation: evidence.explanation,
      };
    },
  );

  return buildJDMatchAggregates(jd, matches);
};

// ============================================================
// JD REQUIREMENT MATCHING (SEMANTIC / AI-REFINED PASS)
//
// Runs only on requirements the lexical pass could NOT confirm
// as "matched". Sends just those, plus condensed resume
// evidence, to the AI for a semantic second opinion. This keeps
// AI usage small (most obvious matches never need it) while
// catching paraphrases and equivalent technologies the lexical
// alias map doesn't know about.
// ============================================================

export const refineJDMatchesWithAI = async (
  resume: ATSResume,
  jd: ATSJobDescriptionAnalysis,
): Promise<ATSJobDescriptionAnalysis> => {
  const unresolved = jd.matches.filter((match) => match.status !== "matched");

  if (unresolved.length === 0) {
    return jd;
  }

  const evidenceSources = getResumeEvidenceSources(resume);

  const resumeEvidenceText = evidenceSources
    .map((source) => `[${source.section}] ${source.text}`)
    .join("\n");

  const requirementList = unresolved
    .map((match) => `- ${match.requirement} (priority: ${match.priority})`)
    .join("\n");

  const prompt = `
You are an expert technical recruiter performing SEMANTIC skill matching
between a candidate resume and a list of job requirements.

The requirements below were NOT confirmed by exact keyword matching. Check
whether the resume demonstrates each one using different wording, an
equivalent technology, or a closely related skill.

Do NOT assume a requirement is met just because a related technology is
present. Only mark "matched" when the resume genuinely demonstrates the
requirement, even if phrased differently. Never invent evidence that is
not present in the resume content below.

REQUIREMENTS TO CHECK:
${requirementList}

RESUME CONTENT:
${resumeEvidenceText}

Return ONLY valid JSON. No markdown. No explanations outside the JSON.

Use exactly this structure:

{
  "matches": [
    {
      "requirement": "",
      "status": "matched" | "partial" | "missing",
      "evidenceStrength": "strong" | "moderate" | "weak" | "missing",
      "matchedResumeEvidence": [""],
      "confidence": 0,
      "explanation": ""
    }
  ]
}

Rules:
- "requirement" must exactly match one of the requirement names given above.
- "matched": the resume clearly demonstrates this requirement, possibly with
  different wording or a closely equivalent technology.
- "partial": the resume shows related or adjacent experience but not a
  direct or confident demonstration.
- "missing": no meaningful evidence exists anywhere in the resume.
- "matchedResumeEvidence" must quote actual resume text relied on, or be an
  empty array when missing.
- "confidence" is an integer from 0 to 100.
- Include every requirement from the list exactly once.
`;

  let aiResult: {
    matches?: Array<{
      requirement: string;
      status: ATSMatchStatus;
      evidenceStrength: ATSEvidenceStrength;
      matchedResumeEvidence?: string[];
      confidence?: number;
      explanation?: string;
    }>;
  };

  try {
    aiResult = await generateJSON(prompt);
  } catch (error) {
    // Fail safe: keep the lexical results if the AI call errors out.
    return jd;
  }

  if (!aiResult || !Array.isArray(aiResult.matches)) {
    return jd;
  }

  const aiByRequirement = new Map(
    aiResult.matches.map((match) => [
      normalizeRequirementForMatch(match.requirement),
      match,
    ]),
  );

  const refinedMatches: ATSRequirementMatch[] = jd.matches.map((match) => {
    // Trust confident lexical matches as-is; only overlay AI
    // findings on requirements that weren't already confirmed.
    if (match.status === "matched") {
      return match;
    }

    const aiMatch = aiByRequirement.get(match.normalizedRequirement);

    if (!aiMatch) {
      return match;
    }

    return {
      ...match,

      status: aiMatch.status ?? match.status,

      evidenceStrength: aiMatch.evidenceStrength ?? match.evidenceStrength,

      matchedResumeEvidence:
        aiMatch.matchedResumeEvidence &&
        aiMatch.matchedResumeEvidence.length > 0
          ? aiMatch.matchedResumeEvidence
          : match.matchedResumeEvidence,

      confidence:
        typeof aiMatch.confidence === "number"
          ? aiMatch.confidence
          : match.confidence,

      explanation: aiMatch.explanation || match.explanation,
    };
  });

  ////////////////////////

  // Build a lookup from requirementId -> original category, so we can
  // tell "named technology/tool" requirements apart from "responsibility"
  // or "soft-skill" requirements — this works for ANY job description,
  // since extractJDRequirements already assigns categories dynamically.
  const allRequirements: ATSJobRequirement[] = [
    ...jd.requiredSkills,
    ...jd.preferredSkills,
    ...jd.responsibilities,
    ...jd.softSkills,
    ...jd.tools,
  ];

  const categoryByRequirementId = new Map(
    allRequirements.map((req) => [req.id, req.category]),
  );

  // Concrete, name-able things (a specific language, framework, database,
  // tool, or API) must be lexically verifiable. Responsibilities and
  // soft skills are fine to accept via semantic/paraphrase matching.
  const CONCRETE_CATEGORIES = new Set([
    "skill",
    "technology",
    "framework",
    "database",
    "cloud",
    "devops",
    "testing",
    "tool",
    "api",
    "architecture",
  ]);

  const guardedMatches = refinedMatches.map((match) => {
    const category = categoryByRequirementId.get(match.requirementId);
    const isConcreteNamedThing = category
      ? CONCRETE_CATEGORIES.has(category)
      : false;

    if (match.status === "matched" && isConcreteNamedThing) {
      const aliases = getRequirementAliases(match.requirement);
      const literallyPresent = evidenceSources.some((source) =>
        aliases.some((alias) => containsNormalizedPhrase(source.text, alias)),
      );

      if (!literallyPresent) {
        return {
          ...match,
          status: "missing" as ATSMatchStatus,
          evidenceStrength: "missing" as ATSEvidenceStrength,
          confidence: 0,
          matchedResumeEvidence: [],
          explanation:
            "Downgraded: named technology/tool not literally present in resume text (only inferred from a related technology).",
        };
      }
    }

    return match;
  });

  return buildJDMatchAggregates(jd, guardedMatches);
};

// return buildJDMatchAggregates(jd, refinedMatches);
// };

const analyzeResumeKeywords = (
  resume: ATSResume,
  jobDescription?: string,
): ATSKeywordAnalysis => {
  const targetRole = cleanText(resume.targetRole);

  const roleMatchInfo = targetRole ? getRoleMatchInfo(targetRole) : null;

  const skillNames = flattenStrings(
    (resume.skills ?? []).map((category) => category.skills ?? []),
  );

  const technologies = (resume.projects ?? []).flatMap(
    (project) => project.technologies ?? [],
  );

  const experienceText = getExperienceBullets(resume);

  const projectDescriptions = (resume.projects ?? []).map(
    (project) => project.description ?? "",
  );

  const textSources = [
    targetRole,
    resume.summary ?? "",
    ...skillNames,
    ...technologies,
    ...experienceText,
    ...projectDescriptions,
  ];

  const combinedText = textSources.join(" ");

  const normalized = normalizeText(combinedText);

  // ============================================================
  // MODE DETECTION
  // ============================================================

  const jdText = cleanText(jobDescription);

  const hasJD = jdText.length > 0;

  const roleBenchmarkAvailable = hasRoleBenchmark(targetRole);

  const roleKeywordPool =
    !hasJD && roleBenchmarkAvailable ? getRoleKeywordPool(targetRole) : [];

  // ============================================================
  // JD KEYWORD DEFINITIONS
  // ============================================================

  const jdKeywordPatterns: Array<{
    keyword: string;
    aliases: string[];
  }> = [
    {
      keyword: "Node.js",
      aliases: ["node.js", "nodejs", "node js"],
    },

    {
      keyword: "Express.js",
      aliases: ["express.js", "expressjs", "express"],
    },

    {
      keyword: "JavaScript",
      aliases: ["javascript", "js"],
    },

    {
      keyword: "TypeScript",
      aliases: ["typescript", "ts"],
    },

    {
      keyword: "MongoDB",
      aliases: ["mongodb", "mongo db", "mongo"],
    },

    {
      keyword: "Mongoose",
      aliases: ["mongoose"],
    },

    {
      keyword: "REST APIs",
      aliases: ["rest api", "rest apis", "restful api", "restful apis"],
    },

    {
      keyword: "JWT",
      aliases: ["jwt", "json web token", "json web tokens"],
    },

    {
      keyword: "Authentication",
      aliases: ["authentication", "authenticate", "authenticated"],
    },

    {
      keyword: "Authorization",
      aliases: [
        "authorization",
        "authorize",
        "rbac",
        "role based access control",
      ],
    },

    {
      keyword: "Git",
      aliases: ["git"],
    },

    {
      keyword: "GitHub",
      aliases: ["github", "git hub"],
    },

    {
      keyword: "Postman",
      aliases: ["postman"],
    },

    {
      keyword: "Redis",
      aliases: ["redis", "redis cache", "redis caching"],
    },
  ];

  // ============================================================
  // JD KEYWORDS
  // ============================================================

  let jdKeywordCandidates: string[] = [];

  if (hasJD) {
    jdKeywordCandidates = uniqueStrings(
      jdKeywordPatterns
        .filter((item) =>
          item.aliases.some((alias) => containsNormalizedPhrase(jdText, alias)),
        )
        .map((item) => item.keyword),
    );
  }

  // ============================================================
  // FINAL KEYWORD CANDIDATES
  //
  // JD MODE:
  //   ONLY JD keywords
  //
  // ROLE MODE:
  //   ONLY the role benchmark pool. Resume-extracted skills/
  //   technologies are deliberately excluded here — including them
  //   made every candidate self-referential (a keyword pulled FROM
  //   the resume will always be found IN the resume), which silently
  //   forced coverage toward 100% regardless of actual keyword gaps.
  // ============================================================

  const keywordCandidates = hasJD ? jdKeywordCandidates : roleKeywordPool;

  // ============================================================
  // KEYWORD FREQUENCY
  // ============================================================

  const keywordFrequency: Record<string, number> = {};

  const matchedKeywords: string[] = [];

  // ============================================================
  // ROLE MODE / GENERAL KEYWORD MATCHING
  //
  // This runs only when there is NO JD.
  // ============================================================

  if (!hasJD) {
    for (const keyword of keywordCandidates) {
      const normalizedKeyword = normalizeText(keyword);

      if (!normalizedKeyword) {
        continue;
      }

      const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const regex = new RegExp(`\\b${escaped}\\b`, "gi");

      const matches = normalized.match(regex) ?? [];

      const frequency = matches.length;

      keywordFrequency[keyword] = frequency;

      if (frequency > 0) {
        matchedKeywords.push(keyword);
      }
    }
  }

  // ============================================================
  // JD MODE
  //
  // ONLY compare JD requirements against resume.
  // ============================================================

  const missingKeywords: string[] = [];

  if (hasJD) {
    for (const item of jdKeywordPatterns) {
      const appearsInJD = item.aliases.some((alias) =>
        containsNormalizedPhrase(jdText, alias),
      );

      if (!appearsInJD) {
        continue;
      }

      const appearsInResume = item.aliases.some((alias) =>
        containsNormalizedPhrase(combinedText, alias),
      );

      if (appearsInResume) {
        matchedKeywords.push(item.keyword);
      } else {
        missingKeywords.push(item.keyword);
      }
    }
  }

  // ============================================================
  // ROLE MODE
  //
  // Missing keywords are based on role benchmark.
  // ============================================================

  if (!hasJD) {
    for (const keyword of roleKeywordPool) {
      const appearsInResume = containsNormalizedPhrase(combinedText, keyword);

      if (!appearsInResume) {
        missingKeywords.push(keyword);
      }
    }
  }

  // ============================================================
  // ROLE MATCHED KEYWORDS
  // ============================================================

  const roleMatchedKeywords = !hasJD
    ? roleKeywordPool.filter((keyword) =>
        containsNormalizedPhrase(combinedText, keyword),
      )
    : [];

  // ============================================================
  // COVERAGE
  // ============================================================

  const roleCoverage =
    !hasJD && roleKeywordPool.length > 0
      ? (roleMatchedKeywords.length / roleKeywordPool.length) * 100
      : 0;

  const keywordCoverage =
    keywordCandidates.length > 0
      ? (uniqueStrings(matchedKeywords).length / keywordCandidates.length) * 100
      : 0;

  // ============================================================
  // GENERIC FALLBACK (no JD AND no recognized role benchmark)
  //
  // With nothing external to compare against, scoring keyword
  // "coverage" would mean comparing the resume to itself — which
  // trivially returns ~100% every time and can never surface a
  // missing keyword. Instead, score conservatively off raw keyword
  // depth/diversity, and tell the user how to get a real match score.
  // ============================================================

  const noExternalBenchmark = !hasJD && !roleBenchmarkAvailable;

  const genericKeywordCandidates = uniqueStrings([
    ...skillNames,
    ...technologies,
  ]);

  const GENERIC_KEYWORD_TARGET = 12;

  const genericKeywordCoverage = noExternalBenchmark
    ? Math.min(
        (genericKeywordCandidates.length / GENERIC_KEYWORD_TARGET) * 100,
        100,
      )
    : 0;

  // ============================================================
  // ISSUES / SUGGESTIONS
  // ============================================================

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (keywordCandidates.length === 0 && !noExternalBenchmark) {
    issues.push(
      hasJD
        ? "No recognizable job-specific keywords were detected in the job description."
        : "Very few role-related keywords were detected.",
    );
  }

  if (noExternalBenchmark) {
    issues.push(
      "Keyword relevance can't be precisely measured without a job description or a recognized target role — add one of these for an accurate match score and a real missing-keywords list.",
    );

    if (genericKeywordCandidates.length < GENERIC_KEYWORD_TARGET) {
      suggestions.push(
        `Add more specific, role-relevant skills and technologies (currently ${genericKeywordCandidates.length} detected — aim for ${GENERIC_KEYWORD_TARGET}+) so ATS systems have more to match against.`,
      );
    }
  }

  if (hasJD && missingKeywords.length > 0) {
    suggestions.push(
      `Prioritize relevant missing JD requirements such as: ${uniqueStrings(
        missingKeywords,
      )
        .slice(0, 5)
        .join(", ")}.`,
    );
  }

  if (
    !hasJD &&
    roleKeywordPool.length > 0 &&
    roleMatchedKeywords.length < roleKeywordPool.length
  ) {
    suggestions.push(
      `Strengthen role alignment by adding relevant ${targetRole} skills and technologies.`,
    );
  }

  // ============================================================
  // BASE SCORE
  // ============================================================

  const baseMaxScore = getCategoryMaxScore("keywords");

  let score = 0;

  if (!hasJD && roleBenchmarkAvailable && roleKeywordPool.length > 0) {
    // ROLE MODE
    score = Number(
      (
        ((Math.min(roleCoverage, 100) / 100) * 0.7 +
          (Math.min(keywordCoverage, 100) / 100) * 0.3) *
        baseMaxScore
      ).toFixed(2),
    );
  } else if (noExternalBenchmark) {
    // FALLBACK MODE — see comment above.
    score = Number(
      ((genericKeywordCoverage / 100) * baseMaxScore).toFixed(2),
    );
  } else {
    // JD MODE
    score = Number(
      ((Math.min(keywordCoverage, 100) / 100) * baseMaxScore).toFixed(2),
    );
  }

  // ============================================================
  // FINAL CLEANUP
  // ============================================================

  const finalMatchedKeywords = uniqueStrings(matchedKeywords);

  const finalMissingKeywords = uniqueStrings(missingKeywords).filter(
    (keyword) =>
      !finalMatchedKeywords.some(
        (matched) => normalizeText(matched) === normalizeText(keyword),
      ),
  );

  // ============================================================
  // RETURN
  // ============================================================

  return {
    keywords: uniqueStrings(keywordCandidates),

    matchedKeywords: finalMatchedKeywords,

    missingKeywords: finalMissingKeywords,

    keywordFrequency,

    keywordCoverage: Number(keywordCoverage.toFixed(2)),

    keywordDensity: undefined,

    stuffingDetected: false,

    score: clampATSScore(score, 0, baseMaxScore),

    issues: uniqueStrings(issues),

    suggestions: uniqueStrings(suggestions),
  };
};

// ============================================================
// RECONCILE "KEYWORDS" CATEGORY WITH THE REAL JD ANALYSIS
// ============================================================

/**
 * `ruleAnalysis.categories` (built in `analyzeResumeATS`, before any
 * JD has been parsed) scores "Keyword Relevance" using a small
 * hardcoded list of ~14 keywords as a rough placeholder — see the
 * comment in `analyzeResumeKeywords`. By the time a job description
 * has actually been AI-parsed into `ATSJobDescriptionAnalysis`
 * (dynamic required/preferred skills, technologies, domains, with a
 * real `overallMatchPercentage`), that placeholder score is stale and
 * can disagree with the matched/missing keyword lists shown elsewhere
 * in the UI — which already correctly use `jdAnalysis`.
 *
 * This replaces the "keywords" entry in the category list with one
 * derived from the real JD analysis whenever it's available, so the
 * score, status, and matched/missing keywords the user sees all agree
 * with each other.
 */
export const reconcileKeywordCategoryWithJD = (
  categories: ATSCategoryResult[],
  jdAnalysis: ATSJobDescriptionAnalysis | undefined,
  hasJobDescription: boolean,
): ATSCategoryResult[] => {
  if (!hasJobDescription || !jdAnalysis) {
    return categories;
  }

  const matched = uniqueStrings(jdAnalysis.matchedRequirements);

  const missing = uniqueStrings([
    ...jdAnalysis.criticalMissingRequirements,
    ...jdAnalysis.matches
      .filter((match) => match.status === "missing")
      .map((match) => match.requirement),
  ]);

  const partial = uniqueStrings(jdAnalysis.partialRequirements);

  const issues: string[] = [];
  const suggestions: string[] = [...jdAnalysis.suggestions];

  if (missing.length > 0) {
    issues.push(
      `Missing ${missing.length} keyword${missing.length === 1 ? "" : "s"} the job description asks for: ${missing
        .slice(0, 8)
        .join(", ")}${missing.length > 8 ? ", ..." : ""}.`,
    );
  }

  if (partial.length > 0) {
    issues.push(
      `${partial.length} requirement${partial.length === 1 ? "" : "s"} only partially demonstrated: ${partial
        .slice(0, 5)
        .join(", ")}${partial.length > 5 ? ", ..." : ""}.`,
    );
  }

  const reconciledKeywordCategory = makeCategoryResult(
    "keywords",
    (jdAnalysis.overallMatchPercentage / 100) * getCategoryMaxScore("keywords"),
    matched.length > 0
      ? `Matches ${matched.length} of ${matched.length + missing.length + partial.length} keywords/requirements identified in the job description.`
      : "No keywords from the job description were confidently matched in this resume.",
    issues,
    suggestions,
  );

  return categories.map((category) =>
    category.category === "keywords" ? reconciledKeywordCategory : category,
  );
};

/**
 * Reconciling only `categories` isn't enough: `overallScore`,
 * `breakdown`, `strengths`, and `weaknesses` are all derived from the
 * categories INSIDE `analyzeResumeATS`, which runs before the JD has
 * been AI-parsed. So even after fixing the "Keyword Relevance" card
 * itself, the headline score, the breakdown map, and text like
 * "Strong keyword relevance (100%)" in strengths were all silently
 * still computed from the stale, pre-reconciliation categories.
 *
 * This re-derives all four from the reconciled categories so every
 * part of the result — score, breakdown, and the strengths/weaknesses
 * copy — agrees with the same JD-aware keyword score.
 */
export const reconcileRuleAnalysisWithJD = (
  ruleAnalysis: ATSRuleAnalysis,
  jdAnalysis: ATSJobDescriptionAnalysis | undefined,
  hasJobDescription: boolean,
): ATSRuleAnalysis => {
  if (!hasJobDescription || !jdAnalysis) {
    return ruleAnalysis;
  }

  const reconciledCategories = reconcileKeywordCategoryWithJD(
    ruleAnalysis.categories,
    jdAnalysis,
    hasJobDescription,
  );

  const breakdown: ATSBreakdown = {};

  reconciledCategories.forEach((category) => {
    breakdown[category.category] = category.score;
  });

  return {
    ...ruleAnalysis,
    categories: reconciledCategories,
    overallScore: calculateOverallScore(reconciledCategories),
    breakdown,
    strengths: buildStrengths(reconciledCategories),
    weaknesses: buildWeaknesses(reconciledCategories),
  };
};
