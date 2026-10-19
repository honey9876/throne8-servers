import mongoose, { Schema, Document } from "mongoose";

export interface IAIUsage extends Document {
  userId: string;

  feature:
    | "generate-summary"
    | "generate-experience"
    | "rewrite-experience"
    | "suggest-skills"
    | "generate-project"
    | "ats-analysis"
    | "generate-project-description"
    | "generate-coursework"
    | "generate-custom-section"
    | "generate-internship"
    | "generate-resume"
    | "generate-cover-letter"
    | "regenerate-cover-letter";

  tokensUsed: number;

  createdAt: Date;
  updatedAt: Date;
}

const aiUsageSchema = new Schema<IAIUsage>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    feature: {
      type: String,
      required: true,
    },

    tokensUsed: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const AIUsage =
  (mongoose.models["AIUsage"] as mongoose.Model<IAIUsage>) ||
  mongoose.model<IAIUsage>("AIUsage", aiUsageSchema);
