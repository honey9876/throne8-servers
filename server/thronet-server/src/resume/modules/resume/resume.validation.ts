import { z } from "zod";
import { toSafeUrl } from "../../utils/url";

const safeUrlField = z.preprocess(
  (value) => toSafeUrl(value),
  z.union([z.string().url(), z.literal("")]),
);

const experienceSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  position: z.string().min(1, "Position is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  currentlyWorking: z.boolean().optional(),
  responsibilities: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),
  location: z.string().optional(),
  technologies: z.array(z.string()).optional(),
});

const educationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1),
  fieldOfStudy: z.string().min(1),

  location: z.string().optional(),

  startMonth: z.string().optional(),
  startYear: z.number(),

  endMonth: z.string().optional(),
  endYear: z.number().optional(),

  current: z.boolean().optional(),

  cgpa: z.string().optional(),

  coursework: z.string().optional(),
});

const internshipSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  currentlyInterning: z.boolean().optional(),
  responsibilities: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),
  location: z.string().optional(),
});

const projectSchema = z.object({
  title: z.string().min(1),

  role: z.string().optional(),

  startDate: z.string().optional(),

  endDate: z.string().optional(),

  currentlyWorking: z.boolean().optional(),

  description: z.array(z.string()),

  highlight: z.string().optional(),

  technologies: z.array(z.string()),

  link: safeUrlField.optional(),
  github: safeUrlField.optional(),
});

const skillCategorySchema = z.object({
  title: z.string().min(1, "Skill category title is required"),
  skills: z.array(z.string()),
});

const languageSchema = z.object({
  name: z.string().min(1),
  level: z.string().optional(),
});

const resumeSectionSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  enabled: z.boolean(),
  order: z.number(),
  displayTitle: z.string().optional(),
});

const customSectionItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

const customSectionSchema = z.object({
  id: z.string(),
  type: z.literal("custom"),
  title: z.string().min(1),
  enabled: z.boolean(),
  order: z.number(),
  items: z.array(customSectionItemSchema),
});

export const createResumeSchema = z.object({
  title: z.string().min(2, "Resume title is required"),

  version: z.number().optional(),

  targetRole: z.string().optional(),

  personalInfo: z
    .object({
      fullName: z.string().optional(),
      title: z.string().optional(),
      email: z.union([z.string().email(), z.literal("")]).optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      linkedIn: safeUrlField.optional(),
      github: safeUrlField.optional(),
      portfolio: safeUrlField.optional(),
      photo: z.string().optional(),
      photoZoom: z.number().optional(),
      photoPosition: z
        .object({
          x: z.number(),
          y: z.number(),
        })
        .optional(),
    })
    .optional(),

  summary: z.string().optional(),

  skills: z.array(skillCategorySchema).optional(),

  experience: z.array(experienceSchema).optional(),

  education: z.array(educationSchema).optional(),

  internships: z.array(internshipSchema).optional(),

  projects: z.array(projectSchema).optional(),

  certifications: z.array(z.string()).optional(),

  languages: z.array(languageSchema).optional(),

  awards: z.array(z.string()).optional(),

  interests: z.array(z.string()).optional(),
  achievements: z.array(z.string()).optional(),

  templateId: z.string().optional(),

  sections: z.array(resumeSectionSchema).optional(),

  customSections: z.array(customSectionSchema).optional(),
  strengths: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
});

export const updateResumeSchema = createResumeSchema.partial();
