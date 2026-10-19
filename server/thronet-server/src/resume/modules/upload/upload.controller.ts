import { Request, Response } from "express";
import streamifier from "streamifier";

import cloudinary from "../../config/cloudinary";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";

export const uploadProfilePhoto = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ApiError(400, "Please upload an image.");
    }

    const uploadFromBuffer = () =>
      new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "resume-builder/profile-photos",
            resource_type: "image",
            transformation: [
              {
                width: 500,
                height: 500,
                crop: "fill",
                gravity: "face",
              },
              {
                quality: "auto",
              },
              {
                fetch_format: "auto",
              },
            ],
          },
          (error, result) => {
            if (error) return reject(error);

            resolve(result);
          },
        );

        streamifier.createReadStream(req.file!.buffer).pipe(stream);
      });

    const result = await uploadFromBuffer();

    res.status(200).json({
      success: true,
      message: "Profile photo uploaded successfully.",
      photo: {
        publicId: result.public_id,
        url: result.secure_url,
      },
    });
  },
);