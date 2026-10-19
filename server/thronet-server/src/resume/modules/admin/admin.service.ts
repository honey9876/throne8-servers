import { User } from "../../models/user.model";
import { Resume } from "../../models/resume.model";
import { ResumeAnalysis } from "../../models/resume-analysis.model";
import { AIUsage } from "../../models/ai-usage.model";
import { ResumeAnalytics } from "../../models/resume-analytics.model";
import mongoose from "mongoose";

export async function getDashboardStats() {
  const [
    totalUsers,
    totalResumes,
    totalSharedResumes,
    totalATSAnalyses,
    totalAIRequests,
    analytics,
  ] = await Promise.all([
    User.countDocuments(),

    Resume.countDocuments(),

    Resume.countDocuments({
      isPublic: true,
    }),

    ResumeAnalysis.countDocuments(),

    AIUsage.countDocuments(),

    ResumeAnalytics.aggregate([
      {
        $group: {
          _id: null,

          downloads: {
            $sum: "$downloads",
          },

          views: {
            $sum: "$views",
          },

          shares: {
            $sum: "$shares",
          },
        },
      },
    ]),
  ]);

  return {
    totalUsers,

    totalResumes,

    totalSharedResumes,

    totalATSAnalyses,

    totalAIRequests,

    totalDownloads:
      analytics[0]?.downloads ?? 0,

    totalViews:
      analytics[0]?.views ?? 0,

    totalShares:
      analytics[0]?.shares ?? 0,
  };
}


 

export async function getUsers(
  page: number,
  limit: number,
  search: string
) {
  const filter = search
    ? {
        $or: [
          {
            name: {
              $regex: search,
              $options: "i",
            },
          },
          {
            email: {
              $regex: search,
              $options: "i",
            },
          },
        ],
      }
    : {};

  const users = await User.find(filter)
    .select("-password")
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({
      createdAt: -1,
    });

  const total =
    await User.countDocuments(filter);

  return {
    users,
    total,
    page,
    totalPages: Math.ceil(
      total / limit
    ),
  };
}


export async function updateUserStatus(
  id: string,
  status: string
) {
  return User.findByIdAndUpdate(
    id,
    {
      status,
    },
    {
      new: true,
    }
  ).select("-password");
}


import { ApiError } from "../../utils/ApiError";

export async function deleteUser(
  id: string
) {
  const user = await User.findById(id);

  if (!user) {
    throw new ApiError(
      404,
      "User not found"
    );
  }

  // Admin delete not allowed
  if (user.role === "admin") {
    throw new ApiError(
      403,
      "Admin account cannot be deleted"
    );
  }

  return User.findByIdAndDelete(id);
}



 

// Only these fields may leave the server (never passwordHash, 2FA secret, tokens...).
// `.lean()` skips the User schema's toJSON sanitizer, so the projection has to be explicit.
const ADMIN_USER_FIELDS =
  "userId email firstName lastName role status createdAt updatedAt";

export async function getUserDetails(
  id: string
) {
  // The admin UI passes the Mongo _id; also accept the Throne8 userId (UUID).
  const query = mongoose.isValidObjectId(id)
    ? { _id: id }
    : { userId: id };

  const user: any = await User.findOne(query)
    .select(ADMIN_USER_FIELDS)
    .lean();

  if (!user) {
    throw new Error("User not found");
  }

  // Resume data is keyed by the Throne8 userId (UUID string), not by the Mongo _id.
  const ownerId: string = user.userId;

  const [
    resumes,
    aiRequests,
    atsAnalyses,
  ] = await Promise.all([
    Resume.countDocuments({
      userId: ownerId,
    }),

    AIUsage.countDocuments({
      userId: ownerId,
    }),

    ResumeAnalysis.countDocuments({
      userId: ownerId,
    }),
  ]);

  return {
    user: {
      ...user,
      fullName:
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.email,
    },
    stats: {
      resumes,
      aiRequests,
      atsAnalyses,
    },
  };
}
