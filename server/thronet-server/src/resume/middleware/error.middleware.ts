import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.flatten().fieldErrors,
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "PDF must be 5MB or smaller."
        : err.message;

    return res.status(400).json({
      success: false,
      message,
    });
  }

  // Mongoose schema validation (e.g. a field that no longer matches the
  // model's schema) — was previously falling through to a generic,
  // unhelpful 500 "Internal server error".
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: Object.fromEntries(
        Object.entries(err.errors).map(([key, value]) => [
          key,
          value.message,
        ]),
      ),
    });
  }

  // Mongoose failed to cast a value to the type declared in the schema
  // (e.g. a string sent where the schema expects a Number).
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: `Invalid value for field "${err.path}".`,
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};