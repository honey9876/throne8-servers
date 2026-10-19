import multer from "multer";
import { Request } from "express";
import { ApiError } from "../utils/ApiError";

// Store image in memory (Cloudinary ke liye best)
const storage = multer.memoryStorage();

// Allow only images
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(
      new ApiError(
        400,
        "Only JPG, JPEG, PNG and WEBP images are allowed.",
      ),
    );
  }

  cb(null, true);
};

export const upload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});