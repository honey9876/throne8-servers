import { Response } from "express";

import { Resume } from "../../models/resume.model";
import { AuthRequest } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { generateResumePdf } from "../../services/pdf.service";

export const exportPdf = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const resume = await Resume.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!resume) {
      throw new ApiError(404, "Resume not found");
    }

    const pdfBytes = await generateResumePdf(resume);

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=resume.pdf`
    );

    res.send(Buffer.from(pdfBytes));
  }
);