

//ALL SERVICES OF JOB-SERVICE

import { createJobService, getJobApplications, getJobById, getJobsByCompany, listJobs, searchJobs, updateJob, updateJobStatus, getFeaturedJobs } from "./job.service";
import { aiService as aiServiceJob } from "./ai.service";
import { calculateMatchScore } from "./matching.service";
import { QualityTrustService } from "./qualityTrust.service";
import { calculateSimilarityScore, analyzeSearchHistory, getSkillSuggestions, getCompanySuggestions, getLocationSuggestions, getJobTitleSuggestions, generateEnhancedSuggestions, buildRecentlyViewedQuery, AdvancedSearchEngine, AnalyticsProcessor, RecommendationEngine, RecommendationUtils, SearchStatsService, SearchEventService, SearchMaintenanceService } from "./search.service";
import { calculateRelevanceScore, calculateTrendingScore, calculateUrgencyScore, buildSortQuery, getSortOptions, getSortIndexHint, getSortDescription } from "./sort.service";
import { StatsService } from "./statS.service";
import { StatsFlushService } from "./statsFlush.service";
import { JobAnalyticsService } from "./jobAnalytics.service";
import notificationsSettingsService, { getNotificationsSettingsService } from "./premium/notificationSettings.service";
import { premiumService } from "./premium/premium.service";
import { modelService, premiumExtendedService } from "./premium/premiumExtended.service";
import { JobSearchService, createJobSearchService } from "./premium/premiumJobSearch.service";
import { ProfessionalDevelopmentService } from "./premium/professionalDevelopment.service";






export {
    //job service
    //shared
    createJobService, getJobApplications, getJobById, getJobsByCompany, listJobs, searchJobs, updateJob, updateJobStatus, getFeaturedJobs,
    aiServiceJob,
    calculateMatchScore,
    QualityTrustService,
    calculateSimilarityScore, analyzeSearchHistory, getSkillSuggestions, getCompanySuggestions, getLocationSuggestions, getJobTitleSuggestions, generateEnhancedSuggestions, buildRecentlyViewedQuery, AdvancedSearchEngine, AnalyticsProcessor, RecommendationEngine, RecommendationUtils, SearchStatsService, SearchEventService, SearchMaintenanceService,
    calculateRelevanceScore, calculateTrendingScore, calculateUrgencyScore, buildSortQuery, getSortOptions, getSortIndexHint, getSortDescription,
    StatsService,
    StatsFlushService,
    JobAnalyticsService,
    notificationsSettingsService, getNotificationsSettingsService,
    premiumService,
    modelService, premiumExtendedService,
    JobSearchService, createJobSearchService,
    ProfessionalDevelopmentService,

}