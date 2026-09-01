
//ALL VALIDATION OF JOB-SERVICE
import { validateResumeOptimization, validateJobMatching, validateApplicationDuplicate, validateCompanyVerification, validateDirectMessage, validateFeaturedApplicant, validateJobAnalysis, validateOpenToWork, validateTopApplicantJobs } from './ai.validations';
import { validateApplicationOwnership, validateApplyJobInput, validateCoverLetterInput, validateResumeSelectionInput, validateUpdateApplicationStatus } from './application.validations';
import { validateCompanyId, validateMatchingParams, validatePaginationParams, validateReviewInput, validateUserProfile } from './company.validation';
import { validateCompleteFilterInput, buildOptimizedQuery, getSortOptions } from './filter.validations';
import { normalizeArrayFields, validateCreateJobInput, validateListJobsFilters, validateSaveSearchInput, validateUpdateJobInput } from './job.validations';
import { premiumSchemaValidation } from './premium.validations';
import { validateCompanyIDVerification, validateDuplicateApplication, validateJobQuality, validateJobSpamCheck, validateSalaryVerification } from './qualityTrust.validations';
import { validateSearchInput, validateOfflineJobsInput, validatePushNotificationInput, validateRecentlyViewedInput, validateSkillsSearchInput } from './search.validations';
import { createSearchHistorySchema, updateSearchHistorySchema, } from './searchHistory.validations';
import { validateSortInput } from './sort.validations';



export {

    //job-service
    validateResumeOptimization, validateJobMatching, validateApplicationDuplicate, validateCompanyVerification, validateDirectMessage, validateFeaturedApplicant, validateJobAnalysis, validateOpenToWork, validateTopApplicantJobs, validateApplicationOwnership, validateApplyJobInput, validateCoverLetterInput, validateResumeSelectionInput, validateUpdateApplicationStatus, validateCompanyId, validateMatchingParams, validatePaginationParams, validateReviewInput, validateUserProfile, validateCompleteFilterInput, buildOptimizedQuery, getSortOptions, normalizeArrayFields, validateCreateJobInput, validateListJobsFilters, validateSaveSearchInput, validateUpdateJobInput, premiumSchemaValidation, validateCompanyIDVerification, validateDuplicateApplication, validateJobQuality, validateJobSpamCheck, validateSalaryVerification, validateSearchInput, validateOfflineJobsInput, validatePushNotificationInput, validateRecentlyViewedInput, validateSkillsSearchInput, createSearchHistorySchema, updateSearchHistorySchema, validateSortInput,

 

}



