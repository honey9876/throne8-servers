import mongoose, { Schema, Document } from "mongoose";

export const ResumeStatus = {
  DRAFT: "draft",
  COMPLETED: "completed",
} as const;

export const ResumeTemplates = {
  TECHNICAL: "technical-developer",
  MODERN: "modern-professional",
  MINIMAL: "minimal-clean",
} as const;

export const DefaultResumeSections = [
  {
    id: "personalInfo",
    type: "personalInfo",
    title: "Personal Info",
    enabled: true,
    order: 1,
  },
  {
    id: "summary",
    type: "summary",
    title: "Summary",
    displayTitle: "",
    enabled: true,
    order: 2,
  },
  {
    id: "experience",
    type: "experience",
    title: "Experience",
    displayTitle: "",
    enabled: true,
    order: 3,
  },

  {
    id: "internships",
    type: "internships",
    title: "Internships",
    displayTitle: "",
    enabled: true,
    order: 4,
  },

  {
    id: "education",
    type: "education",
    title: "Education",
    displayTitle: "",
    enabled: true,
    order: 5,
  },
  {
    id: "skills",
    type: "skills",
    title: "Skills",
    displayTitle: "",
    enabled: true,
    order: 6,
  },
  {
    id: "projects",
    type: "projects",
    title: "Projects",
    displayTitle: "",
    enabled: true,
    order: 7,
  },
  {
    id: "languages",
    type: "languages",
    title: "Languages",
    displayTitle: "",
    enabled: true,
    order: 8,
  },
  {
    id: "certifications",
    type: "certifications",
    title: "Certificates",
    displayTitle: "",
    enabled: true,
    order: 9,
  },
  {
    id: "awards",
    type: "awards",
    title: "Awards",
    displayTitle: "",
    enabled: true,
    order: 10,
  },
  {
    id: "interests",
    type: "interests",
    title: "Interests",
    displayTitle: "",
    enabled: true,
    order: 11,
  },
  {
    id: "strengths",
    type: "strengths",
    title: "Strengths",
    displayTitle: "",
    enabled: true,
    order: 12, // apne order ke hisab se
  },

  {
    id: "achievements",
    type: "achievements",
    title: "Achievements",
    displayTitle: "",
    enabled: true,
    order: 13,
  },
];
// ==================== INTERFACE ====================

export interface IResume extends Document {
  userId: string;

  title: string;
  version: number;
  targetRole?: string;
  status: "draft" | "completed";

  // Sharing
  shareId: string | null;
  isPublic: boolean;

  sections: {
    id: string;
    type: string;
    title: string;
    enabled: boolean;
    order: number;
  }[];
  strengths: {
    title: string;
    description: string;
  }[];

  personalInfo: {
    fullName: string;
    title: string;
    email: string;
    phone?: string;
    address?: string;
    linkedIn?: string;
    github?: string;
    portfolio?: string;
    photo?: string;
    photoZoom?: number;
    photoPosition?: { x: number; y: number };
  };

  summary?: string;

  // Fixed: Categorized skills
  skills: {
    title: string;
    skills: string[];
  }[];

  experience: {
    company: string;
    position: string;
    startDate: string;
    endDate?: string;
    currentlyWorking?: boolean;
    responsibilities: string[];
    achievements: string[];
    location?: string;
  }[];

  achievements: string[];

  education: {
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startYear: number;
    endYear?: number;
    cgpa?: string;
  }[];
  internships: {
    company: string;
    role: string;
    startDate: string;
    endDate?: string;
    currentlyInterning?: boolean;
    responsibilities: string[];
    achievements: string[];
  }[];

  projects: {
    title: string;
    role?: string;
    startDate: string;
    endDate?: string;
    currentlyWorking?: boolean;
    description: string[];
    highlight?: string;
    technologies: string[];
    github?: string;
    link?: string;
  }[];

  certifications: string[];
  languages: {
    name: string;
    level: string;
  }[];
  awards: string[];
  interests: string[];

  customSections: {
    id: string;
    type: "custom";
    title: string;
    enabled: boolean;
    order: number;
    items: {
      id: string;
      title: string;
      subtitle?: string;
      startDate?: string;
      endDate?: string;
      description?: string;
    }[];
  }[];

  templateId: string;

  createdAt: Date;
  updatedAt: Date;
}

// ==================== SUB SCHEMAS ====================

const ResumeSectionSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, required: true },
    displayTitle: {
      type: String,
      default: "",
    },
  },
  { _id: false },
);

const customSectionItemSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const skillCategorySchema = new Schema(
  {
    title: { type: String, required: true },
    skills: { type: [String], default: [] },
  },
  { _id: false },
);

const languageItemSchema = new Schema(
  {
    name: { type: String, required: true },
    level: { type: String, default: "" },
  },
  { _id: false },
);

const customSectionSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, default: "custom" },
    title: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, required: true },
    items: { type: [customSectionItemSchema], default: [] },
  },
  { _id: false },
);

// ==================== MAIN SCHEMA ====================

const resumeSchema = new Schema<IResume>(
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

    version: {
      type: Number,
      default: 1,
    },

    targetRole: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: Object.values(ResumeStatus),
      default: ResumeStatus.DRAFT,
    },

    shareId: {
      type: String,
      default: null,
    },

    isPublic: {
      type: Boolean,
      default: false,
    },

    personalInfo: {
      fullName: { type: String, default: "", trim: true },
      title: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true, lowercase: true },
      phone: { type: String, default: "" },
      address: { type: String, default: "" },
      linkedIn: { type: String, default: "" },
      github: { type: String, default: "" },
      portfolio: { type: String, default: "" },
      photo: { type: String, default: "" },
      photoZoom: { type: Number, default: 1 },
      photoPosition: {
        x: { type: Number, default: 0 },
        y: { type: Number, default: 0 },
      },
    },

    summary: {
      type: String,
      default: "",
    },

    // ✅ Fixed: Now matches interface (array of categories)
    skills: {
      type: [skillCategorySchema],
      default: [
        { title: "Languages", skills: [] },
        { title: "Frameworks", skills: [] },
        { title: "Databases", skills: [] },
        { title: "Tools", skills: [] },
        { title: "Others", skills: [] },
      ],
    },

    experience: [
      {
        company: { type: String, required: true },
        position: { type: String, required: true },
        startDate: { type: String, required: true },
        endDate: { type: String, default: "" },
        currentlyWorking: { type: Boolean, default: false },
        responsibilities: { type: [String], default: [] },
        achievements: { type: [String], default: [] },
        location: { type: String, default: "" },
        technologies: { type: [String], default: [] },
      },
    ],

    education: [
      {
        institution: { type: String, required: true },
        degree: { type: String, required: true },
        fieldOfStudy: { type: String, required: true },

        location: { type: String, default: "" },

        startMonth: { type: String, default: "" },
        startYear: { type: Number, required: true },

        endMonth: { type: String, default: "" },
        endYear: { type: Number },

        current: { type: Boolean, default: false },

        cgpa: { type: String, default: "" },

        coursework: { type: String, default: "" },
      },
    ],

    internships: [
      {
        company: { type: String, required: true },
        role: { type: String, required: true },
        startDate: { type: String, required: true },
        endDate: { type: String, default: "" },
        currentlyInterning: { type: Boolean, default: false },
        responsibilities: { type: [String], default: [] },
        achievements: { type: [String], default: [] },
      },
    ],

    projects: [
      {
        title: { type: String, required: true },

        role: { type: String, default: "" },

        startDate: { type: String, default: "" },

        endDate: { type: String, default: "" },

        currentlyWorking: {
          type: Boolean,
          default: false,
        },

        description: {
          type: [String],
          required: true,
        },
        highlight: {
          type: String,
          default: "",
        },

        technologies: {
          type: [String],
          default: [],
        },

        github: {
          type: String,
          default: "",
        },

        link: {
          type: String,
          default: "",
        },
      },
    ],

    strengths: [
      {
        title: {
          type: String,
          default: "",
        },
        description: {
          type: String,
          default: "",
        },
      },
    ],

    certifications: { type: [String], default: [] },
    languages: { type: [languageItemSchema], default: [] },
    awards: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    achievements: {
      type: [String],
      default: [],
    },

    customSections: {
      type: [customSectionSchema],
      default: [],
    },

    templateId: {
      type: String,
      default: ResumeTemplates.TECHNICAL,
    },

    sections: {
      type: [ResumeSectionSchema],
      default: DefaultResumeSections,
    },
  },

  {
    timestamps: true,
  },
);

// Indexes
resumeSchema.index({ userId: 1, updatedAt: -1 });
resumeSchema.index({ userId: 1, title: 1 });
resumeSchema.index({ shareId: 1 });
resumeSchema.index({ isPublic: 1, shareId: 1 });

export const Resume =
  (mongoose.models["ResumeBuilder"] as mongoose.Model<IResume>) ||
  mongoose.model<IResume>("ResumeBuilder", resumeSchema, "resumes");
