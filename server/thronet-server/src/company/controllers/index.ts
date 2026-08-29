
// import {createJobController, listJobsController, saveJobsController, deleteJobController, updateJobController, getJobByIdController, featuredJobsController, updateApplicationStatusController, applyToJobController} from './J'
import companyController, { getCompanyPageController, employeeReviewsController, getCompanyCultureInfoController } from "./company.controller";
import { postController } from './post.controller';
import { employeeController } from './employee.controller';
import { eventController } from './event.controller';
import healthController from "./health.controller";
import { companyReviewController } from "./companyReview.controller";
import companyAnalyticsController from './companyAnalytics.controller';
import { followerController } from './follower.controller';
import companyActivityController from './companyActivity.controller';


export {
    //company-service
    companyController, 
    getCompanyPageController, 
    employeeReviewsController,  
    getCompanyCultureInfoController,
    healthController, 
    companyReviewController, 
    companyAnalyticsController, 
    postController, 
    employeeController, 
    eventController, 
    followerController,
    companyActivityController,
}