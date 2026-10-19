/**
 * ============================================================
 * THRONE8 ATS ENGINE
 * ats.types.ts
 * ============================================================
 *
 * RESPONSIBILITY
 * ------------------------------------------------------------
 * - ATS types
 * - ATS configuration
 * - ATS constants
 * - ATS contracts
 *
 * NOT RESPONSIBLE FOR
 * ------------------------------------------------------------
 * - Database operations
 * - Gemini/API calls
 * - Express controllers
 * - Scoring implementation
 *
 * IMPORTANT ARCHITECTURE RULE
 * ------------------------------------------------------------
 * ATS_SCORE_CATEGORIES is the single source of truth for
 * category IDs, display names, order and maximum scores.
 * ============================================================
 */

// ============================================================
// ATS CATEGORY DEFINITION
// ============================================================

export interface ATSScoreCategoryDefinition {
  /**
   * Machine-readable category identifier.
   *
   * Example:
   * "contact"
   * "skills"
   * "quantifiedResults"
   */
  id: string;

  /**
   * User-facing category name.
   */
  title: string;

  /**
   * Explanation shown in UI / reports.
   */
  description: string;

  /**
   * Maximum points available for this category.
   */
  maxScore: number;

  /**
   * Whether this category participates in the current
   * ATS scoring configuration.
   */
  enabled: boolean;

  /**
   * Evaluation / display order.
   */
  order: number;
}

// ============================================================
// DEFAULT ATS SCORE CATEGORIES
// ============================================================

/**
 * IMPORTANT:
 *
 * This configuration is intentionally extensible.
 *
 * We can later add:
 *
 * - semanticRelevance
 * - seniorityAlignment
 * - industryRelevance
 * - careerProgression
 * - redundancy
 * - grammar
 * - spelling
 * - linkValidation
 * - dateConsistency
 * - parseability
 * - contentDensity
 * - keywordStuffing
 * - jdRequirements
 * - etc.
 *
 * without redesigning the ATS engine.
 */
export const ATS_SCORE_CATEGORIES = [
  {
    id: "contact",
    title: "Contact & Identity",
    description:
      "Checks whether essential professional contact information is present and usable.",
    maxScore: 10,
    enabled: true,
    order: 1,
  },

  {
    id: "sections",
    title: "Section Completeness",
    description:
      "Evaluates the presence, completeness and organization of important resume sections.",
    maxScore: 15,
    enabled: true,
    order: 2,
  },

  {
    id: "skills",
    title: "Skills",
    description:
      "Evaluates the quality, organization and relevance of listed skills.",
    maxScore: 15,
    enabled: true,
    order: 3,
  },

  {
    id: "keywords",
    title: "Keyword Relevance",
    description:
      "Evaluates important role-related keywords and their usage throughout the resume.",
    maxScore: 20,
    enabled: true,
    order: 4,
  },

  {
    id: "experience",
    title: "Experience Quality",
    description:
      "Evaluates responsibilities, achievements, relevance and quality of professional experience.",
    maxScore: 15,
    enabled: true,
    order: 5,
  },

  {
    id: "actionVerbs",
    title: "Action Verbs",
    description:
      "Evaluates the use of strong, relevant and varied action verbs.",
    maxScore: 10,
    enabled: true,
    order: 6,
  },

  {
    id: "quantifiedResults",
    title: "Quantified Impact",
    description:
      "Evaluates measurable results, metrics and evidence of professional impact.",
    maxScore: 5,
    enabled: true,
    order: 7,
  },

  {
    id: "formatting",
    title: "ATS Formatting",
    description:
      "Evaluates formatting patterns that may negatively affect automated resume parsing.",
    maxScore: 10,
    enabled: true,
    order: 8,
  },

  {
    id: "dateConsistency",
    title: "Date Consistency",
    description:
      "Evaluates whether work, internship and education dates are valid, non-overlapping and consistently formatted.",
    maxScore: 10,
    enabled: true,
    order: 9,
  },
] as const satisfies readonly ATSScoreCategoryDefinition[];

// ============================================================
// KNOWN CATEGORY TYPE
// ============================================================

/**
 * Gives TypeScript autocomplete for the currently configured
 * categories.
 *
 * Future custom category strings are still allowed through
 * ATSScoreCategory below.
 */
export type KnownATSCategory = (typeof ATS_SCORE_CATEGORIES)[number]["id"];

/**
 * Extensible category type.
 *
 * Known categories receive autocomplete while arbitrary future
 * category IDs remain technically valid.
 */
export type ATSScoreCategory = KnownATSCategory | (string & {});

// ============================================================
// ATS BREAKDOWN
// ============================================================

/**
 * Dynamic because ATS categories are configuration-driven.
 *
 * Example:
 *
 * {
 *   contact: 9,
 *   sections: 13,
 *   skills: 14,
 *   keywords: 17,
 *   ...
 * }
 */

export type ATSBreakdown = Record<string, number>;

// ============================================================
// ATS CATEGORY STATUS
// ============================================================

export type ATSCategoryStatus =
  | "excellent"
  | "good"
  | "needs-improvement"
  | "poor";

// ============================================================
// ATS CATEGORY RESULT
// ============================================================

export interface ATSCategoryResult {
  category: ATSScoreCategory;

  title: string;

  score: number;

  /**
   * This is resolved from ATS_SCORE_CATEGORIES.
   *
   * It is included in the final result for convenient API/UI
   * consumption, but the scorer must NOT independently invent
   * this value.
   */
  maxScore: number;

  percentage: number;

  status: ATSCategoryStatus;

  summary: string;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// CONTACT ANALYSIS
// ============================================================

export interface ATSContactAnalysis {
  fullName: boolean;

  email: boolean;

  phone: boolean;

  linkedIn: boolean;

  github: boolean;

  portfolio: boolean;

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// SECTION ANALYSIS
// ============================================================

export interface ATSSectionAnalysis {
  present: string[];

  missing: string[];

  disabled: string[];

  empty: string[];

  duplicate: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// SKILLS ANALYSIS
// ============================================================

export interface ATSSkillsAnalysis {
  totalSkills: number;

  categories: number;

  skills: string[];

  duplicateSkills: string[];

  suspiciousSkills: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// KEYWORD ANALYSIS
// ============================================================

export interface ATSKeywordAnalysis {
  keywords: string[];

  matchedKeywords: string[];

  missingKeywords: string[];

  keywordFrequency: Record<string, number>;

  keywordCoverage: number;

  /**
   * Approximate content keyword density.
   *
   * Optional because it may not be calculated in every mode.
   */
  keywordDensity?: number;

  /**
   * Indicates potentially unnatural keyword repetition.
   */
  stuffingDetected?: boolean;

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// SEMANTIC RELEVANCE ANALYSIS
// ============================================================

export interface ATSSemanticRelevanceAnalysis {
  matchedConcepts: string[];

  missingConcepts: string[];

  relatedConcepts: string[];

  irrelevantContent: string[];

  relevanceScore: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// JD / ROLE INTELLIGENCE
// ============================================================

export type ATSRequirementPriority = "required" | "preferred";

export type ATSEvidenceStrength = "strong" | "moderate" | "weak" | "missing";

export type ATSMatchStatus =
  | "matched"
  | "partial"
  | "missing"
  | "not-applicable";

// ============================================================
// JOB REQUIREMENT
// ============================================================

export interface ATSJobRequirement {
  id: string;

  name: string;

  normalizedName: string;

  category:
    | "skill"
    | "technology"
    | "framework"
    | "database"
    | "cloud"
    | "devops"
    | "testing"
    | "tool"
    | "api"
    | "architecture"
    | "responsibility"
    | "education"
    | "certification"
    | "soft-skill"
    | "domain"
    | "other";

  priority: ATSRequirementPriority;

  requiredByJD: boolean;

  evidence?: string;

  sourceText?: string;
}

// ============================================================
// JD REQUIREMENT MATCH
// ============================================================

export interface ATSRequirementMatch {
  requirementId: string;

  requirement: string;

  normalizedRequirement: string;

  priority: ATSRequirementPriority;

  status: ATSMatchStatus;

  evidenceStrength: ATSEvidenceStrength;

  matchedResumeEvidence: string[];

  matchedResumeSections: string[];

  confidence: number;

  explanation: string;
}

// ============================================================
// JD INTELLIGENCE
// ============================================================

export interface ATSJobDescriptionAnalysis {
  jobTitle?: string;

  seniority?: string;

  experienceRequirement?: string;

  educationRequirements: string[];

  certificationRequirements: string[];

  requiredSkills: ATSJobRequirement[];

  preferredSkills: ATSJobRequirement[];

  responsibilities: ATSJobRequirement[];

  softSkills: ATSJobRequirement[];

  tools: ATSJobRequirement[];

  technologies: ATSJobRequirement[];

  domains: ATSJobRequirement[];

  requirements: ATSJobRequirement[];

  matches: ATSRequirementMatch[];

  requiredMatchPercentage: number;

  preferredMatchPercentage: number;

  responsibilityMatchPercentage: number;

  overallMatchPercentage: number;

  criticalMissingRequirements: string[];

  partialRequirements: string[];

  matchedRequirements: string[];

  issues: string[];

  suggestions: string[];
}

// ============================================================
// RESPONSIBILITY MATCHING
// ============================================================

export interface ATSResponsibilityMatch {
  responsibility: string;

  status: ATSMatchStatus;

  evidenceStrength: ATSEvidenceStrength;

  resumeEvidence: string[];

  explanation: string;

  confidence: number;
}

export interface ATSResponsibilityAnalysis {
  totalResponsibilities: number;

  matchedResponsibilities: number;

  partiallyMatchedResponsibilities: number;

  missingResponsibilities: number;

  matchPercentage: number;

  matches: ATSResponsibilityMatch[];

  strengths: string[];

  gaps: string[];

  suggestions: string[];
}

// ============================================================
// SKILL EVIDENCE
// ============================================================

export interface ATSSkillEvidence {
  skill: string;

  normalizedSkill: string;

  status: ATSMatchStatus;

  evidenceStrength: ATSEvidenceStrength;

  resumeSections: string[];

  evidence: string[];

  mentionCount: number;

  contextQuality: number;

  confidence: number;

  explanation: string;
}

// ============================================================
// ROLE INTELLIGENCE
// ============================================================

export interface ATSRoleBenchmark {
  role: string;

  normalizedRole: string;

  coreSkills: string[];

  supportingSkills: string[];

  commonTechnologies: string[];

  commonTools: string[];

  commonResponsibilities: string[];

  seniorityExpectations: string[];

  projectExpectations: string[];

  domainExpectations: string[];
}

export interface ATSRoleReadinessAnalysis {
  role: string;

  benchmark: ATSRoleBenchmark;

  skillAlignmentScore: number;

  technicalDepthScore: number;

  experienceRelevanceScore: number;

  projectRelevanceScore: number;

  keywordQualityScore: number;

  achievementQualityScore: number;

  resumeQualityScore: number;

  atsCompatibilityScore: number;

  overallReadinessScore: number;

  strongAreas: string[];

  skillGaps: string[];

  experienceGaps: string[];

  projectGaps: string[];

  recommendations: ATSRecommendation[];
}

// ============================================================
// SCORE BREAKDOWN
// ============================================================

export interface ATSScoreDimension {
  id: string;

  title: string;

  score: number;

  maxScore: number;

  percentage: number;

  weight: number;

  summary: string;

  issues: string[];

  suggestions: string[];
}

export interface ATSScoreExplanation {
  positiveFactors: string[];

  negativeFactors: string[];

  criticalFactors: string[];

  scoreCalculation: string;

  confidence: number;
}

// ============================================================
// QUICK WINS
// ============================================================

export interface ATSQuickWin {
  id: string;

  title: string;

  description: string;

  estimatedImpact: number;

  category: ATSScoreCategory;

  evidence: string;

  suggestedFix: string;
}

// ============================================================
// FINAL MODE-SPECIFIC ANALYSIS
// ============================================================

export interface ATSModeAnalysis {
  mode: ATSAnalysisMode;

  targetRole: string;

  hasJobDescription: boolean;

  jdAnalysis?: ATSJobDescriptionAnalysis;

  roleAnalysis?: ATSRoleReadinessAnalysis;

  responsibilityAnalysis?: ATSResponsibilityAnalysis;

  skillEvidence: ATSSkillEvidence[];

  scoreDimensions: ATSScoreDimension[];

  scoreExplanation: ATSScoreExplanation;

  quickWins: ATSQuickWin[];
}

// ============================================================
// EXPERIENCE ANALYSIS
// ============================================================

export interface ATSExperienceAnalysis {
  experienceCount: number;

  internshipCount: number;

  totalBullets: number;

  responsibilityBullets: number;

  achievementBullets: number;

  quantifiedBullets: number;

  weakBullets: string[];

  strongBullets: string[];

  repetitiveBullets: string[];

  relevanceIssues: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// ACTION VERB ANALYSIS
// ============================================================

export interface ATSActionVerbAnalysis {
  totalBullets: number;

  bulletsWithActionVerbs: number;

  actionVerbCoverage: number;

  detectedVerbs: string[];

  weakOpenings: string[];

  repeatedVerbs: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// QUANTIFIED RESULTS ANALYSIS
// ============================================================

export interface ATSQuantifiedResultAnalysis {
  totalBullets: number;

  quantifiedBullets: number;

  percentages: string[];

  numbers: string[];

  currencies: string[];

  timeMetrics: string[];

  performanceMetrics: string[];

  metricCoverage: number;

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// ACHIEVEMENT ANALYSIS
// ============================================================

export interface ATSAchievementAnalysis {
  totalAchievements: number;

  quantifiedAchievements: number;

  impactStatements: number;

  weakAchievements: string[];

  strongAchievements: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// PROJECT ANALYSIS
// ============================================================

export interface ATSProjectAnalysis {
  projectCount: number;

  projectsWithTechnologies: number;

  projectsWithDescription: number;

  projectsWithLinks: number;

  projectsWithImpact: number;

  projectsWithMetrics: number;

  weakProjects: string[];

  strongProjects: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// EDUCATION ANALYSIS
// ============================================================

export interface ATSEducationAnalysis {
  educationCount: number;

  completeEntries: number;

  incompleteEntries: number;

  hasDegree: boolean;

  hasInstitution: boolean;

  hasFieldOfStudy: boolean;

  hasDates: boolean;

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// FORMATTING ANALYSIS
// ============================================================

export interface ATSFormattingAnalysis {
  hasContactInfo: boolean;

  hasStandardSections: boolean;

  hasUnusualSectionNames: boolean;

  hasEmptySections: boolean;

  hasExcessiveLinks: boolean;

  hasSuspiciousCharacters: boolean;

  hasPotentialParserIssues: boolean;

  hasPotentialColumnRisk?: boolean;

  hasPotentialTableRisk?: boolean;

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// PARSEABILITY ANALYSIS
// ============================================================

export interface ATSParseabilityAnalysis {
  readableText: boolean;

  contactExtractionPossible: boolean;

  sectionExtractionPossible: boolean;

  dateExtractionPossible: boolean;

  skillExtractionPossible: boolean;

  linkExtractionPossible: boolean;

  unusualStructureDetected: boolean;

  parserRisks: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// DATE CONSISTENCY ANALYSIS
// ============================================================

export interface ATSDateConsistencyAnalysis {
  invalidDates: string[];

  overlappingDates: string[];

  reversedDateRanges: string[];

  inconsistentDateFormats: string[];

  missingDates: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// CONTENT QUALITY ANALYSIS
// ============================================================

export interface ATSContentQualityAnalysis {
  weakStatements: string[];

  vagueStatements: string[];

  repetitiveStatements: string[];

  grammarIssues: string[];

  spellingIssues: string[];

  unnecessaryContent: string[];

  strongStatements: string[];

  score: number;

  issues: string[];

  suggestions: string[];
}

// ============================================================
// SENIORITY / ROLE ALIGNMENT
// ============================================================

export interface ATSSeniorityAlignmentAnalysis {
  targetRole?: string;

  detectedSeniority?: string;

  experienceLevel?: string;

  alignmentScore: number;

  mismatches: string[];

  issues: string[];

  suggestions: string[];
}

// ============================================================
// RECOMMENDATION
// ============================================================

export interface ATSRecommendation {
  id?: string;

  title: string;

  description: string;

  priority: "critical" | "high" | "medium" | "low";

  category: ATSScoreCategory;

  /**
   * Estimated score improvement.
   */
  impact?: number;

  actionable?: boolean;

  /**
   * Resume evidence supporting the recommendation.
   */
  evidence?: string;

  /**
   * Suggested correction.
   */
  suggestedFix?: string;
}

// ============================================================
// ATS FINDING
//
// One "finding" per evaluated item — an experience/project
// bullet, or a missing skill. Used to power the section-by-
// section deep dive on the frontend.
//
// When verdict is "excellent", problems/whyItMatters/
// suggestedFix are left empty — the UI shows a short
// "✓ Excellent" line instead of a full feedback card. Detailed
// feedback is only ever generated for items that actually need
// it, to avoid wasted AI output and UI clutter.
// ============================================================

export type ATSFindingVerdict = "excellent" | "needs-improvement";

export interface ATSFinding {
  /**
   * Stable id for this finding (e.g. the bullet's own id, or a
   * generated id for a missing-skill finding).
   */
  id: string;

  /**
   * The actual bullet text or skill name being evaluated.
   */
  targetText: string;

  verdict: ATSFindingVerdict;

  /**
   * Short problem tags, e.g. ["Weak action verb", "No measurable
   * impact", "Too generic"]. Empty when verdict is "excellent".
   */
  problems: string[];

  /**
   * One short paragraph explaining, in plain language, why the
   * problems above matter. Empty when verdict is "excellent".
   */
  whyItMatters: string;

  /**
   * A rewritten version of targetText addressing the problems.
   * Empty when verdict is "excellent" or when the only problem
   * is missing quantification (see quantificationExamples
   * instead, which is illustrative rather than a drop-in
   * rewrite).
   */
  suggestedFix: string;

  /**
   * True when the bullet's content is otherwise fine but lacks
   * a measurable result. When true, quantificationExamples
   * holds illustrative (NOT invented-for-this-resume) example
   * phrasings the user can pattern-match against using their
   * own real numbers.
   */
  needsQuantification: boolean;

  quantificationExamples: string[];

  /**
   * Optional, purely advisory. Suggests aligning this text more
   * closely with the job description. Never affects `problems`,
   * `verdict`, or any score/percentage — it's a nudge, not a
   * requirement, since not every resume is written against a
   * specific JD.
   */
  jdAlignmentTip?: string;
}

// ============================================================
// ATS SECTION DEEP DIVE
//
// One per resume section (experience, projects, skills, ...).
// Sections are ordered by priority (critical -> high -> medium
// -> low) when returned to the frontend, not by the resume's
// own section order.
// ============================================================

export type ATSSectionDeepDivePriority = "critical" | "high" | "medium" | "low";

export interface ATSSectionDeepDive {
  sectionId: ATSScoreCategory;

  title: string;

  /**
   * Mirrors this section's ATSCategoryResult.percentage, so the
   * UI doesn't need to cross-reference two arrays.
   */
  percentage: number;

  /**
   * Derived from this section's ATSCategoryResult.status. Drives
   * both the priority badge shown in the UI and the sort order
   * of the deep-dive list itself.
   */
  priority: ATSSectionDeepDivePriority;

  /**
   * True only when every finding in this section is
   * "excellent" — lets the UI render a single compact summary
   * line instead of a list.
   */
  isFullyOptimized: boolean;

  /**
   * Used by every section except "skills" — one finding per
   * bullet/item, or a single finding representing the section
   * as a whole for sections that aren't itemized (contact,
   * formatting, education, summary, achievements).
   */
  findings: ATSFinding[];

  /**
   * Only present when sectionId === "skills". Skills are grouped
   * rather than itemized as individual findings, because a flat
   * list of 8+ "needs improvement" cards per missing skill is
   * noisy — a recruiter-style grouping (present / missing-and-
   * required / good-to-have) is far more scannable.
   */
  skillsBreakdown?: {
    /**
     * Required JD skills the resume already demonstrates. Plain
     * names only — these don't need a finding card, they're a
     * quick confirmation list.
     */
    requiredPresent: string[];

    /**
     * Required JD skills that are missing or only weakly
     * demonstrated. Each includes why it matters and a fix
     * suggestion, but the suggestion always defers to whether
     * the candidate genuinely has the skill.
     */
    requiredMissing: ATSFinding[];

    /**
     * Preferred (optional) JD skills that are missing. Framed as
     * "nice to have", never as something the candidate must add.
     */
    goodToHave: ATSFinding[];
  };
}

// ============================================================
// RULE-BASED ATS ANALYSIS
// ============================================================

export interface ATSRuleAnalysis {
  // ==========================================================
  // CORE SCORE
  // ==========================================================

  overallScore: number;

  breakdown: ATSBreakdown;

  categories: ATSCategoryResult[];

  // ==========================================================
  // CORE ANALYSES
  // ==========================================================

  contact: ATSContactAnalysis;

  sections: ATSSectionAnalysis;

  skills: ATSSkillsAnalysis;

  keywords: ATSKeywordAnalysis;

  semanticRelevance?: ATSSemanticRelevanceAnalysis;

  experience: ATSExperienceAnalysis;

  actionVerbs: ATSActionVerbAnalysis;

  quantifiedResults: ATSQuantifiedResultAnalysis;

  achievements?: ATSAchievementAnalysis;

  projects?: ATSProjectAnalysis;

  education?: ATSEducationAnalysis;

  formatting: ATSFormattingAnalysis;

  parseability?: ATSParseabilityAnalysis;

  dateConsistency?: ATSDateConsistencyAnalysis;

  contentQuality?: ATSContentQualityAnalysis;

  seniorityAlignment?: ATSSeniorityAlignmentAnalysis;

  // ==========================================================
  // MODE
  // ==========================================================

  mode?: ATSAnalysisMode;

  targetRole?: string;

  hasJobDescription?: boolean;

  // ==========================================================
  // JD INTELLIGENCE
  // ==========================================================

  jdAnalysis?: ATSJobDescriptionAnalysis;

  // ==========================================================
  // RESPONSIBILITY MATCHING
  // ==========================================================

  responsibilityAnalysis?: ATSResponsibilityAnalysis;

  // ==========================================================
  // SKILL EVIDENCE
  // ==========================================================

  skillEvidence?: ATSSkillEvidence[];

  // ==========================================================
  // ROLE READINESS
  // ==========================================================

  roleAnalysis?: ATSRoleReadinessAnalysis;

  // ==========================================================
  // SCORE EXPLANATION
  // ==========================================================

  scoreDimensions?: ATSScoreDimension[];

  scoreExplanation?: ATSScoreExplanation;

  // ==========================================================
  // QUICK WINS
  // ==========================================================

  quickWins?: ATSQuickWin[];

  // ==========================================================
  // SUMMARY
  // ==========================================================

  strengths: string[];

  weaknesses: string[];

  recommendations: ATSRecommendation[];
}

// ============================================================
// AI ANALYSIS RESULT
// ============================================================

export interface ATSAIAnalysis {
  strengths: string[];

  weaknesses: string[];

  matchedKeywords: string[];

  missingKeywords: string[];

  recommendations: ATSRecommendation[];

  optimizedSummary: string;

  improvedExperience: string[];
}

// ============================================================
// FINAL ATS RESULT
// ============================================================

export interface ATSResult {
  resumeId: string;

  // ==========================================================
  // ANALYSIS MODE
  // ==========================================================

  mode: ATSAnalysisMode;

  targetRole: string;

  hasJobDescription: boolean;

  // ==========================================================
  // FINAL SCORE
  // ==========================================================

  atsScore: number;

  grade: ATSGrade;

  // ==========================================================
  // RULE-BASED BREAKDOWN
  // ==========================================================

  breakdown: ATSBreakdown;

  categories: ATSCategoryResult[];

  // ==========================================================
  // KEYWORDS
  // ==========================================================

  matchedKeywords: string[];

  missingKeywords: string[];

  // ==========================================================
  // SECTION DEEP DIVE
  //
  // The main feedback surface. Ordered critical -> high ->
  // medium -> low. Every resume section gets an entry here
  // (summary, contact, skills, experience, projects, education,
  // formatting, achievements) — sections with nothing to fix are
  // still included with isFullyOptimized: true and an empty
  // findings array, rather than being silently omitted.
  // ==========================================================

  sectionDeepDive: ATSSectionDeepDive[];

  // ==========================================================
  // DATE ANALYSIS
  //
  // Fully deterministic (parses actual startDate/endDate values,
  // no AI involved) — kept as its own top-level field since it
  // spans multiple sections (experience/internships/education)
  // rather than belonging to just one.
  // ==========================================================

  dateConsistency?: ATSDateConsistencyAnalysis;

  // ==========================================================
  // AI / INTELLIGENCE
  // ==========================================================

  strengths: string[];

  weaknesses: string[];

  // ==========================================================
  // META
  // ==========================================================

  analyzedAt: string;
}

// ============================================================
// ATS GRADE
// ============================================================

export type ATSGrade = "A" | "B" | "C" | "D" | "F";

// ============================================================
// ATS ANALYSIS MODE
// ============================================================

export type ATSAnalysisMode = "role" | "job-description";

// ============================================================
// ATS ANALYSIS REQUEST
// ============================================================

export interface ATSAnalyzeRequest {
  resumeId: string;
  targetRole: string;
  jobDescription?: string;
  options?: ATSAnalysisOptions;
}

// ============================================================
// ATS ANALYSIS OPTIONS
// ============================================================

export interface ATSAnalysisOptions {
  includeAIAnalysis?: boolean;

  includeOptimizedSummary?: boolean;

  includeImprovedExperience?: boolean;

  includeKeywordAnalysis?: boolean;

  includeSemanticAnalysis?: boolean;

  includeParseabilityAnalysis?: boolean;

  includeContentQualityAnalysis?: boolean;

  includeDateConsistencyAnalysis?: boolean;

  includeSeniorityAnalysis?: boolean;
}

// ============================================================
// ATS TOTAL SCORE
// ============================================================

/**
 * Single source of truth for the current maximum ATS score.
 */
export const ATS_TOTAL_SCORE = ATS_SCORE_CATEGORIES.reduce(
  (total, category) => {
    return category.enabled ? total + category.maxScore : total;
  },
  0,
);

// ============================================================
// CATEGORY LOOKUP
// ============================================================

/**
 * Returns a category definition by ID.
 *
 * The scorer should use this instead of hard-coding max scores.
 */
export const getATSCategory = (
  categoryId: string,
): ATSScoreCategoryDefinition | undefined => {
  return ATS_SCORE_CATEGORIES.find((category) => category.id === categoryId);
};

// ============================================================
// SCORE HELPERS
// ============================================================

/**
 * Returns the configured maximum score for a category.
 */
export const getATSCategoryMaxScore = (categoryId: string): number => {
  return getATSCategory(categoryId)?.maxScore ?? 0;
};

/**
 * Checks whether a category is currently enabled.
 */
export const isATSCategoryEnabled = (categoryId: string): boolean => {
  return getATSCategory(categoryId)?.enabled ?? false;
};

// ============================================================
// GRADE THRESHOLDS
// ============================================================

export const ATS_GRADE_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  D: 60,
  F: 0,
} as const;

// ============================================================
// STANDARD RESUME SECTIONS
// ============================================================

export const ATS_STANDARD_SECTIONS = [
  "summary",
  "experience",
  "internships",
  "education",
  "skills",
  "projects",
  "certifications",
  "languages",
  "awards",
  "achievements",
  "interests",
  "strengths",
] as const;

// ============================================================
// ACTION VERBS
// ============================================================

export const ATS_ACTION_VERBS = [
  "achieved",
  "administered",
  "analyzed",
  "architected",
  "automated",
  "built",
  "collaborated",
  "configured",
  "created",
  "debugged",
  "delivered",
  "deployed",
  "designed",
  "developed",
  "engineered",
  "implemented",
  "improved",
  "increased",
  "integrated",
  "launched",
  "led",
  "maintained",
  "managed",
  "migrated",
  "monitored",
  "optimized",
  "reduced",
  "refactored",
  "resolved",
  "scaled",
  "streamlined",
  "tested",
  "transformed",
] as const;

// ============================================================
// WEAK BULLET PATTERNS
// ============================================================

export const ATS_WEAK_BULLET_PATTERNS = [
  /^worked on\b/i,
  /^responsible for\b/i,
  /^helped\b/i,
  /^involved in\b/i,
  /^participated in\b/i,
  /^handled\b/i,
  /^did\b/i,
  /^made\b/i,
  /^used\b/i,
  /^worked with\b/i,
] as const;

// ============================================================
// METRIC PATTERNS
// ============================================================

/**
 * IMPORTANT:
 *
 * These patterns intentionally avoid treating normal years such
 * as 2023 or 2026 as professional achievement metrics.
 *
 * Do NOT use .test() repeatedly on these global regexes.
 * Prefer String.match(), String.matchAll() or create a fresh
 * regex when necessary.
 */

// export const ATS_METRIC_PATTERNS = {
//   percentage: /\b\d+(?:\.\d+)?\s?%/gi,

//   currency: /(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s?\d+(?:[,.]\d+)?/gi,

//   time: /\b\d+(?:\.\d+)?\s?(?:days?|weeks?|months?|years?|hours?|mins?|minutes?)\b/gi,

//   /**
//    * Numbers associated with measurable impact.
//    *
//    * Examples:
//    * 500+ users
//    * 30% faster
//    * 20 requests/sec
//    * 5 engineers
//    *
//    * Standalone years such as 2023 are intentionally excluded.
//    */
//   impactNumber:
//     /\b\d+(?:\.\d+)?\+?\s?(?:users?|customers?|clients?|requests?|records?|items?|projects?|engineers?|developers?|members?|employees?|teams?|days?|weeks?|months?|years?|hours?|minutes?|seconds?|ms|x|times?)\b/gi,
// } as const;

// ============================================================
// COMMON DATE / YEAR PATTERN
// ============================================================

export const ATS_METRIC_PATTERNS = {
  percentage: /\b\d+(?:\.\d+)?\s?%/gi,

  currency: /(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s?\d+(?:[,.]\d+)?/gi,

  time: /\b\d+(?:\.\d+)?\s?(?:days?|weeks?|months?|years?|hours?|mins?|minutes?)\b/gi,

  impactNumber:
    /\b\d+(?:\.\d+)?\+?\s?(?:users?|customers?|clients?|requests?|records?|items?|projects?|engineers?|developers?|members?|employees?|teams?|days?|weeks?|months?|years?|hours?|minutes?|seconds?|ms|x|times?|reports?|issues?|bugs?|features?|apis?|endpoints?|components?|tickets?|tasks?|releases?|modules?|screens?|pages?|commits?|deployments?|tests?|leads?|transactions?|sessions?|downloads?)\b/gi,

  // NEW: a number directly followed by "+" is inherently a quantifier
  // ("500+", "10+", "15+") no matter what noun comes after it.
  plusQuantifier: /\b\d+(?:\.\d+)?\+/g,
} as const;

export const ATS_YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;

// ============================================================
// URL PATTERN
// ============================================================

export const ATS_URL_PATTERN = /https?:\/\/[^\s]+/gi;

// ============================================================
// EMAIL PATTERN
// ============================================================

export const ATS_EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

// ============================================================
// PHONE PATTERN
// ============================================================

export const ATS_PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;

// ============================================================
// SCORE NORMALIZATION
// ============================================================

/**
 * Converts any raw score into a valid range.
 */
export const clampATSScore = (score: number, min = 0, max = 100): number => {
  if (!Number.isFinite(score)) {
    return min;
  }

  return Math.min(Math.max(score, min), max);
};

// ============================================================
// PERCENTAGE CALCULATION
// ============================================================

export const calculateATSPercentage = (
  score: number,
  maxScore: number,
): number => {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return 0;
  }

  return Number(((score / maxScore) * 100).toFixed(2));
};

// ============================================================
// ATS STATUS
// ============================================================

export const getATSCategoryStatus = (percentage: number): ATSCategoryStatus => {
  if (percentage >= 90) {
    return "excellent";
  }

  if (percentage >= 75) {
    return "good";
  }

  if (percentage >= 50) {
    return "needs-improvement";
  }

  return "poor";
};

// ============================================================
// SECTION DEEP DIVE PRIORITY
//
// Maps an already-computed category status/percentage into the
// priority used to order and badge the section deep dive. Reuses
// the exact thresholds getATSCategoryStatus already applies, so
// the deep dive stays consistent with the score breakdown shown
// elsewhere in the UI.
// ============================================================

export const getATSSectionDeepDivePriority = (
  status: ATSCategoryStatus,
  percentage: number,
): ATSSectionDeepDivePriority => {
  if (status === "excellent") {
    return "low";
  }

  if (status === "good") {
    return "low";
  }

  if (status === "needs-improvement") {
    return percentage < 60 ? "high" : "medium";
  }

  // status === "poor"
  return "critical";
};

// ============================================================
// ATS GRADE
// ============================================================

export const getATSGrade = (score: number): ATSGrade => {
  const normalizedScore = clampATSScore(score, 0, 100);

  if (normalizedScore >= 90) {
    return "A";
  }

  if (normalizedScore >= 80) {
    return "B";
  }

  if (normalizedScore >= 70) {
    return "C";
  }

  if (normalizedScore >= 60) {
    return "D";
  }

  return "F";
};
