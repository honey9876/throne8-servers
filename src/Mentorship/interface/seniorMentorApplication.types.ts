// interface/seniorMentorApplication.types.ts
import { TimeStamps, SoftDelete } from './common.types';
import { Domain } from '../../shared/constants/domains';
import { ExperienceLevel } from './mentor.types';

/**
 * Overall verification/review status of a "Become Senior Mentor" application.
 */
export enum ApplicationStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

/**
 * Areas a prospective mentor can select under
 * "What can you help students with?"
 */
export enum MentorshipHelpArea {
  DSA_PROBLEM_SOLVING = 'dsa_problem_solving',
  DEVELOPMENT_CODING = 'development_coding',
  PROJECT_GUIDANCE = 'project_guidance',
  RESUME_LINKEDIN = 'resume_linkedin',
  INTERVIEW_PREPARATION = 'interview_preparation',
  PLACEMENT_PREPARATION = 'placement_preparation',
  CAREER_GUIDANCE = 'career_guidance',
}

export interface ISeniorMentorApplication extends TimeStamps, SoftDelete {
  _id: string;
  applicationId: string;
  userId: string; // Reference to User Service — set from auth token, never from body

  // ── 1. Profile ─────────────────────────────────────────────────
  fullName: string;
  profilePhoto?: string; // Cloudinary/S3 URL
  profilePhotoKey?: string; // Storage key, for deletion
  college: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: number;
  currentRole: string;
  currentCompany: string;
  shortBio: string;

  // ── 2. Professional ────────────────────────────────────────────
  linkedinUrl: string;
  githubUrl?: string;
  portfolioUrl?: string;
  yearsOfExperience: number;
  experienceLevel: ExperienceLevel;
  primaryExpertise: Domain;
  otherSkills: string[];
  technologies: string[];
  achievements: string[];
  certifications: string[];

  // ── 3. Mentorship ──────────────────────────────────────────────
  helpAreas: MentorshipHelpArea[];

  // ── 4. Why Become a Mentor? ────────────────────────────────────
  motivation: string; // "Why do you want to become a Senior Mentor?"
  adviceToJuniorSelf: string; // "One thing you wish someone had told you..."

  // ── 5. Verification ────────────────────────────────────────────
  resumeUrl: string;
  resumeKey?: string;
  proofDocumentUrl: string;
  proofDocumentKey?: string;
  verificationStatus: ApplicationStatus;
  verifiedAt?: Date;
  verifiedBy?: string; // Admin userId
  rejectionReason?: string;

  // ── 6. System ───────────────────────────────────────────────────
  isActive: boolean;
  // profileCompletion is a computed virtual — not persisted
}

export interface CreateSeniorMentorApplicationInput {
  userId: string;
  fullName: string;
  college: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: number;
  currentRole: string;
  currentCompany: string;
  shortBio: string;

  linkedinUrl: string;
  githubUrl?: string;
  portfolioUrl?: string;
  yearsOfExperience: number;
  experienceLevel: ExperienceLevel;
  primaryExpertise: Domain;
  otherSkills?: string[];
  technologies?: string[];
  achievements?: string[];
  certifications?: string[];

  helpAreas: MentorshipHelpArea[];

  motivation: string;
  adviceToJuniorSelf: string;

  profilePhotoFile: Express.Multer.File;
  resumeFile: Express.Multer.File;
  proofDocumentFile: Express.Multer.File;
}

export interface UpdateSeniorMentorApplicationInput {
  fullName?: string;
  college?: string;
  degree?: string;
  fieldOfStudy?: string;
  graduationYear?: number;
  currentRole?: string;
  currentCompany?: string;
  shortBio?: string;

  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  yearsOfExperience?: number;
  experienceLevel?: ExperienceLevel;
  primaryExpertise?: Domain;
  otherSkills?: string[];
  technologies?: string[];
  achievements?: string[];
  certifications?: string[];

  helpAreas?: MentorshipHelpArea[];

  motivation?: string;
  adviceToJuniorSelf?: string;
}

export interface ApplicationFilters {
  verificationStatus?: ApplicationStatus;
  primaryExpertise?: Domain;
  isActive?: boolean;
  search?: string;
}
