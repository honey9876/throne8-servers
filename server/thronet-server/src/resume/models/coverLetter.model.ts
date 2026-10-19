import mongoose, { Schema, Document } from "mongoose";

export const CoverLetterTemplates = {
  CLASSIC_FORMAL: "classic-formal",
} as const;

export interface ICoverLetterPersonalInfo {
  fullName: string;
  location?: string;
  phone?: string;
  email?: string;
  github?: string;
  linkedIn?: string;
}

export interface ICoverLetterRecipient {
  date: string;
  recipientName: string;
  companyName: string;
  companyLocation?: string;
  subject?: string;
  greeting: string;
}

export interface ICoverLetterBody {
  opening: string;
  paragraphs: string[];
  closing: string;
}

export interface ICoverLetterClosing {
  signOff: string;
  fullName: string;
}

export interface ICoverLetter extends Document {
  userId: string;
  title: string;
  targetRole: string;
  templateId: string;
  personalInfo: ICoverLetterPersonalInfo;
  recipient: ICoverLetterRecipient;
  body: ICoverLetterBody;
  closing: ICoverLetterClosing;
  createdAt: Date;
  updatedAt: Date;
}

const coverLetterSchema = new Schema<ICoverLetter>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    targetRole: {
      type: String,
      default: "",
      trim: true,
    },

    templateId: {
      type: String,
      default: CoverLetterTemplates.CLASSIC_FORMAL,
    },

    personalInfo: {
      fullName: { type: String, default: "" },
      location: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      github: { type: String, default: "" },
      linkedIn: { type: String, default: "" },
    },

    recipient: {
      date: { type: String, default: "" },
      recipientName: { type: String, default: "Hiring Manager" },
      companyName: { type: String, default: "" },
      companyLocation: { type: String, default: "" },
      subject: { type: String, default: "" },
      greeting: { type: String, default: "Dear Hiring Manager," },
    },

    body: {
      opening: { type: String, default: "" },
      paragraphs: { type: [String], default: [] },
      closing: { type: String, default: "" },
    },

    closing: {
      signOff: { type: String, default: "Sincerely," },
      fullName: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

coverLetterSchema.index({ userId: 1, updatedAt: -1 });

export const CoverLetter =
  (mongoose.models["CoverLetter"] as mongoose.Model<ICoverLetter>) ||
  mongoose.model<ICoverLetter>(
    "CoverLetter",
    coverLetterSchema,
  );
