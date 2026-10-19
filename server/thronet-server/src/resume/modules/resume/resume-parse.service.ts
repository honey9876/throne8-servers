import { PDFParse } from "pdf-parse";

import { ApiError } from "../../utils/ApiError";
import {
  extractResumeStructure,
  type ExtractedResumeStructure,
} from "../ats/ats.service";
import {
  DefaultResumeSections,
  Resume,
  ResumeStatus,
  ResumeTemplates,
} from "../../models/resume.model";
import { toSafeUrl } from "../../utils/url";
const MIN_RESUME_TEXT_LENGTH = 80;

const DEFAULT_SKILL_CATEGORIES = [
  { title: "Languages", skills: [] as string[] },
  { title: "Frameworks", skills: [] as string[] },
  { title: "Databases", skills: [] as string[] },
  { title: "Tools", skills: [] as string[] },
  { title: "Others", skills: [] as string[] },
];

export interface RegexContactFields {
  email?: string;
  phone?: string;
  linkedIn?: string;
  github?: string;
  portfolio?: string;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/\n|•|●|;/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/\d{4}/);
    if (match) {
      return Number(match[0]);
    }
  }

  return undefined;
};

const asBoolean = (value: unknown): boolean => value === true;

export const cleanExtractedText = (text: string): string => {
  return text
    .replace(/\0/g, "")
    .replace(/[^\t\n\r\x20-\x7E\u00A0-\uFFFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const extractTextFromPdf = async (buffer: Buffer): Promise<string> => {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const text = cleanExtractedText(result.text ?? "");

    if (text.length < MIN_RESUME_TEXT_LENGTH) {
      throw new ApiError(
        400,
        "Could not read enough text from this PDF. It may be scanned, image-only, or corrupted. Please upload a text-based PDF.",
      );
    }

    return text;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      400,
      "This PDF could not be read. Please upload a valid, uncorrupted, text-based PDF resume.",
    );
  } finally {
    await parser.destroy();
  }
};

export const extractContactWithRegex = (text: string): RegexContactFields => {
  const emailMatch = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );

  const phoneMatch = text.match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{3,4}(?:[\s.-]?\d{3,4})?/,
  );

  const urlMatches =
    text.match(
      /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(?:\/[^\s<>"'|]*)?/gi,
    ) ?? [];

  const normalizeUrl = (url: string) => {
    const trimmed = url.replace(/[),.;]+$/, "");
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  let linkedIn: string | undefined;
  let github: string | undefined;
  let portfolio: string | undefined;

  for (const raw of urlMatches) {
    const url = normalizeUrl(raw);
    let hostname = "";

    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }

    if (!linkedIn && hostname.includes("linkedin.com")) {
      linkedIn = url;
      continue;
    }

    if (!github && hostname.includes("github.com")) {
      github = url;
      continue;
    }

    if (
      !portfolio &&
      !hostname.includes("linkedin.com") &&
      !hostname.includes("github.com")
    ) {
      portfolio = url;
    }
  }

  const phone = phoneMatch?.[0]?.trim();
  const looksLikePhone =
    !!phone && (phone.replace(/\D/g, "").length >= 10 || phone.includes("+"));

  return {
    email: emailMatch?.[0]?.trim(),
    phone: looksLikePhone ? phone : undefined,
    linkedIn,
    github,
    portfolio,
  };
};

const mergeContactField = (
  regexValue: string | undefined,
  geminiValue: unknown,
): string => {
  if (regexValue && regexValue.trim()) {
    return regexValue.trim();
  }

  return asString(geminiValue);
};

const normalizeSkills = (
  skills: ExtractedResumeStructure["skills"],
): Array<{ title: string; skills: string[] }> => {
  if (!Array.isArray(skills) || skills.length === 0) {
    return DEFAULT_SKILL_CATEGORIES;
  }

  const normalized = skills
    .map((category) => ({
      title: asString(category?.title) || "Others",
      skills: asStringArray(category?.skills),
    }))
    .filter((category) => category.skills.length > 0);

  return normalized.length > 0 ? normalized : DEFAULT_SKILL_CATEGORIES;
};

const mergeParsedResume = (
  regexContact: RegexContactFields,
  structured: ExtractedResumeStructure,
) => {
  const personalInfo = structured.personalInfo ?? {};

  return {
    personalInfo: {
      fullName: asString(personalInfo.fullName),
      title: asString(personalInfo.title),
      email: mergeContactField(regexContact.email, personalInfo.email),
      phone: mergeContactField(regexContact.phone, personalInfo.phone),
      address: asString(personalInfo.address),
      linkedIn: toSafeUrl(
        mergeContactField(regexContact.linkedIn, personalInfo.linkedIn),
      ),
      github: toSafeUrl(
        mergeContactField(regexContact.github, personalInfo.github),
      ),
      portfolio: toSafeUrl(
        mergeContactField(regexContact.portfolio, personalInfo.portfolio),
      ),
      photo: "",
    },
    summary: asString(structured.summary),
    skills: normalizeSkills(structured.skills),
    experience: Array.isArray(structured.experience)
      ? structured.experience
          .map((item) => ({
            company: asString(item?.company),
            position: asString(item?.position),
            startDate: asString(item?.startDate),
            endDate: asString(item?.endDate),
            currentlyWorking: asBoolean(item?.currentlyWorking),
            responsibilities: asStringArray(item?.responsibilities),
            achievements: asStringArray(item?.achievements),
            location: asString(item?.location),
          }))
          .filter((item) => item.company && item.position && item.startDate)
      : [],
    internships: Array.isArray(structured.internships)
      ? structured.internships
          .map((item) => ({
            company: asString(item?.company),
            role: asString(item?.role),
            startDate: asString(item?.startDate),
            endDate: asString(item?.endDate),
            currentlyInterning: asBoolean(item?.currentlyInterning),
            responsibilities: asStringArray(item?.responsibilities),
            achievements: asStringArray(item?.achievements),
          }))
          .filter((item) => item.company && item.role && item.startDate)
      : [],
    education: Array.isArray(structured.education)
      ? structured.education.flatMap((item) => {
          const startYear = asNumber(item?.startYear);
          const institution = asString(item?.institution);
          const degree = asString(item?.degree);

          if (!institution || !degree || !startYear) {
            return [];
          }

          return [
            {
              institution,
              degree,
              fieldOfStudy: asString(item?.fieldOfStudy) || "N/A",
              startYear,
              endYear: asNumber(item?.endYear),
              cgpa: asString(item?.cgpa),
            },
          ];
        })
      : [],
    projects: Array.isArray(structured.projects)
      ? structured.projects
          .map((item) => ({
            title: asString(item?.title),
            role: asString(item?.role),
            startDate: asString(item?.startDate),
            endDate: asString(item?.endDate),
            currentlyWorking: asBoolean(item?.currentlyWorking),
            description: asStringArray(item?.description),
            technologies: asStringArray(item?.technologies),
            link: toSafeUrl(item?.link),
            github: toSafeUrl(item?.github),
          }))
          .filter((item) => item.title && item.description.length > 0)
      : [],
    certifications: asStringArray(structured.certifications),
    languages: Array.isArray(structured.languages)
      ? structured.languages
          .map((item) => ({
            name: asString(item?.name),
            level: asString(item?.level),
          }))
          .filter((item) => item.name)
      : [],
    awards: asStringArray(structured.awards),
    interests: asStringArray(structured.interests),
    customSections: Array.isArray(structured.customSections)
      ? structured.customSections
          .filter((section) => asString(section?.title))
          .map((section, sectionIndex) => ({
            id: asString(section?.id) || `custom-${sectionIndex + 1}`,
            type: "custom" as const,
            title: asString(section?.title),
            enabled: section?.enabled !== false,
            order:
              typeof section?.order === "number"
                ? section.order
                : 100 + sectionIndex,
            items: Array.isArray(section?.items)
              ? section.items
                  .filter((item) => asString(item?.title))
                  .map((item, itemIndex) => ({
                    id: asString(item?.id) || `custom-item-${itemIndex + 1}`,
                    title: asString(item?.title),
                    subtitle: asString(item?.subtitle),
                    startDate: asString(item?.startDate),
                    endDate: asString(item?.endDate),
                    description: asString(item?.description),
                  }))
              : [],
          }))
      : [],
  };
};

const titleFromFilename = (filename?: string): string => {
  if (!filename) {
    return "Uploaded Resume";
  }

  const withoutExt = filename.replace(/\.pdf$/i, "").trim();
  return withoutExt || "Uploaded Resume";
};

export const parseAndCreateResume = async (params: {
  userId: string;
  fileBuffer: Buffer;
  originalFilename?: string;
  templateId?: string;
}) => {
  const text = await extractTextFromPdf(params.fileBuffer);
  const regexContact = extractContactWithRegex(text);

  let structured: ExtractedResumeStructure;

  try {
    structured = await extractResumeStructure(text, regexContact);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to structure the resume. Please try again.";

    throw new ApiError(502, message);
  }

  const merged = mergeParsedResume(regexContact, structured);
  const fullName = merged.personalInfo.fullName;

  const resume = await Resume.create({
    userId: params.userId,
    title: fullName
      ? `${fullName}'s Resume`
      : titleFromFilename(params.originalFilename),
    targetRole: merged.personalInfo.title,
    templateId: params.templateId || ResumeTemplates.TECHNICAL,
    sections: DefaultResumeSections,
    version: 1,
    status: ResumeStatus.DRAFT,
    personalInfo: merged.personalInfo,
    summary: merged.summary,
    skills: merged.skills,
    experience: merged.experience,
    internships: merged.internships,
    education: merged.education,
    projects: merged.projects,
    certifications: merged.certifications,
    languages: merged.languages,
    awards: merged.awards,
    interests: merged.interests,
    customSections: merged.customSections,
    strengths: [],
    achievements: [],
  });

  return resume;
};

export const parseAndFillResume = async (params: {
  userId: string;
  resumeId: string;
  fileBuffer: Buffer;
}) => {
  const existingResume = await Resume.findOne({
    _id: params.resumeId,
    userId: params.userId,
  });

  if (!existingResume) {
    throw new ApiError(404, "Resume not found.");
  }

  const text = await extractTextFromPdf(params.fileBuffer);
  const regexContact = extractContactWithRegex(text);

  let structured: ExtractedResumeStructure;

  try {
    structured = await extractResumeStructure(text, regexContact);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to structure the resume. Please try again.";

    throw new ApiError(502, message);
  }

  const merged = mergeParsedResume(regexContact, structured);

  existingResume.personalInfo = merged.personalInfo;
  existingResume.targetRole =
    merged.personalInfo.title || existingResume.targetRole;
  existingResume.summary = merged.summary;
  existingResume.skills = merged.skills;
  existingResume.experience = merged.experience;
  existingResume.internships = merged.internships;
  existingResume.education = merged.education;
  existingResume.projects = merged.projects;
  existingResume.certifications = merged.certifications;
  existingResume.languages = merged.languages;
  existingResume.awards = merged.awards;
  existingResume.interests = merged.interests;
  existingResume.customSections = merged.customSections;

  await existingResume.save();

  return existingResume;
};
