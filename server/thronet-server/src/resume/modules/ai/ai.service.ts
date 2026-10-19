import { generateContent, generateJSON } from "../../providers/gemini.provider";

import { buildSummaryPrompt } from "../../prompts/summary.prompt";
import { buildExperiencePrompt } from "../../prompts/rewrite-experience.prompt";
import { buildSkillsPrompt } from "../../prompts/suggest-skills.prompt";
import { buildProjectPrompt } from "../../prompts/generate-project.prompt";
import { buildGenerateExperiencePrompt } from "../../prompts/generate-experience.prompt";
import { buildProjectDescriptionPrompt } from "../../prompts/project-description.prompt";
import { buildCourseworkPrompt } from "../../prompts/coursework.prompt";
import { buildCustomSectionPrompt } from "../../prompts/custom-section.prompt";
import { buildGenerateResumePrompt } from "../../prompts/generate-general-resume.prompt";

export const generateSummaryService = async (resume: any) => {
  const prompt = buildSummaryPrompt(resume);
  return generateContent(prompt);
};

export const rewriteExperienceService = async (
  experience: string,
  targetRole: string,
) => {
  const prompt = buildExperiencePrompt(experience, targetRole);
  return generateContent(prompt);
};

export const suggestSkillsService = async (
  resume: any,
  selectedCategory?: string,
) => {
  const prompt = buildSkillsPrompt(resume, selectedCategory);
  return generateJSON<string[]>(prompt);
};

export const generateProjectService = async (
  projectName: string,
  technologies: string[],
  context?: {
    whatBuilt?: string;
    problemSolved?: string;
    teamSize?: string;
    impact?: string;
  },
) => {
  const prompt = buildProjectPrompt(projectName, technologies, context);
  return generateJSON<string[]>(prompt);
};

export const generateExperienceService = async (
  company: string,
  position: string,
  context?: {
    workedOn?: string;
    technologies?: string;
    scope?: string;
    impact?: string;
  },
) => {
  const prompt = buildGenerateExperiencePrompt(company, position, context);
  return generateJSON<string[]>(prompt);
};

export const generateProjectDescriptionService = async (
  projectName: string,
  technologies: string[],
  context?: {
    whatBuilt?: string;
    problemSolved?: string;
    teamSize?: string;
    impact?: string;
  },
) => {
  const prompt = buildProjectDescriptionPrompt(
    projectName,
    technologies,
    context,
  );
  return generateJSON<string[]>(prompt);
};

export const generateCourseworkService = async (
  degree: string,
  fieldOfStudy: string,
  targetRole?: string,
) => {
  const prompt = buildCourseworkPrompt(degree, fieldOfStudy, targetRole);
  return generateContent(prompt);
};

export const generateCustomSectionService = async (
  sectionType: string,
  itemTitle: string,
  itemSubtitle: string | undefined,
  context?: {
    whatDone?: string;
    problemSolved?: string;
    teamRole?: string;
    result?: string;
  },
) => {
  const prompt = buildCustomSectionPrompt(
    sectionType,
    itemTitle,
    itemSubtitle,
    context,
  );
  return generateContent(prompt);
};

import { buildInternshipPrompt } from "../../prompts/internship.prompt";

export const generateInternshipService = async (
  company: string,
  role: string,
  context?: {
    whatDone?: string;
    toolsUsed?: string;
    mentorTeam?: string;
    result?: string;
  },
) => {
  const prompt = buildInternshipPrompt(company, role, context);
  return generateContent(prompt);
};

export const generateFullResumeService = async (formData: any) => {
  const prompt = buildGenerateResumePrompt(formData);
  return generateJSON<any>(prompt); // type this against IResume once you're ready
};

import { buildGenerateCoverLetterPrompt } from "../../prompts/generate-cover-letter.prompt";
import {
  buildRegenerateCoverLetterPrompt,
  type RegenerateCoverLetterTarget,
} from "../../prompts/regenerate-cover-letter.prompt";

export const generateCoverLetterService = async (input: {
  targetRole: string;
  jobDescription?: string;
  companyName?: string;
  companyInfo?: string;
  candidateProfile: unknown;
}) => {
  const prompt = buildGenerateCoverLetterPrompt(input);
  return generateJSON<any>(prompt);
};

export const regenerateCoverLetterSectionService = async (input: {
  currentLetter: unknown;
  target: RegenerateCoverLetterTarget;
  reason: string;
}) => {
  const prompt = buildRegenerateCoverLetterPrompt(input);
  return generateJSON<any>(prompt);
};
