import { Router } from "express";

import {
  createResume,
  uploadAndParseResume,
  uploadAndParseIntoResume,
  getResumes,
  getResumeById,
  updateResume,
  deleteResume,
  duplicateResume,
  shareResume,
  disableShareResume,
  getPublicResume,
} from "./resume.controller";

import { protect } from "../../middleware/auth.middleware";
import { uploadResumePdf } from "../../middleware/upload-pdf.middleware";

const router = Router();
router.get("/public/:shareId", getPublicResume);

router.use(protect);

router.post("/", createResume);
router.post("/upload-and-parse", uploadResumePdf, uploadAndParseResume);

router.get("/", getResumes);

router.get("/:id", getResumeById);
router.patch("/:id", updateResume);

router.delete("/:id", deleteResume);
router.post("/:id/duplicate", duplicateResume);

router.post("/:id/share", shareResume);

router.delete("/:id/share", disableShareResume);

router.post("/upload-and-parse", uploadResumePdf, uploadAndParseResume);
router.post("/:id/upload-and-parse", uploadResumePdf, uploadAndParseIntoResume);
export default router;
