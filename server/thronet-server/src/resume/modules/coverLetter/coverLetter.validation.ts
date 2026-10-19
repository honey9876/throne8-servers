import { z } from "zod";

export const createCoverLetterSchema = z.object({
  title: z.string().min(2, "Cover letter name is required"),

  targetRole: z.string().min(1, "Target role is required"),

  templateId: z.string().optional(),

  // Optional — present when creating from an AI-generated draft, so the
  // full generated content is saved in the same create call instead of
  // being created empty and immediately patched.
  personalInfo: z
    .object({
      fullName: z.string().optional(),
      location: z.string().optional(),
      phone: z.string().optional(),
      email: z.union([z.string().email(), z.literal("")]).optional(),
      github: z.string().optional(),
      linkedIn: z.string().optional(),
    })
    .partial()
    .optional(),

  recipient: z
    .object({
      date: z.string().optional(),
      recipientName: z.string().optional(),
      companyName: z.string().optional(),
      companyLocation: z.string().optional(),
      subject: z.string().optional(),
      greeting: z.string().optional(),
    })
    .partial()
    .optional(),

  body: z
    .object({
      opening: z.string().optional(),
      paragraphs: z.array(z.string()).optional(),
      closing: z.string().optional(),
    })
    .partial()
    .optional(),

  closing: z
    .object({
      signOff: z.string().optional(),
      fullName: z.string().optional(),
    })
    .partial()
    .optional(),
});

export const updateCoverLetterSchema = z.object({
  title: z.string().min(2).optional(),

  targetRole: z.string().optional(),

  templateId: z.string().optional(),

  personalInfo: z
    .object({
      fullName: z.string().optional(),
      location: z.string().optional(),
      phone: z.string().optional(),
      email: z.union([z.string().email(), z.literal("")]).optional(),
      github: z.string().optional(),
      linkedIn: z.string().optional(),
    })
    .partial()
    .optional(),

  recipient: z
    .object({
      date: z.string().optional(),
      recipientName: z.string().optional(),
      companyName: z.string().optional(),
      companyLocation: z.string().optional(),
      subject: z.string().optional(),
      greeting: z.string().optional(),
    })
    .partial()
    .optional(),

  body: z
    .object({
      opening: z.string().optional(),
      paragraphs: z.array(z.string()).optional(),
      closing: z.string().optional(),
    })
    .partial()
    .optional(),

  closing: z
    .object({
      signOff: z.string().optional(),
      fullName: z.string().optional(),
    })
    .partial()
    .optional(),
});
