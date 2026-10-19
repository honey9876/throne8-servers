 



import mongoose, {
  Schema,
  Document,
} from "mongoose";

export interface IResumeAnalysis
  extends Document {
  userId: string;

  resumeId: mongoose.Types.ObjectId;

  jobDescription: string;

  atsScore: number;

  grade:
    | "A"
    | "B"
    | "C"
    | "D"
    | "F";

  /**
   * Dynamic ATS category scores.
   *
   * Example:
   *
   * {
   *   contact: 9,
   *   sections: 13,
   *   skills: 14,
   *   keywords: 17,
   *   experience: 12,
   *   actionVerbs: 8,
   *   quantifiedResults: 4,
   *   formatting: 9
   * }
   */
  breakdown: Record<
    string,
    number
  >;




  categories: {
  category: string;
  title: string;
  score: number;
  maxScore: number;
  percentage: number;
  status:
    | "excellent"
    | "good"
    | "needs-improvement"
    | "poor";
  summary: string;
  issues: string[];
  suggestions: string[];
}[];

  matchedKeywords: string[];

  missingKeywords: string[];
  dateConsistency?: {
  invalidDates: string[];
  overlappingDates: string[];
  reversedDateRanges: string[];
  inconsistentDateFormats: string[];
  missingDates: string[];
  score: number;
  issues: string[];
  suggestions: string[];
};

  recommendations: {
  title: string;
  description: string;
  priority:
    | "critical"
    | "high"
    | "medium"
    | "low";
  category: string;
  impact: number;
  actionable: boolean;
  suggestedFix: string;
  evidence: string;
}[];

  strengths: string[];

  weaknesses: string[];

  optimizedSummary: string;

  improvedExperience: string[];

  createdAt: Date;

  updatedAt: Date;
}

const resumeAnalysisSchema =
  new Schema(
    {
      userId: {
        type: String,
        required: true,
      },

      resumeId: {
        type: Schema.Types.ObjectId,

        ref: "ResumeBuilder",

        required: true,
      },

      jobDescription: {
        type: String,

        default: "",
      },

      atsScore: {
        type: Number,

        required: true,
      },

      grade: {
        type: String,

        enum: [
          "A",
          "B",
          "C",
          "D",
          "F",
        ],

        default: "F",
      },

      /**
       * IMPORTANT:
       *
       * ATS categories are configuration-driven.
       *
       * Do NOT hardcode:
       * keywordScore
       * summaryScore
       * projectsScore
       * educationScore
       *
       * here.
       *
       * New ATS categories can be added without
       * changing this MongoDB schema.
       */
      breakdown: {
        type: Map,

        of: Number,

        default: {},
      },

      categories: [
  {
    category: {
      type: String,
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    score: {
      type: Number,
      required: true,
    },

    maxScore: {
      type: Number,
      required: true,
    },

    percentage: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "excellent",
        "good",
        "needs-improvement",
        "poor",
      ],
      required: true,
    },

    summary: {
      type: String,
      default: "",
    },

    issues: {
      type: [String],
      default: [],
    },

    suggestions: {
      type: [String],
      default: [],
    },
  },
],

    
      matchedKeywords: {
        type: [String],

        default: [],
      },

      missingKeywords: {
        type: [String],

        default: [],
      },
      dateConsistency: {
  invalidDates: {
    type: [String],
    default: [],
  },

  overlappingDates: {
    type: [String],
    default: [],
  },

  reversedDateRanges: {
    type: [String],
    default: [],
  },

  inconsistentDateFormats: {
    type: [String],
    default: [],
  },

  missingDates: {
    type: [String],
    default: [],
  },

  score: {
    type: Number,
    default: 0,
  },

  issues: {
    type: [String],
    default: [],
  },

  suggestions: {
    type: [String],
    default: [],
  },
},

      recommendations: [
        {
          title: {
            type: String,

            required: true,
          },

          description: {
            type: String,

            required: true,
          },

          priority: {
            type: String,

            enum: [
              "critical",
              "high",
              "medium",
              "low",
            ],

            default: "medium",
          },


          category: {
  type: String,
  default: "keywords",
},

impact: {
  type: Number,
  default: 0,
},

actionable: {
  type: Boolean,
  default: true,
},

suggestedFix: {
  type: String,
  default: "",
},

evidence: {
  type: String,
  default: "",
},
        },
      ],

      strengths: {
        type: [String],

        default: [],
      },

      weaknesses: {
        type: [String],

        default: [],
      },

      optimizedSummary: {
        type: String,

        default: "",
      },

      improvedExperience: {
        type: [String],

        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

export const ResumeAnalysis =
  (mongoose.models["ResumeAnalysis"] as mongoose.Model<IResumeAnalysis>) ||
  mongoose.model<IResumeAnalysis>(
    "ResumeAnalysis",
    resumeAnalysisSchema
  );