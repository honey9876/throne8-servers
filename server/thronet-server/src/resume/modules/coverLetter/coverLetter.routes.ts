import { Router } from "express";

import {
  createCoverLetter,
  getCoverLetters,
  getCoverLetterById,
  updateCoverLetter,
  deleteCoverLetter,
} from "./coverLetter.controller";

import { protect } from "../../middleware/auth.middleware";

const router = Router();

router.use(protect);

router.post("/", createCoverLetter);

router.get("/", getCoverLetters);

router.get("/:id", getCoverLetterById);
router.patch("/:id", updateCoverLetter);

router.delete("/:id", deleteCoverLetter);

export default router;
