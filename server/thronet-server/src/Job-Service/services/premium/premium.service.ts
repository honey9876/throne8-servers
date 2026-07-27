// src/services/premium.service.ts
import CacheUtil from '@/shared/cache.util';
import logger from '@/shared/logger.util';
import { AppError, NotFoundError, AuthorizationError } from '@/shared/errors/app.error';
import ResponseUtil from '@/shared/response.util';
import { JobApplication, Job } from '@/Job-Service/models';
import constants from '@/shared/constants.util';

// =============================================================================
// Core Premium Features
// =============================================================================

class PremiumService {

  // Utility to check if user has premium access (cache + DB)
  async hasPremiumAccess(user: { id: string; isPremium?: boolean }): Promise<boolean> {
    // PREMIUM VERIFICATION COMMENTED - Always return true for now
    return true;
    
    // const cacheKey = `${constants.CACHE_KEYS.PREMIUM_ACCESS}:${user.id}`;
    // const cached = await CacheUtil.get(cacheKey);
    // if (cached !== null) return JSON.parse(cached);

    // const hasAccess = !!user.isPremium;
    // await CacheUtil.set(cacheKey, JSON.stringify(hasAccess), Number(constants.CACHE_TTLS.PREMIUM_ACCESS));
    // return hasAccess;
  }

  // Utility to check feature usage limit (monthly reset)
  async checkFeatureLimit(user: { id: string; isPremium?: boolean }, feature: string): Promise<{ hasAccess: boolean; remaining: number | 'unlimited' }> {
    // PREMIUM VERIFICATION COMMENTED - Always return unlimited access
    return { hasAccess: true, remaining: 'unlimited' };

    // const limits: Record<string, number | 'unlimited'> = {
    //   applicantInsights: 10,
    //   competitiveAnalysis: 5,
    //   inmailCredits: 5,
    //   interviewPrep: 'unlimited',
    // };

    // const limit = limits[feature];
    // if (limit === 'unlimited') return { hasAccess: true, remaining: 'unlimited' };

    // const monthKey = `${constants.CACHE_KEYS.FEATURE_USAGE}:${user.id}:${feature}:${new Date().getMonth()}`;
    // const count = Number(await CacheUtil.get(monthKey) || '0');

    // const hasAccess = count < limit;
    // const remaining = limit - count;

    // return { hasAccess, remaining };
  }

  // Log feature usage (increments count)
  async logFeatureUsage(userId: string, feature: string, details: Record<string, any> = {}): Promise<void> {
    // PREMIUM VERIFICATION COMMENTED - Just log, don't track limits
    logger.info(`Feature used`, { userId, feature, details });

    // const monthKey = `${constants.CACHE_KEYS.FEATURE_USAGE}:${userId}:${feature}:${new Date().getMonth()}`;
    // await CacheUtil.incr(monthKey);
    // await CacheUtil.expire(monthKey, Number(constants.CACHE_TTLS.FEATURE_USAGE));
  }

  // 1. Applicant Insights

  // 1. Applicant Insights (using data from JobApplication model directly)
// 1. Applicant Insights (with proper type casting)
async getJobApplicantInsights(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
  const cacheKey = `${constants.CACHE_KEYS.APPLICANT_INSIGHTS}:${jobId}`;
  const cached = await CacheUtil.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const applications = await JobApplication.find({ 
    jobId, 
    status: { $ne: 'withdrawn' } 
  }).lean();

  if (!applications.length) {
    return { totalApplicants: 0, message: 'No applications yet' };
  }

  const totalApplicants = applications.length;

  // Calculate average experience - with type casting
  const totalExperience = applications.reduce((sum, app) => {
    const experience = Number(app.experienceYears || 0);
    return sum + experience;
  }, 0);
  const avgExperience = totalExperience / totalApplicants;

  // Location distribution - with type casting
  const locationDist = applications.reduce((acc: Record<string, number>, app) => {
    const loc = String(app.location || 'Unknown');
    acc[loc] = (acc[loc] || 0) + 1;
    return acc;
  }, {});

  // Skills extraction - from offerDetails
  const skillsMap = new Map<string, number>();
  applications.forEach((app: any) => {
    const skills = app.offerDetails?.skills || [];
    skills.forEach((skill: any) => {
      const skillName = typeof skill === 'string' ? skill : String(skill.name || skill);
      skillsMap.set(skillName, (skillsMap.get(skillName) || 0) + 1);
    });
  });

  const topSkills = [...skillsMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([skill]) => skill);

  const result = {
    totalApplicants,
    averageExperienceYears: Math.round(avgExperience * 10) / 10,
    topSkills,
    locationDistribution: locationDist,
    applicantProfiles: applications.map(app => ({
      id: app._id.toString(),
      applicationId: app.applicationId,
      experienceYears: Number(app.experienceYears || 0),
      location: String(app.location || 'Unknown'),
      skills: app.offerDetails?.skills || [],
      appliedAt: app.createdAt || app.appliedAt,
    })),
  };

  await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.APPLICANT_INSIGHTS));
  await this.logFeatureUsage(user.id, 'applicantInsights', { jobId });

  return result;
}

  // async getJobApplicantInsights(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
  //   // PREMIUM VERIFICATION COMMENTED
  //   // if (!(await this.hasPremiumAccess(user))) {
  //   //   throw new AuthorizationError('Premium subscription required for applicant insights');
  //   // }

  //   // const { hasAccess, remaining } = await this.checkFeatureLimit(user, 'applicantInsights');
  //   // if (!hasAccess) {
  //   //   throw new AppError(`Applicant insights limit reached. Remaining: ${remaining}`, 429);
  //   // }

  //   const cacheKey = `${constants.CACHE_KEYS.APPLICANT_INSIGHTS}:${jobId}`;
  //   const cached = await CacheUtil.get(cacheKey);
  //   if (cached) return JSON.parse(cached);

  //   const applications = await JobApplication.find({ jobId, status: { $ne: 'withdrawn' } }).lean();
  //   if (!applications.length) {
  //     return { totalApplicants: 0, message: 'No applications yet' };
  //   }

  //   const totalApplicants = applications.length;
  //   const avgExperience = applications.reduce((sum, a) => sum + (a.experienceYears || 0), 0) / totalApplicants;

  //   const skillsMap = new Map<string, number>();
  //   applications.forEach((app: any) => {
  //     (app.offerDetails.skills || []).forEach((skill: any) => {
  //       skillsMap.set(skill, (skillsMap.get(skill) || 0) + 1);
  //     });
  //   });

  //   const topSkills = [...skillsMap.entries()]
  //     .sort((a, b) => b[1] - a[1])
  //     .slice(0, 5)
  //     .map(([skill]) => skill);

  //   const locationDist = applications.reduce((acc: Record<string, number>, app) => {
  //     const loc = app.location || 'Unknown';
  //     acc[loc] = (acc[loc] || 0) + 1;
  //     return acc;
  //   }, {});

  //   const result = {
  //     totalApplicants,
  //     averageExperienceYears: Math.round(avgExperience * 10) / 10,
  //     topSkills,
  //     locationDistribution: locationDist,
  //     applicantProfiles: applications.map(app => ({
  //       id: app._id.toString(),
  //       experienceYears: app.experienceYears,
  //       skills: app.offerDetails?.skills || [],
  //     })),
  //   };

  //   await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.APPLICANT_INSIGHTS));
  //   await this.logFeatureUsage(user.id, 'applicantInsights', { jobId });

  //   return result;
  // }

  // 2. Competition Level (quick count)
  async getCompetitionLevel(jobId: string, user: { id: string; isPremium?: boolean }): Promise<string> {
    // PREMIUM VERIFICATION COMMENTED
    // if (!(await this.hasPremiumAccess(user))) {
    //   throw new AuthorizationError('Premium required for competition level');
    // }

    const cacheKey = `${constants.CACHE_KEYS.COMPETITION_LEVEL}:${jobId}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const count = await JobApplication.countDocuments({ jobId, status: { $ne: 'withdrawn' } });

    let level: string;
    if (count < 10) level = 'Low';
    else if (count < 50) level = 'Medium';
    else level = 'High';

    await CacheUtil.set(cacheKey, level, Number(constants.CACHE_TTLS.COMPETITION_LEVEL));
    return level;
  }

  // 3. Competitive Analysis (now direct, no Kafka)
  async analyzeJobCompetition(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
    // PREMIUM VERIFICATION COMMENTED
    // if (!(await this.hasPremiumAccess(user))) {
    //   throw new AuthorizationError('Premium required for competitive analysis');
    // }

    // const { hasAccess } = await this.checkFeatureLimit(user, 'competitiveAnalysis');
    // if (!hasAccess) throw new AppError('Competitive analysis limit reached', 429);

    const cacheKey = `${constants.CACHE_KEYS.JOB_COMPETITION}:${jobId}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const job = await Job.findById(jobId).lean();
    if (!job) throw new NotFoundError('Job not found');

    // Real logic would use vector search / ML, here placeholder
    const result = {
      similarJobsCount: 12,
      averageSalary: 105000,
      salaryRange: { min: 85000, max: 130000 },
      competitorInsights: ['3 companies hiring similar roles this month'],
      marketTrends: ['High demand for remote positions'],
      status: 'completed',
    };

    await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_COMPETITION));
    await this.logFeatureUsage(user.id, 'competitiveAnalysis', { jobId });

    return result;
  }

  // 4. Salary Benchmark (direct)
  async getSalaryBenchmark(title: string, location: string, experience: number): Promise<any> {
    const cacheKey = `${constants.CACHE_KEYS.SALARY_BENCHMARK}:${title}:${location}:${experience}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Placeholder - real would use external API or DB aggregate
    const result = {
      averageSalary: 98000,
      percentile25: 82000,
      percentile75: 115000,
      marketRate: experience > 5 ? 'Above average' : 'Competitive',
    };

    await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.SALARY_BENCHMARK));
    return result;
  }

  // =============================================================================
  // InMail Credits Management
  // =============================================================================
  async getInmailCredits(userId: string): Promise<{ availableCredits: number; usedThisMonth: number; resetDate: Date }> {
    const cacheKey = `${constants.CACHE_KEYS.INMAIL_CREDITS}:${userId}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const creditsKey = `user_credits:${userId}`;
    let credits = await CacheUtil.get(creditsKey);

    const defaultCredits = {
      availableCredits: 5,
      usedThisMonth: 0,
      resetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    };

    credits = credits ? JSON.parse(credits) : defaultCredits;

    await CacheUtil.set(cacheKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));
    return credits;
  }

  async useInmailCredit(userId: string, recipientId: string): Promise<any> {
    // PREMIUM VERIFICATION COMMENTED - Allow unlimited InMail for now
    // const credits = await this.getInmailCredits(userId);
    // if (credits.availableCredits <= 0) {
    //   throw new AppError('No InMail credits remaining this month', 429);
    // }

    // credits.availableCredits -= 1;
    // credits.usedThisMonth += 1;

    // const creditsKey = `user_credits:${userId}`;
    // const cacheKey = `${constants.CACHE_KEYS.INMAIL_CREDITS}:${userId}`;

    // await CacheUtil.set(creditsKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));
    // await CacheUtil.set(cacheKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));

    await this.logFeatureUsage(userId, 'inmailCredits', { recipientId });

    return {
      success: true,
      remainingCredits: 'unlimited',
      message: 'InMail sent successfully',
    };
  }

  async refillMonthlyCredits(userId: string): Promise<any> {
    const credits = {
      availableCredits: 5,
      usedThisMonth: 0,
      resetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    };

    const creditsKey = `user_credits:${userId}`;
    const cacheKey = `${constants.CACHE_KEYS.INMAIL_CREDITS}:${userId}`;

    await CacheUtil.set(creditsKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));
    await CacheUtil.set(cacheKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));

    return { success: true, creditsRefilled: 5 };
  }

  // Check if user can send InMail
  async canSendInmail(userId: string): Promise<boolean> {
    // PREMIUM VERIFICATION COMMENTED - Always allow
    return true;

    // const credits = await this.getInmailCredits(userId);
    // return credits.availableCredits > 0;
  }

  // =============================================================================
  // Interview Preparation
  // =============================================================================
  async getInterviewQuestions(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
    // PREMIUM VERIFICATION COMMENTED
    // if (!(await this.hasPremiumAccess(user))) throw new AuthorizationError('Premium required');

    const cacheKey = `${constants.CACHE_KEYS.INTERVIEW_QUESTIONS}:${jobId}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const job = await Job.findById(jobId).lean();
    if (!job) throw new NotFoundError('Job not found');

    // Placeholder - real would use AI generation
    const result = {
      behavioral: ['Tell me about a time you faced a challenge'],
      technical: ['Explain REST vs GraphQL'],
      roleSpecific: [`How would you handle ${job.title} responsibilities?`],
      company: ['Why do you want to work here?'],
      status: 'completed',
    };

    await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.INTERVIEW_QUESTIONS) || 86400);
    await this.logFeatureUsage(user.id, 'interviewQuestions', { jobId });

    return result;
  }

  async getInterviewTips(companyId: string, roleType: string): Promise<any> {
    const cacheKey = `${constants.CACHE_KEYS.INTERVIEW_TIPS}:${companyId}:${roleType}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Placeholder
    const result = {
      general: ['Be confident', 'Prepare questions'],
      companySpecific: ['Research recent news'],
      roleSpecific: [`Highlight ${roleType} experience`],
      dressCode: 'business-casual',
      format: 'hybrid',
    };

    await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.INTERVIEW_TIPS));
    return result;
  }

  // Generate Interview Prep (placeholder)
  async generateInterviewPrep(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
    // PREMIUM VERIFICATION COMMENTED
    // if (!(await this.hasPremiumAccess(user))) {
    //   throw new AuthorizationError('Premium required for interview prep');
    // }

    const cacheKey = `${constants.CACHE_KEYS.INTERVIEW_PREP}:${jobId}:${user.id}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const job = await Job.findById(jobId).lean();
    if (!job) throw new NotFoundError('Job not found');

    const result = {
      jobId,
      prepId: `prep_${Date.now()}`,
      questions: await this.getInterviewQuestions(jobId, user),
      recommendedResources: ['Company website', 'Glassdoor reviews'],
      practiceTopics: ['Technical skills', 'Behavioral questions'],
      estimatedPrepTime: '4-6 hours',
      status: 'generated',
    };

    await CacheUtil.set(cacheKey, JSON.stringify(result), 86400);
    await this.logFeatureUsage(user.id, 'interviewPrep', { jobId });

    return result;
  }

  // Update Interview Prep Progress
  async updatePrepProgress(userId: string, jobId: string, completedItems: string[]): Promise<any> {
    const progressKey = `interview_prep_progress:${userId}:${jobId}`;
    
    const progress = {
      userId,
      jobId,
      completedItems,
      lastUpdated: new Date(),
      completionPercentage: Math.min((completedItems.length / 10) * 100, 100), // Assuming 10 total items
    };

    await CacheUtil.set(progressKey, JSON.stringify(progress), 86400 * 7); // 7 days
    
    return progress;
  }

  // Get Premium Features (placeholder)
  async getPremiumFeatures(userId: string): Promise<any> {
    const cacheKey = `${constants.CACHE_KEYS.PREMIUM_FEATURES}:${userId}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const features = {
      applicantInsights: { enabled: true, limit: 'unlimited' },
      competitiveAnalysis: { enabled: true, limit: 'unlimited' },
      inmailCredits: { enabled: true, limit: 'unlimited' },
      interviewPrep: { enabled: true, limit: 'unlimited' },
      salaryBenchmark: { enabled: true, limit: 'unlimited' },
    };

    await CacheUtil.set(cacheKey, JSON.stringify(features), 3600);
    return features;
  }

  // Get Premium Analytics (placeholder)
  async getPremiumAnalytics(params: { userId: string }): Promise<any> {
    const cacheKey = `${constants.CACHE_KEYS.PREMIUM_ANALYTICS}:${params.userId}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const analytics = {
      userId: params.userId,
      featureUsage: {
        applicantInsights: 3,
        competitiveAnalysis: 1,
        inmailCredits: 2,
        interviewPrep: 5,
      },
      mostUsedFeature: 'interviewPrep',
      subscriptionStatus: 'active',
      usageTrend: 'increasing',
    };

    await CacheUtil.set(cacheKey, JSON.stringify(analytics), 3600);
    return analytics;
  }
}

// Export singleton instance
export const premiumService = new PremiumService();



// // src/services/premium.service.ts
// import CacheUtil from '@/utils/cache.util';
// import logger from '@/utils/logger.util';
// import { AppError, NotFoundError, AuthorizationError } from '@/errors/app.error';
// import ResponseUtil from '@/utils/response.util';

// import { Job, JobApplication } from '@/models';
// import constants from '@/utils/constants.util';

// // =============================================================================
// // Core Premium Features
// // =============================================================================

// class PremiumService {

// // Utility to check if user has premium access (cache + DB)
// async hasPremiumAccess(user: { id: string; isPremium?: boolean }): Promise<boolean> {
//   const cacheKey = `${constants.CACHE_KEYS.PREMIUM_ACCESS}:${user.id}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if (cached !== null) return JSON.parse(cached);

//   const hasAccess = !!user.isPremium;
//   await CacheUtil.set(cacheKey, JSON.stringify(hasAccess), Number(constants.CACHE_TTLS.PREMIUM_ACCESS));
//   return hasAccess;
// }

// // Utility to check feature usage limit (monthly reset)
// async checkFeatureLimit(userId: string, feature: string): Promise<{ hasAccess: boolean; remaining: number | 'unlimited' }> {
//   const limits: Record<string, number | 'unlimited'> = {
//     applicantInsights: 10,
//     competitiveAnalysis: 5,
//     inmailCredits: 5,
//     interviewPrep: 'unlimited',
//   };

//   const limit = limits[feature];
//   if (limit === 'unlimited') return { hasAccess: true, remaining: 'unlimited' };

//   const monthKey = `${constants.CACHE_KEYS.FEATURE_USAGE}:${userId}:${feature}:${new Date().getMonth()}`;
//   const count = Number(await CacheUtil.get(monthKey) || '0');

//   const hasAccess = count < limit;
//   const remaining = limit - count;

//   return { hasAccess, remaining };
// }

// // Log feature usage (increments count)
// async logFeatureUsage(userId: string, feature: string, details: Record<string, any> = {}): Promise<void> {
//   const monthKey = `${constants.CACHE_KEYS.FEATURE_USAGE}:${userId}:${feature}:${new Date().getMonth()}`;
//   await CacheUtil.incr(monthKey);
//   await CacheUtil.expire(monthKey, Number(constants.CACHE_TTLS.FEATURE_USAGE));

//   logger.info(`Feature used`, { userId, feature, details });
// }

// // 1. Applicant Insights
// async getJobApplicantInsights(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
//   if (!(await this.hasPremiumAccess(user))) {
//     throw new AuthorizationError('Premium subscription required for applicant insights');
//   }

//   const { hasAccess, remaining } = await this.checkFeatureLimit(user.id, 'applicantInsights');
//   if (!hasAccess) {
//     throw new AppError(`Applicant insights limit reached. Remaining: ${remaining}`, 429);
//   }

//   const cacheKey = `${constants.CACHE_KEYS.APPLICANT_INSIGHTS}:${jobId}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if (cached) return JSON.parse(cached);

//   const applications = await JobApplication.find({ jobId, status: { $ne: 'withdrawn' } }).lean();
//   if (!applications.length) {
//     return { totalApplicants: 0, message: 'No applications yet' };
//   }

//   const totalApplicants = applications.length;
//   const avgExperience = applications.reduce((sum, a) => sum + (a.experienceYears || 0), 0) / totalApplicants;

//   const skillsMap = new Map<string, number>();
//   applications.forEach((app: any) => {
//     (app.offerDetails.skills || []).forEach((skill: any) => {
//       skillsMap.set(skill, (skillsMap.get(skill) || 0) + 1);
//     });
//   });

//   const topSkills = [...skillsMap.entries()]
//     .sort((a, b) => b[1] - a[1])
//     .slice(0, 5)
//     .map(([skill]) => skill);

//   const locationDist = applications.reduce((acc: Record<string, number>, app) => {
//     const loc = app.location || 'Unknown';
//     acc[loc] = (acc[loc] || 0) + 1;
//     return acc;
//   }, {});

//   const result = {
//     totalApplicants,
//     averageExperienceYears: Math.round(avgExperience * 10) / 10,
//     topSkills,
//     locationDistribution: locationDist,
//     applicantProfiles: applications.map(app => ({
//       id: app._id.toString(),
//       experienceYears: app.experienceYears,
//       skills: app.offerDetails?.skills || [],
//     })),
//   };

//   await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.APPLICANT_INSIGHTS));
//   await this.logFeatureUsage(user.id, 'applicantInsights', { jobId });

//   return result;
// }

// // 2. Competition Level (quick count)
// async getCompetitionLevel(jobId: string): Promise<string> {
//   const cacheKey = `${constants.CACHE_KEYS.COMPETITION_LEVEL}:${jobId}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if (cached) return cached;

//   const count = await JobApplication.countDocuments({ jobId, status: { $ne: 'withdrawn' } });

//   let level: string;
//   if (count < 10) level = 'Low';
//   else if (count < 50) level = 'Medium';
//   else level = 'High';

//   await CacheUtil.set(cacheKey, level, Number(constants.CACHE_TTLS.COMPETITION_LEVEL));
//   return level;
// }

// // 3. Competitive Analysis (now direct, no Kafka)
// async analyzeJobCompetition(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
//   if (!(await this.hasPremiumAccess(user))) {
//     throw new AuthorizationError('Premium required for competitive analysis');
//   }

//   const { hasAccess } = await this.checkFeatureLimit(user.id, 'competitiveAnalysis');
//   if (!hasAccess) throw new AppError('Competitive analysis limit reached', 429);

//   const cacheKey = `${constants.CACHE_KEYS.JOB_COMPETITION}:${jobId}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if (cached) return JSON.parse(cached);

//   const job = await Job.findById(jobId).lean();
//   if (!job) throw new NotFoundError('Job not found');

//   // Real logic would use vector search / ML, here placeholder
//   const result = {
//     similarJobsCount: 12,
//     averageSalary: 105000,
//     salaryRange: { min: 85000, max: 130000 },
//     competitorInsights: ['3 companies hiring similar roles this month'],
//     marketTrends: ['High demand for remote positions'],
//     status: 'completed',
//   };

//   await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_COMPETITION));
//   await this.logFeatureUsage(user.id, 'competitiveAnalysis', { jobId });

//   return result;
// }

// // 4. Salary Benchmark (direct)
// async getSalaryBenchmark(title: string, location: string, experience: number): Promise<any> {
//   const cacheKey = `${constants.CACHE_KEYS.SALARY_BENCHMARK}:${title}:${location}:${experience}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if (cached) return JSON.parse(cached);

//   // Placeholder - real would use external API or DB aggregate
//   const result = {
//     averageSalary: 98000,
//     percentile25: 82000,
//     percentile75: 115000,
//     marketRate: experience > 5 ? 'Above average' : 'Competitive',
//   };

//   await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.SALARY_BENCHMARK));
//   return result;
// }

// // =============================================================================
// // InMail Credits Management
// // =============================================================================
// async getInmailCredits(userId: string): Promise<{ availableCredits: number; usedThisMonth: number; resetDate: Date }> {
//   const cacheKey = `${constants.CACHE_KEYS.INMAIL_CREDITS}:${userId}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if (cached) return JSON.parse(cached);

//   const creditsKey = `user_credits:${userId}`;
//   let credits = await CacheUtil.get(creditsKey);

//   const defaultCredits = {
//     availableCredits: 5,
//     usedThisMonth: 0,
//     resetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
//   };

//   credits = credits ? JSON.parse(credits) : defaultCredits;

//   await CacheUtil.set(cacheKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));
//   return credits;
// }

// async useInmailCredit(userId: string, recipientId: string): Promise<any> {
//   const credits = await this.getInmailCredits(userId);
//   if (credits.availableCredits <= 0) {
//     throw new AppError('No InMail credits remaining this month', 429);
//   }

//   credits.availableCredits -= 1;
//   credits.usedThisMonth += 1;

//   const creditsKey = `user_credits:${userId}`;
//   const cacheKey = `${constants.CACHE_KEYS.INMAIL_CREDITS}:${userId}`;

//   await CacheUtil.set(creditsKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));
//   await CacheUtil.set(cacheKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));

//   await this.logFeatureUsage(userId, 'inmailCredits', { recipientId });

//   return {
//     success: true,
//     remainingCredits: credits.availableCredits,
//     message: 'InMail credit used successfully',
//   };
// }

// async refillMonthlyCredits(userId: string): Promise<any> {
//   const credits = {
//     availableCredits: 5,
//     usedThisMonth: 0,
//     resetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
//   };

//   const creditsKey = `user_credits:${userId}`;
//   const cacheKey = `${constants.CACHE_KEYS.INMAIL_CREDITS}:${userId}`;

//   await CacheUtil.set(creditsKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));
//   await CacheUtil.set(cacheKey, JSON.stringify(credits), Number(constants.CACHE_TTLS.INMAIL_CREDITS));

//   return { success: true, creditsRefilled: 5 };
// }

// // =============================================================================
// // Interview Preparation
// // =============================================================================
// async getInterviewQuestions(jobId: string, user: { id: string; isPremium?: boolean }): Promise<any> {
//   if (!(await this.hasPremiumAccess(user))) throw new AuthorizationError('Premium required');

//   const cacheKey = `${constants.CACHE_KEYS.INTERVIEW_QUESTIONS}:${jobId}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if (cached) return JSON.parse(cached);

//   const job = await Job.findById(jobId).lean();
//   if (!job) throw new NotFoundError('Job not found');

//   // Placeholder - real would use AI generation
//   const result = {
//     behavioral: ['Tell me about a time you faced a challenge'],
//     technical: ['Explain REST vs GraphQL'],
//     roleSpecific: [`How would you handle ${job.title} responsibilities?`],
//     company: ['Why do you want to work here?'],
//     status: 'completed',
//   };

//   await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.INTERVIEW_QUESTIONS) || 86400);
//   await this.logFeatureUsage(user.id, 'interviewQuestions', { jobId });

//   return result;
// }

//   async getInterviewTips(companyId: string, roleType: string): Promise < any > {
//   const cacheKey = `${constants.CACHE_KEYS.INTERVIEW_TIPS}:${companyId}:${roleType}`;
//   const cached = await CacheUtil.get(cacheKey);
//   if(cached) return JSON.parse(cached);

//   // Placeholder
//   const result = {
//     general: ['Be confident', 'Prepare questions'],
//     companySpecific: ['Research recent news'],
//     roleSpecific: [`Highlight ${roleType} experience`],
//     dressCode: 'business-casual',
//     format: 'hybrid',
//   };

//   await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.INTERVIEW_TIPS));
//   return result;
// }
// }

// // Export singleton instance
// export const premiumService = new PremiumService();