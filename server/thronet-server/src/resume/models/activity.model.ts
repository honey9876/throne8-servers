import mongoose, {
  Schema,
  Document,
} from "mongoose";

export const ActivityTypes = {
  RESUME_CREATED: "resume-created",
  RESUME_UPDATED: "resume-updated",
  RESUME_DELETED: "resume-deleted",

  AI_SUMMARY: "ai-summary",
  AI_SKILLS: "ai-skills",
  AI_PROJECTS: "ai-projects",

  ATS_ANALYSIS: "ats-analysis",

  RESUME_SHARED: "resume-shared",
  RESUME_DOWNLOADED: "resume-downloaded",
} as const;

export type ActivityType =
  typeof ActivityTypes[keyof typeof ActivityTypes];

export interface IActivity
  extends Document {
  userId: string;

  type: ActivityType;

  message: string;
}

const activitySchema =
  new Schema<IActivity>(
    {
      userId: {
        type: String,
        required: true,
        index: true,
      },

      type: {
        type: String,
        required: true,
        enum: Object.values(
          ActivityTypes
        ),
      },

      message: {
        type: String,
        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

export const Activity =
  (mongoose.models["ResumeActivity"] as mongoose.Model<IActivity>) ||
  mongoose.model<IActivity>(
    "ResumeActivity",
    activitySchema,
    "resume_activities",
  );