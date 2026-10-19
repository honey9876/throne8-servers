import { Resume } from "../../models/resume.model";
import { ResumeVersion } from "../../models/resume-version.model";

export async function saveVersion(
  resumeId: string,
  userId: string
) {
  const resume =
    await Resume.findOne({
      _id: resumeId,
      userId,
    }).lean();

  if (!resume) {
    throw new Error("Resume not found");
  }

  const latest =
    await ResumeVersion.findOne({
      resumeId,
    }).sort({
      version: -1,
    });

  const version =
    latest?.version
      ? latest.version + 1
      : 1;

  return ResumeVersion.create({
    resumeId,
    userId,
    version,
    snapshot: resume,
  });
}


export async function getVersions(
  resumeId: string,
  userId: string
) {
  return ResumeVersion.find({
    resumeId,
    userId,
  })
    .select("-snapshot")
    .sort({
      version: -1,
    });
}

export async function restoreVersion(
  versionId: string,
  userId: string
) {
  const version =
    await ResumeVersion.findOne({
      _id: versionId,
      userId,
    });

  if (!version) {
    throw new Error("Version not found");
  }

  const snapshot =
    version.snapshot as Record<
      string,
      any
    >;

  delete snapshot._id;
  delete snapshot.createdAt;
  delete snapshot.updatedAt;
  delete snapshot.__v;

  const resume =
    await Resume.findOneAndUpdate(
      {
        _id: version.resumeId,
        userId,
      },
      {
        $set: snapshot,
      },
      {
        new: true,
      }
    );

  if (!resume) {
    throw new Error("Resume not found");
  }

  return resume;
}