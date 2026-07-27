// server/thronet-server/src/shared/services/index.service.ts
/**
 * index.service.ts
 * Centralized export of all services in the application
 * Facilitates easy imports and better organization
 */

// Auth Service
import AuthService from '@/auth/services/auth.service';

import { connectionService } from '@/connections/services/index';

import mentorService from '@/Mentorship/services/mentor.service';
export { default as ReportService } from '@/Profile/services/report.service';

// Dashboard Services
import { AboutService, ActivityMediaService, AnalyticsService, CareerBreakService, CommentService, ContactService, CourseService, CoverPhotoService, EducationService, ExperienceService, HeadlineService, HonorService, PatentService, PositionService, PostService, ProfilePhotoService, ProjectService, PublicationService, SkillService, TestScoreService, VolunteerService } from '@/Profile/services/index';

export {
    // Auth Service
    AuthService,

    // Dashboard Services
    HeadlineService,
    ExperienceService,
    EducationService,
    ProfilePhotoService,
    PostService,
    CommentService,
    ActivityMediaService,
    CoverPhotoService,
    AboutService,
    SkillService,
    ContactService,
    AnalyticsService,
    CareerBreakService,
    TestScoreService,
    ProjectService,
    CourseService,
    VolunteerService,
    PositionService,
    PublicationService,
    PatentService,
    HonorService,

    // Connections Services
    connectionService,

    // Mentor Services
    mentorService
}