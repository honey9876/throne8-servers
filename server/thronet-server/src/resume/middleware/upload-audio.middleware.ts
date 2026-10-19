import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";

const storage = multer.memoryStorage();

// Covers the mime types different browsers' MediaRecorder implementations
// actually produce (Chrome/Firefox -> webm/opus, Safari -> mp4/aac, etc.)
const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "video/webm", // some browsers label opus-in-webm recordings this way
];

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (!ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(400, "Unsupported audio format."));
  }

  cb(null, true);
};

const uploadAudio = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB - comfortably covers a few minutes of speech
  },
});

export const uploadAnswerAudio = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  uploadAudio.single("audio")(req, res, (err: unknown) => {
    if (!err) {
      return next();
    }

    if (err instanceof ApiError) {
      return next(err);
    }

    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "LIMIT_FILE_SIZE"
    ) {
      return next(new ApiError(400, "Recording must be 15MB or smaller."));
    }

    const message =
      err instanceof Error ? err.message : "Failed to upload audio.";

    return next(new ApiError(400, message));
  });
};
