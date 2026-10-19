import { ResumeAnalytics } from "../../models/resume-analytics.model";

class AnalyticsService {
  async createAnalytics(resumeId: string, userId: string) {
    return ResumeAnalytics.create({
      resumeId,
      userId,
    });
  }

  async getAnalytics(resumeId: string) {
    return ResumeAnalytics.findOne({
      resumeId,
    });
  }

  async incrementViews(
    resumeId: string,
    userId: string,
    ip: string,
    browser: string,
    device: string,
  ) {
    const analytics = await ResumeAnalytics.findOneAndUpdate(
      {
        resumeId,
      },
      {
        $inc: {
          views: 1,
          dailyViews: 1,
          weeklyViews: 1,
          monthlyViews: 1,
        },

        $addToSet: {
          visitorIps: ip,
        },

        $set: {
          userId,
          lastViewedAt: new Date(),
          lastVisitorIp: ip,
          lastBrowser: browser,
          lastDevice: device,
        },
      },
      {
        // new: true,
        returnDocument: "after",
        upsert: true,
        runValidators: true,
      },
    );

    if (!analytics) {
      return null;
    }

    analytics.uniqueVisitors = analytics.visitorIps.length;

    await analytics.save();

    return analytics;
  }

  async incrementDownloads(resumeId: string) {
    return ResumeAnalytics.findOneAndUpdate(
      {
        resumeId,
      },
      {
        $inc: {
          downloads: 1,
        },
        $set: {
          lastDownloadedAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
      },
    );
  }

  async incrementShares(resumeId: string) {
    return ResumeAnalytics.findOneAndUpdate(
      {
        resumeId,
      },
      {
        $inc: {
          shares: 1,
        },
        $set: {
          lastSharedAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
      },
    );
  }

  // ✅ Ye method CLASS KE ANDAR hona chahiye
  async getUserAnalytics(userId: string) {
    const result = await ResumeAnalytics.aggregate([
      {
        $match: {
          userId,
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

          resumes: {
            $sum: 1,
          },
        },
      },
    ]);

    return (
      result[0] ?? {
        views: 0,
        downloads: 0,
        shares: 0,
        resumes: 0,
      }
    );
  }
}

export const analyticsService = new AnalyticsService();
