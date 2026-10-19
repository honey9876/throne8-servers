import { Router } from "express";

import {
  generateSummary,
  rewriteExperience,
  suggestSkills,
  generateProjectDescription,
  generateExperience,
  generateCoursework,
  generateCustomSection,
  generateInternship,
  generateResume,
  generateCoverLetter,
  regenerateCoverLetterSection,
  getCoverLetterCredits,
} from "./ai.controller";

import { protect } from "../../middleware/auth.middleware";
import { uploadResumePdf } from "../../middleware/upload-pdf.middleware";

const router = Router();

router.use(protect);

router.post("/summary", generateSummary);

router.post("/rewrite-experience", rewriteExperience);

router.post("/suggest-skills", suggestSkills);

router.post("/project", generateProjectDescription);

router.post("/experience", generateExperience);

router.post("/coursework", generateCoursework);

router.post("/custom-section", generateCustomSection);

router.post("/internship", generateInternship);

router.post("/generate-resume", generateResume);

router.post(
  "/generate-cover-letter",
  uploadResumePdf,
  generateCoverLetter,
);

router.post("/regenerate-cover-letter", regenerateCoverLetterSection);

router.get("/cover-letter-credits", getCoverLetterCredits);

export default router;
