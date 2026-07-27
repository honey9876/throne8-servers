// controller/premium.controller.ts
import { Request, Response, NextFunction } from 'express';
import { premiumService } from '@/Job-Service/services/premium/premium.service';

import { sanitizeInput, generateSecureId, validId } from '@/shared/security.js';

import logger from '@/shared/logger.util';
import ResponseUtil from '@/shared/response.util.js';

import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '@/shared/errors/app.error';


// Reusable context helper for premium endpoints
const withPremiumContext = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateSecureId();
    const startTime = Date.now();

    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    } finally {
      const duration = Date.now() - startTime;
      if (duration > 800) {
        logger.warn(`[${requestId}] Slow premium operation`, { duration });
      }
    }
  };

// GET - Check Premium Access
export const checkPremiumAccessController = withPremiumContext(async (req: Request, res: Response) => {
  // PREMIUM VERIFICATION COMMENTED - Will be enabled later
  // const userId = req.user?.userId;
  // if (!userId) throw new ValidationError('User ID is required');
  
  // const hasPremium = await premiumService.hasPremiumAccess({ id: userId });

  // if (!hasPremium) {
  //   throw new ForbiddenError('Premium access required');
  // }

  ResponseUtil.success(res, { hasPremium: true }, 'Premium access verified');
});

// GET - Get Premium Features
export const getFeaturesController = withPremiumContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ValidationError('User ID is required');

  // PREMIUM VERIFICATION COMMENTED
  // const features = await premiumService.getPremiumFeatures(userId);
  // if (!features) {
  //   throw new NotFoundError('Premium features');
  // }

  const features = { message: 'Premium features endpoint - implementation pending' };
  ResponseUtil.success(res, features, 'PREMIUM_FEATURES_FETCHED');
});

// GET - Applicant Insights for a Job
export const getApplicantInsightsController = withPremiumContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!jobId) throw new ValidationError('Job ID is required');

  const insights = await premiumService.getJobApplicantInsights(jobId, { id: userId });

  if (!insights) {
    throw new NotFoundError('Applicant insights');
  }

  ResponseUtil.success(res, insights, 'Applicant insights retrieved');
});

// GET - Competition Level for a Job
export const getCompetitionController = withPremiumContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!jobId) throw new ValidationError('Job ID is required');

  const level = await premiumService.getCompetitionLevel(jobId, { id: userId });

  if (!level) {
    throw new NotFoundError('Competition level');
  }

  ResponseUtil.success(res, { level }, 'Competition level retrieved');
});

// GET - Full Competition Analysis
export const analyzeCompetitionController = withPremiumContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!jobId) throw new ValidationError('Job ID is required');

  const analysis = await premiumService.analyzeJobCompetition(jobId, { id: userId });

  if (!analysis) {
    throw new NotFoundError('Competition analysis');
  }

  ResponseUtil.success(res, analysis, 'Competition analysis completed');
});

// GET - Salary Benchmark
export const getBenchmarkController = withPremiumContext(async (req: Request, res: Response) => {
  const { title, location, experience } = req.query;

  if (!title || !location || !experience) {
    throw new ValidationError('Missing required query parameters: title, location, experience');
  }

  const experienceNum = parseInt(experience as string);
  if (isNaN(experienceNum)) {
    throw new ValidationError('Experience must be a valid number');
  }

  const benchmark = await premiumService.getSalaryBenchmark(
    sanitizeInput(title as string),
    sanitizeInput(location as string),
    experienceNum // Changed to number
  );

  if (!benchmark) {
    throw new NotFoundError('Salary benchmark');
  }

  ResponseUtil.success(res, benchmark, 'Salary benchmark retrieved');
});

// GET - InMail Credits
export const getCreditsController = withPremiumContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ValidationError('User ID is required');

  const credits = await premiumService.getInmailCredits(sanitizeInput(userId));

  if (credits === null || credits === undefined) {
    throw new NotFoundError('InMail credits');
  }

  ResponseUtil.success(res, credits, 'InMail credits retrieved');
});

// POST - Send InMail (uses credit)
export const sendInmailController = withPremiumContext(async (req: Request, res: Response) => {
  const { recipientId } = req.body;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!recipientId) throw new ValidationError('recipientId is required');

  const result = await premiumService.useInmailCredit(sanitizeInput(userId), recipientId);

  if (!result) {
    throw new BadRequestError(result?.message || 'Failed to send InMail');
  }

  ResponseUtil.created(res, result, 'InMail sent successfully');
});

// GET - Check if can send InMail
export const checkInmailController = withPremiumContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ValidationError('User ID is required');

  // PREMIUM VERIFICATION COMMENTED
  // const canSend = await premiumService.canSendInmail(userId);
  // if (!canSend) {
  //   throw new ForbiddenError('User cannot send InMail (credits exhausted or restricted)');
  // }

  ResponseUtil.success(res, { canSend: true }, 'InMail sending allowed');
});

// POST - Refill Monthly Credits (manual/admin trigger)
export const refillCreditsController = withPremiumContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ValidationError('User ID is required');

  const result = await premiumService.refillMonthlyCredits(sanitizeInput(userId));

  if (!result) {
    throw new BadRequestError('Failed to refill credits');
  }

  ResponseUtil.success(res, result, 'Monthly credits refilled');
});

// GET - Interview Questions for Job
export const getQuestionsController = withPremiumContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!jobId) throw new ValidationError('Job ID is required');

  const questions = await premiumService.getInterviewQuestions(jobId, { id: userId });

  if (!questions) {
    throw new NotFoundError('Interview questions');
  }

  ResponseUtil.success(res, questions, 'Interview questions retrieved');
});

// POST - Generate Interview Preparation
export const generatePrepController = withPremiumContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!jobId) throw new ValidationError('jobId is required');

  // PREMIUM VERIFICATION COMMENTED
  // const prep = await premiumService.generateInterviewPrep(jobId, { id: userId });
  // if (!prep) {
  //   throw new NotFoundError('Interview preparation');
  // }

  const prep = { message: 'Interview prep generation - implementation pending' };
  ResponseUtil.created(res, prep, 'Interview preparation generated successfully');
});

// PUT - Update Interview Prep Progress
export const updateProgressController = withPremiumContext(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const { completedItems } = req.body;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!jobId || !Array.isArray(completedItems)) {
    throw new ValidationError('jobId and completedItems array are required');
  }

  if (!completedItems.every(item => typeof item === 'string')) {
    throw new ValidationError('completedItems must be an array of strings');
  }

  // PREMIUM VERIFICATION COMMENTED
  // const progress = await premiumService.updatePrepProgress(userId, jobId, completedItems);
  // if (!progress) {
  //   throw new NotFoundError('Progress');
  // }

  const progress = { message: 'Progress update - implementation pending' };
  ResponseUtil.success(res, progress, 'Progress updated successfully');
});

// GET - Interview Tips
export const getTipsController = withPremiumContext(async (req: Request, res: Response) => {
  const { companyId, roleType } = req.query;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!companyId || !roleType) {
    throw new ValidationError('companyId and roleType are required');
  }

  const tips = await premiumService.getInterviewTips(
    sanitizeInput(companyId as string),
    sanitizeInput(roleType as string)
  );

  if (!tips) {
    throw new NotFoundError('Interview tips');
  }

  ResponseUtil.success(res, tips, 'Interview tips retrieved successfully');
});

// GET - Check Feature Limit
export const checkLimitController = withPremiumContext(async (req: Request, res: Response) => {
  const { feature } = req.params;
  const userId = req.user?.userId;
  
  if (!userId) throw new ValidationError('User ID is required');
  if (!feature) throw new ValidationError('Feature parameter is required');

  const limit = await premiumService.checkFeatureLimit({ id: userId }, feature);

  if (limit === null) {
    throw new NotFoundError('Feature limit');
  }

  ResponseUtil.success(res, limit, 'Feature limit retrieved');
});

// GET - Premium Analytics
export const getAnalyticsController = withPremiumContext(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new ValidationError('User ID is required');

  // PREMIUM VERIFICATION COMMENTED
  // const analytics = await premiumService.getPremiumAnalytics({ userId });
  // if (!analytics) {
  //   throw new NotFoundError('Premium analytics');
  // }

  const analytics = { message: 'Premium analytics - implementation pending' };
  ResponseUtil.success(res, analytics, 'Premium analytics retrieved');
});




// import { Request, Response, NextFunction } from 'express';
// import { premiumService } from '@/services/job-service/premium/premium.service';

// import { sanitizeInput, generateSecureId, validId } from '@/utils/security.js';

// import logger from '@/utils/logger.util';
// import ResponseUtil from '@/utils/response.util.js';

// import {
//   ValidationError,
//   NotFoundError,
//   ForbiddenError,
//   BadRequestError,
// } from '@/errors/app.error';


// // Reusable context helper for premium endpoints
// const withPremiumContext = (handler: (req: Request, res: Response) => Promise<void>) =>
//   async (req: Request, res: Response, next: NextFunction) => {
//     const requestId = generateSecureId();
//     const startTime = Date.now();

//     try {
//       await handler(req, res);
//     } catch (err) {
//       next(err);
//     } finally {
//       const duration = Date.now() - startTime;
//       if (duration > 800) {
//         logger.warn(`[${requestId}] Slow premium operation`, { duration });
//       }
//     }
//   };

// // GET - Check Premium Access
// export const checkPremiumAccessController = withPremiumContext(async (req: Request, res: Response) => {
//   const hasPremium = await premiumService.hasPremiumAccess(req.user.userId!);

//   if (!hasPremium) {
//     throw new ForbiddenError('Premium access required');
//   }

//   ResponseUtil.success(res, { hasPremium: true }, 'Premium access verified');
// });

// // GET - Get Premium Features
// export const getFeaturesController = withPremiumContext(async (req: Request, res: Response) => {
//   const features = await premiumService.getPremiumFeatures(req.user?.userId);

//   if (!features) {
//     throw new NotFoundError('Premium features');
//   }

//   ResponseUtil.success(res, features, 'PREMIUM_FEATURES_FETCHED');
// });

// // GET - Applicant Insights for a Job
// export const getApplicantInsightsController = withPremiumContext(async (req: Request, res: Response) => {
//   const { jobId } = req.params;

//   const insights = await premiumService.getJobApplicantInsights(jobId, req.user?.userId);

//   if (!insights) {
//     throw new NotFoundError('Applicant insights');
//   }

//   ResponseUtil.success(res, insights, 'Applicant insights retrieved');
// });

// // GET - Competition Level for a Job
// export const getCompetitionController = withPremiumContext(async (req: Request, res: Response) => {
//   const { jobId } = req.params;

//   const level = await premiumService.getCompetitionLevel(jobId);

//   if (!level) {
//     throw new NotFoundError('Competition level');
//   }

//   ResponseUtil.success(res, { level }, 'Competition level retrieved');
// });

// // GET - Full Competition Analysis
// export const analyzeCompetitionController = withPremiumContext(async (req: Request, res: Response) => {
//   const { jobId } = req.params;

//   const analysis = await premiumService.analyzeJobCompetition(jobId, req.user?.userId);

//   if (!analysis) {
//     throw new NotFoundError('Competition analysis');
//   }

//   ResponseUtil.success(res, analysis, 'Competition analysis completed');
// });

// // GET - Salary Benchmark
// export const getBenchmarkController = withPremiumContext(async (req: Request, res: Response) => {
//   const { title, location, experience } = req.query;

//   if (!title || !location || !experience) {
//     throw new ValidationError('Missing required query parameters: title, location, experience');
//   }

//   const benchmark = await premiumService.getSalaryBenchmark(
//     sanitizeInput(title as string),
//     sanitizeInput(location as string),
//     sanitizeInput(experience as string)
//   );

//   if (!benchmark) {
//     throw new NotFoundError('Salary benchmark');
//   }

//   ResponseUtil.success(res, benchmark, 'Salary benchmark retrieved');
// });

// // GET - InMail Credits
// export const getCreditsController = withPremiumContext(async (req: Request, res: Response) => {
//   const credits = await premiumService.getInmailCredits(req.user?.userId);

//   if (credits === null || credits === undefined) {
//     throw new NotFoundError('InMail credits');
//   }

//   ResponseUtil.success(res, credits, 'InMail credits retrieved');
// });

// // POST - Send InMail (uses credit)
// export const sendInmailController = withPremiumContext(async (req: Request, res: Response) => {
//   const { recipientId } = req.body;

//   if (!recipientId) {
//     throw new ValidationError('recipientId is required');
//   }

//   const result = await premiumService.useInmailCredit(req.user?.userId, recipientId);

//   if (!result) {
//     throw new BadRequestError(result?.message || 'Failed to send InMail');
//   }

//   ResponseUtil.created(res, result, 'InMail sent successfully');
// });

// // GET - Check if can send InMail
// export const checkInmailController = withPremiumContext(async (req: Request, res: Response) => {
//   const canSend = await premiumService.canSendInmail(req.user?.userId);

//   if (!canSend) {
//     throw new ForbiddenError('User cannot send InMail (credits exhausted or restricted)');
//   }

//   ResponseUtil.success(res, { canSend: true }, 'InMail sending allowed');
// });

// // POST - Refill Monthly Credits (manual/admin trigger)
// export const refillCreditsController = withPremiumContext(async (req: Request, res: Response) => {
//   const result = await premiumService.refillMonthlyCredits(req.user?.userId);

//   if (!result) {
//     throw new BadRequestError('Failed to refill credits');
//   }

//   ResponseUtil.success(res, result, 'Monthly credits refilled');
// });

// // GET - Interview Questions for Job
// export const getQuestionsController = withPremiumContext(async (req: Request, res: Response) => {
//   const { jobId } = req.params;

//   const questions = await premiumService.getInterviewQuestions(jobId, req.user?.userId);

//   if (!questions) {
//     throw new NotFoundError('Interview questions');
//   }

//   ResponseUtil.success(res, questions, 'Interview questions retrieved');
// });

// // POST - Generate Interview Preparation
// export const generatePrepController = withPremiumContext(async (req: Request, res: Response) => {
//   const { jobId } = req.params;

//   if (!jobId) throw new ValidationError('jobId is required');

//   const prep = await premiumService.generateInterviewPrep(jobId, req.user);

//   if (!prep) {
//     throw new NotFoundError('Interview preparation');
//   }

//   ResponseUtil.created(res, prep, 'Interview preparation generated successfully');
// });

// // PUT - Update Interview Prep Progress
// export const updateProgressController = withPremiumContext(async (req: Request, res: Response) => {
//   const { jobId } = req.params;
//   const { completedItems } = req.body;

//   if (!jobId || !Array.isArray(completedItems)) {
//     throw new ValidationError('jobId and completedItems array are required');
//   }

//   if (!completedItems.every(item => typeof item === 'string')) {
//     throw new ValidationError('completedItems must be an array of strings');
//   }

//   const progress = await premiumService.updatePrepProgress(req.user?.userId, jobId, completedItems);

//   if (!progress) {
//     throw new NotFoundError('Progress');
//   }

//   ResponseUtil.success(res, progress, 'Progress updated successfully');
// });

// // GET - Interview Tips
// export const getTipsController = withPremiumContext(async (req: Request, res: Response) => {
//   const { companyId, roleType } = req.query;

//   if (!companyId || !roleType) {
//     throw new ValidationError('companyId and roleType are required');
//   }

//   const tips = await premiumService.getInterviewTips(
//     sanitizeInput(companyId as string),
//     sanitizeInput(roleType as string)
//   );

//   if (!tips) {
//     throw new NotFoundError('Interview tips');
//   }

//   ResponseUtil.success(res, tips, 'Interview tips retrieved successfully');
// });

// // GET - Check Feature Limit
// export const checkLimitController = withPremiumContext(async (req: Request, res: Response) => {
//   const { feature } = req.params;

//   if (!feature) {
//     throw new ValidationError('Feature parameter is required');
//   }

//   const limit = await premiumService.checkFeatureLimit(req.user?.userId, feature);

//   if (limit === null) {
//     throw new NotFoundError('Feature limit');
//   }

//   ResponseUtil.success(res, limit, 'Feature limit retrieved');
// });

// // GET - Premium Analytics
// export const getAnalyticsController = withPremiumContext(async (req: Request, res: Response) => {
//   const analytics = await premiumService.getPremiumAnalytics({ userId: req.user?.userId });

//   if (!analytics) {
//     throw new NotFoundError('Premium analytics');
//   }

//   ResponseUtil.success(res, analytics, 'Premium analytics retrieved');
// });