import { Resume } from "../../models/resume.model";
import { ResumeAnalytics } from "../../models/resume-analytics.model";
import { Activity } from "../../models/activity.model";

export async function getDashboardData(
  userId: string
) {
  const resumes = await Resume.find({
    userId,
  }).sort({
    updatedAt: -1,
  });


  const recentActivities =
  await Activity.find({
    userId,
  })
    .sort({
      createdAt: -1,
    })
    .limit(10)
    .select("type message createdAt")
    .lean();

  const analytics =
    await ResumeAnalytics.aggregate([
      {
        $match: {
          userId: resumes[0]?.userId,
        },
      },
      {
        $group: {
          _id: null,

          views: {
            $sum: "$views",
          },

          downloads: {
            $sum: "$downloads",
          },

          shares: {
            $sum: "$shares",
          },
        },
      },
    ]);

  const latest =
    resumes[0];

  const missing: string[] = [];

  if (latest) {
    if (!latest.summary)
      missing.push("Summary");

    if (
      latest.skills.length < 5
    )
      missing.push("Skills");

    if (
      latest.projects.length === 0
    )
      missing.push("Projects");

    if (
      latest.experience.length === 0
    )
      missing.push(
        "Experience"
      );

    if (
      latest.education.length === 0
    )
      missing.push(
        "Education"
      );
  }

  const totalSections = 5;

  const completed =
    totalSections -
    missing.length;

  return {
    stats: {
      totalResumes:
        resumes.length,

      draftResumes:
        resumes.filter(
          (
            r
          ) =>
            r.status ===
            "draft"
        ).length,

      completedResumes:
        resumes.filter(
          (
            r
          ) =>
            r.status ===
            "completed"
        ).length,
    },

    analytics: {
      views:
        analytics[0]?.views ??
        0,

      downloads:
        analytics[0]
          ?.downloads ??
        0,

      shares:
        analytics[0]
          ?.shares ?? 0,
    },

    resumeCompletion: {
      percentage:
        Math.round(
          (completed /
            totalSections) *
            100
        ),

      missing,
    },

    aiSuggestions:
      missing.map(
        (item) =>
          `Add ${item}`
      ),

    recentResumes:
      resumes.slice(0, 15),


      recentActivities,
  };
}