import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";

const storage = multer.memoryStorage();

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (file.mimetype !== "application/pdf") {
    return cb(new ApiError(400, "Only PDF files are allowed."));
  }

  cb(null, true);
};

const uploadPdf = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

export const uploadResumePdf = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  uploadPdf.single("file")(req, res, (err: unknown) => {
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
      return next(new ApiError(400, "PDF must be 5MB or smaller."));
    }

    const message =
      err instanceof Error ? err.message : "Failed to upload PDF.";

    return next(new ApiError(400, message));
  });
};
