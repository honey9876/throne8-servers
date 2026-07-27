import AuthController from "@/auth/controllers/auth.controller";

import { connectionController } from "@/connections/controllers/index";

import {
    EducationController,
    HeadlineController,
    HonorController,
    PatentController,
    PositionController,
    PublicationController,
    ProfilePhotoController,
    PostController,
    CommentController,
    ActivityMediaController,
    CoverPhotoController,
    AboutController,
    SkillController,
    ContactController,
    AnalyticsController,
    CareerBreakController,
    TestScoreController,
    ProjectController,
    CourseController,
    VolunteerController,
    ExperienceController,
} from "@/Profile/controllers/index";

import {
    mentorController,
    searchController
} from '@/Mentorship/controllers/index';

export { default as ReportController } from '@/Profile/controllers/report.controller';
export {
    AuthController,

    // Dashboard Controllers
    HeadlineController,
    ExperienceController,
    EducationController,
    CoverPhotoController,
    ProfilePhotoController,
    PostController,
    CommentController,
    ActivityMediaController,
    AboutController,
    SkillController,
    ContactController,
    AnalyticsController,
    CareerBreakController,
    TestScoreController,
    ProjectController,
    CourseController,
    VolunteerController,
    PositionController,
    PublicationController,
    PatentController,
    HonorController,

    // Connections Controllers
    connectionController,

    // Mentorship Controllers
    mentorController,
    searchController
}