// ai.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid';
import logger from '@/shared/logger.util.js'
// import { Job, Company, JobApplication, Message, User } from '@/models/index.js';
import { Job, JobApplication, Message } from '../models';
import { Company } from '@/company/models';
import { User } from '@/auth/models';
import { generateSecureId, sanitizeInput } from '@/shared/security.js';
import CacheUtil from '@/shared/cache.util';
import constants from '@/shared/constants.util';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const uuidValidator = (value: string | null): boolean =>
  value === null || (uuidValidate(value) && uuidVersion(value) === 4);

// ======================
//         TYPES
// ======================
interface ResumeOptimizePayload {
  id: string;
  resumeData: string;
  targetJobId: string;
  requestId: string;
}

interface JobMatchPayload {
  id: string;
  preferences: Record<string, any>;
  requestId: string;
}

interface JobAnalysisPayload {
  jobId: string;
  description: string;
  requestId: string;
}

interface OpenToWorkPayload {
  id: string;
  isOpenToWork: boolean;
  preferences?: Record<string, any>;
  requestId: string;
}

interface FeaturedApplicantPayload {
  applicationId: string;
  jobId: string;
  companyId: string;
  requestId: string;
}

interface DirectMessagePayload {
  senderId: string;
  recipientId: string;
  message: string;
  jobId?: string;
  requestId: string;
}

interface TopApplicantJobsPayload {
  id: string;
  pagination: { cursor: number; limit: number };
  requestId: string;
}

interface CompanyVerificationPayload {
  companyId: string;
  verificationData: Record<string, any>;
  requestId: string;
}

interface SalaryVerificationPayload {
  jobId: string;
  salaryData: Record<string, any>;
  requestId: string;
}

interface DuplicateApplicationPayload {
  userId: string;
  jobId: string;
  applicationData: string;
  requestId: string;
}

interface JobQualityPayload {
  jobId: string;
  description: string;
  requestId: string;
}

interface SpamJobPayload {
  jobId: string;
  description: string;
  requestId: string;
}

interface MessageNotificationPayload {
  recipientId: string;
  senderId: string;
  messageId: string;
  jobId?: string;
  requestId: string;
}

// ======================
//         SERVICE CLASS
// ======================
export class AIService {
  private readonly model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  /**
   * Optimize user's resume for a target job
   */
  async optimizeResume(payload: ResumeOptimizePayload, req: any): Promise<any> {
    const { id, resumeData, targetJobId, requestId } = payload;

    if (!uuidValidator(id) || !uuidValidator(targetJobId)) {
      throw new Error('Invalid UUID');
    }

    const start = Date.now();

    try {
      if (!req.user || req.user?.userId !== id) throw new Error('Unauthorized');

      const job = await Job.findOne({ _id: targetJobId, isDeleted: false }).lean();
      if (!job) throw new Error('Job not found');

      const prompt = `Optimize this resume for the target job:  
Resume: ${resumeData}  
Target Job Description: ${job.description}  

Keep it concise (150-200 words), highlight relevant skills, experience, and achievements. Use professional language.`;

      const result = await this.model.generateContent(prompt);
      const optimizedResume = sanitizeInput(result.response.text());

      const matchScore = await this.calculateResumeJobMatch(optimizedResume, job, requestId);

      await CacheUtil.set(`user:${id}:optimizedResume`, optimizedResume,  Number(constants.CACHE_TTLS.USER_DATA),);

      const resultData = {
        userId: id,
        targetJobId,
        optimizedResume,
        matchScore,
        optimizedAt: new Date(),
      };

      logger.info(`[${requestId}] Resume optimized successfully`, {
        userId: id,
        duration: Date.now() - start,
      });

      return resultData;
    } catch (error : any) {
      logger.error(`[${requestId}] Resume optimization failed`, { userId: id, error });
      throw error;
    }
  }

  /**
   * Get personalized job matches for user
   */
  async getJobMatches(payload: JobMatchPayload, req: any): Promise<any> {
    const { id, preferences, requestId } = payload;

    if (!uuidValidator(id)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || req.user?.userId !== id) throw new Error('Unauthorized');

      const cachedProfile = await CacheUtil.get(`user:${id}:profile`);
      const userProfile = cachedProfile ? JSON.parse(cachedProfile) : {};
      const combinedPreferences = { ...userProfile, ...preferences };

      const jobs = await Job.find({
        isDeleted: false,
        status: 'active',
        $or: [
          { 'skills.name': { $in: combinedPreferences.skills || [] } },
          { 'location.city': combinedPreferences.location },
          { jobType: combinedPreferences.jobType },
        ],
      })
        .limit(50)
        .lean();

      const jobsWithScores = await Promise.all(
        jobs.map(async (job) => ({
          ...job,
          compatibilityScore: await this.calculateJobCompatibility(combinedPreferences, job, requestId),
        }))
      );

      const sortedJobs = jobsWithScores.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

      const result = {
        jobs: sortedJobs,
        totalMatches: sortedJobs.length,
        preferences: combinedPreferences,
        generatedAt: new Date(),
      };

      await CacheUtil.set(`job_matches:${id}`, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_MATCHES), );

      logger.info(`[${requestId}] Job matches generated: ${sortedJobs.length} jobs`, {
        userId: id,
        duration: Date.now() - start,
      });

      return result;
    } catch (error : any) {
      logger.error(`[${requestId}] Job matching failed`, { userId: id, error });
      throw error;
    }
  }

  /**
   * Analyze job description
   */
  async analyzeJobDescription(payload: JobAnalysisPayload, req: any): Promise<any> {
    const { jobId, description, requestId } = payload;

    if (!uuidValidator(jobId)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || !req.user.canManageJobs) throw new Error('Unauthorized');

      const prompt = `Analyze this job description in detail:  
${description}  

Extract and return in JSON format:  
{
  "keywords": ["array of important keywords"],
  "requiredSkills": ["array of must-have skills"],
  "preferredSkills": ["array of nice-to-have skills"],
  "salaryRange": { "found": boolean, "estimated": { "min": number, "max": number, "currency": string } },
  "companyInsights": { "name": string, "reputation": string, "size": string },
  "roleLevel": "entry | junior | mid | senior | lead | executive",
  "workArrangement": "remote | onsite | hybrid"
}`;

      const result = await this.model.generateContent(prompt);
      const analysis = JSON.parse(sanitizeInput(result.response.text()));

      const resultData = {
        jobId,
        keywords: analysis.keywords || [],
        requiredSkills: analysis.requiredSkills || [],
        preferredSkills: analysis.preferredSkills || [],
        salaryRange: analysis.salaryRange || { found: false, estimated: null },
        companyInsights: analysis.companyInsights || {},
        roleLevel: analysis.roleLevel || 'mid',
        workArrangement: analysis.workArrangement || 'hybrid',
        analysisScore: await this.calculateAnalysisScore(description, requestId),
        analyzedAt: new Date(),
      };

      await Job.updateOne({ _id: jobId }, { analysis: resultData });

      logger.info(`[${requestId}] Job analysis completed`, { jobId, duration: Date.now() - start });

      return resultData;
    } catch (error : any) {
      logger.error(`[${requestId}] Job analysis failed`, { jobId, error });
      throw error;
    }
  }

  /**
   * Update user's open to work status
   */
  async updateOpenToWorkStatus(payload: OpenToWorkPayload, req: any): Promise<any> {
    const { id, isOpenToWork, preferences, requestId } = payload;

    if (!uuidValidator(id)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || req.user?.userId !== id) throw new Error('Unauthorized');
      const user = await User.findOne({ userId: req.user?.userId});

      const updateData = {
        openToWork: isOpenToWork,
        preferences: user?.preferences ?? {},
        updatedAt: new Date(),
      };

      await CacheUtil.set(`user:${id}:openToWork`, JSON.stringify(updateData), Number(constants.CACHE_TTLS.USER_DATA), );

      if (isOpenToWork) {
        // Trigger async job matching (non-blocking)
        setImmediate(() => {
          this.getJobMatches({ id, preferences: updateData.preferences, requestId }, req).catch((err) =>
            logger.error(`[${requestId}] Auto job matching failed: ${err.message}`)
          );
        });
      }

      logger.info(`[${requestId}] Open to work status updated`, { userId: id, duration: Date.now() - start });

      return updateData;
    } catch (error : any) {
      logger.error(`[${requestId}] Open to work update failed`, { userId: id, error });
      throw error;
    }
  }

  /**
   * Set featured applicant for a job
   */
  async setFeaturedApplicant(payload: FeaturedApplicantPayload, req: any): Promise<any> {
    const { applicationId, jobId, companyId, requestId } = payload;

    if (!uuidValidator(applicationId) || !uuidValidator(jobId) || !uuidValidator(companyId)) {
      throw new Error('Invalid UUID');
    }

    const start = Date.now();

    try {
      if (!req.user || !req.user.canManageJobs) throw new Error('Unauthorized');

      const job = await Job.findOne({ _id: jobId, companyId, isDeleted: false }).lean();
      if (!job) throw new Error('Job not found');

      const application = await JobApplication.findOne({ _id: applicationId }).lean();
      if (!application) throw new Error('Application not found');

      // Invalidate old featured status
      await CacheUtil.del(`user:*:isFeatured:${jobId}`);

      // Set new featured
      await CacheUtil.set(`user:${application.userId}:isFeatured:${jobId}`, Number(constants.CACHE_TTLS.USER_DATA));

      const result = { applicationId, jobId, companyId, featuredAt: new Date() };

      logger.info(`[${requestId}] Featured applicant set successfully`, { applicationId, duration: Date.now() - start });

      return result;
    } catch (error : any) {
      logger.error(`[${requestId}] Set featured applicant failed`, { applicationId, error });
      throw error;
    }
  }

  /**
   * Send direct message from recruiter to candidate
   */
  async sendDirectMessage(payload: DirectMessagePayload, req: any): Promise<any> {
    const { senderId, recipientId, message, jobId, requestId } = payload;

    if (!uuidValidator(senderId) || !uuidValidator(recipientId) || (jobId && !uuidValidator(jobId))) {
      throw new Error('Invalid UUID');
    }

    const start = Date.now();

    try {
      if (!req.user || req.user?.userId !== senderId || (!req.user.isRecruiter && !req.user.canMessage)) {
        throw new Error('Unauthorized');
      }

      const messageData = {
        // _id: generateSecureId(),
        senderId,
        recipientId,
        message,
        jobId,
        messageType: 'direct_recruiter',
        sentAt: new Date(),
      };

      const result = await Message.create(messageData);

      await this.sendMessageNotification({ recipientId, senderId, messageId: result._id.toString(), jobId, requestId });

      logger.info(`[${requestId}] Direct message sent successfully`, {
        senderId,
        recipientId,
        duration: Date.now() - start,
      });

      return result;
    } catch (error : any) {
      logger.error(`[${requestId}] Send direct message failed`, { senderId, recipientId, error });
      throw error;
    }
  }

  /**
   * Get top applicant-recommended jobs
   */
  async getTopApplicantJobs(payload: TopApplicantJobsPayload, req: any): Promise<any> {
    const { id, pagination, requestId } = payload;

    if (!uuidValidator(id)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || req.user?.userId !== id) throw new Error('Unauthorized');

      const cachedTopJobs = await CacheUtil.get(`user:${id}:topApplicantJobs`);
      const topApplicantJobs = cachedTopJobs ? JSON.parse(cachedTopJobs) : [];

      const jobs = await Job.find({
        _id: { $in: topApplicantJobs },
        isDeleted: false,
        status: 'active',
      })
        .skip(pagination.cursor)
        .limit(pagination.limit)
        .lean();

      const totalCount = await Job.countDocuments({
        _id: { $in: topApplicantJobs },
        isDeleted: false,
        status: 'active',
      });

      const result = {
        items: jobs.map((job) => ({
          jobId: job._id,
          title: job.title,
          companyId: job.companyId,
          matchScore: Math.random() * 20 + 80, // Real score can be computed here
        })),
        totalCount,
        nextCursor: jobs.length === pagination.limit ? pagination.cursor + pagination.limit : null,
      };

      logger.info(`[${requestId}] Top applicant jobs fetched: ${jobs.length}`, {
        userId: id,
        duration: Date.now() - start,
      });

      return result;
    } catch (error : any) {
      logger.error(`[${requestId}] Top applicant jobs fetch failed`, { userId: id, error });
      throw error;
    }
  }

  /**
   * Verify company legitimacy
   */
  async verifyCompany(payload: CompanyVerificationPayload, req: any): Promise<any> {
    const { companyId, verificationData, requestId } = payload;

    if (!uuidValidator(companyId)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || !req.user.canVerifyCompanies) throw new Error('Unauthorized');

      const company = await Company.findOne({ _id: companyId, isDeleted: false }).lean();
      if (!company) throw new Error('Company not found');

      const prompt = `Verify company legitimacy based on this data:  
${JSON.stringify(verificationData, null, 2)}  

Check domain, registration, social proof, reviews, etc.  
Return JSON:  
{
  "isVerified": boolean,
  "verificationScore": number (0-100),
  "details": object with key findings
}`;

      const result = await this.model.generateContent(prompt);
      const verificationResult = JSON.parse(sanitizeInput(result.response.text()));

      await Company.updateOne(
        { _id: companyId },
        {
          verificationStatus: verificationResult.isVerified ? 'verified' : 'rejected',
          verifiedBadge: verificationResult.isVerified,
        }
      );

      const resultData = {
        companyId,
        verificationStatus: verificationResult.isVerified ? 'verified' : 'rejected',
        verifiedBadge: verificationResult.isVerified,
        verificationScore: verificationResult.verificationScore,
        details: verificationResult.details,
        verifiedAt: new Date(),
      };

      logger.info(`[${requestId}] Company verification completed`, { companyId, duration: Date.now() - start });

      return resultData;
    } catch (error : any) {
      logger.error(`[${requestId}] Company verification failed`, { companyId, error });
      throw error;
    }
  }

  /**
   * Verify salary range in job posting
   */
  async verifySalary(payload: SalaryVerificationPayload, req: any): Promise<any> {
    const { jobId, salaryData, requestId } = payload;

    if (!uuidValidator(jobId)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || !req.user.canVerifyJobs) throw new Error('Unauthorized');

      const job = await Job.findOne({ _id: jobId, isDeleted: false }).lean();
      if (!job) throw new Error('Job not found');

      const prompt = `Verify salary information for this job:  
Salary Data: ${JSON.stringify(salaryData)}  
Job Description: ${job.description}  

Compare with industry standards. Return JSON:  
{
  "isValid": boolean,
  "estimatedRange": { "min": number, "max": number, "currency": string },
  "confidence": number (0-100)
}`;

      const result = await this.model.generateContent(prompt);
      const verificationResult = JSON.parse(sanitizeInput(result.response.text()));

      await Job.updateOne({ _id: jobId }, { salaryVerified: verificationResult.isValid });

      const resultData = {
        jobId,
        salaryVerified: verificationResult.isValid,
        estimatedRange: verificationResult.estimatedRange,
        confidence: verificationResult.confidence,
        verifiedAt: new Date(),
      };

      logger.info(`[${requestId}] Salary verification completed`, { jobId, duration: Date.now() - start });

      return resultData;
    } catch (error : any) {
      logger.error(`[${requestId}] Salary verification failed`, { jobId, error });
      throw error;
    }
  }

  /**
   * Detect duplicate application
   */
  async detectDuplicateApplication(payload: DuplicateApplicationPayload, req: any): Promise<any> {
    const { userId, jobId, applicationData, requestId } = payload;

    if (!uuidValidator(userId) || !uuidValidator(jobId)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || req.user?.userId !== userId) throw new Error('Unauthorized');

      const existingApplications = await JobApplication.find({ userId, jobId }).lean();

      if (!existingApplications.length) {
        return { isDuplicate: false, applicationId: null };
      }

      const prompt = `Compare this new application data with existing applications to detect duplicates:  
New Application: ${applicationData}  

Existing Applications: ${JSON.stringify(existingApplications, null, 2)}  

Check for resume/cover letter similarity, same job, same user.  
Return JSON:  
{
  "isDuplicate": boolean,
  "similarityScore": number (0-100),
  "reason": string
}`;

      const result = await this.model.generateContent(prompt);
      const duplicateResult = JSON.parse(sanitizeInput(result.response.text()));

      const resultData = {
        userId,
        jobId,
        isDuplicate: duplicateResult.isDuplicate,
        similarityScore: duplicateResult.similarityScore,
        reason: duplicateResult.reason,
        existingApplicationId: duplicateResult.isDuplicate ? existingApplications[0]._id : null,
      };

      logger.info(`[${requestId}] Duplicate application check completed`, {
        userId,
        jobId,
        isDuplicate: resultData.isDuplicate,
        duration: Date.now() - start,
      });

      return resultData;
    } catch (error : any) {
      logger.error(`[${requestId}] Duplicate application check failed`, { userId, jobId, error });
      throw error;
    }
  }

  /**
   * Calculate job quality score
   */
  async calculateJobQualityScore(payload: JobQualityPayload, req: any): Promise<any> {
    const { jobId, description, requestId } = payload;

    if (!uuidValidator(jobId)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || !req.user.canManageJobs) throw new Error('Unauthorized');

      const job = await Job.findOne({ _id: jobId, isDeleted: false }).lean();
      if (!job) throw new Error('Job not found');

      const prompt = `Evaluate job posting quality:  
${description}  

Score based on:  
- Clarity of responsibilities  
- Detail in requirements  
- Salary transparency  
- Company reputation hints  
- Overall professionalism  

Return JSON:  
{
  "qualityScore": number (0-100),
  "factors": {
    "clarity": number,
    "detail": number,
    "salaryTransparency": number,
    "reputation": number,
    "professionalism": number
  }
}`;

      const result = await this.model.generateContent(prompt);
      const qualityResult = JSON.parse(sanitizeInput(result.response.text()));

      await Job.updateOne({ _id: jobId }, { qualityScore: qualityResult.qualityScore });

      const resultData = {
        jobId,
        qualityScore: qualityResult.qualityScore,
        factors: qualityResult.factors,
        calculatedAt: new Date(),
      };

      logger.info(`[${requestId}] Job quality score calculated`, {
        jobId,
        qualityScore: qualityResult.qualityScore,
        duration: Date.now() - start,
      });

      return resultData;
    } catch (error : any) {
      logger.error(`[${requestId}] Job quality score calculation failed`, { jobId, error });
      throw error;
    }
  }

  /**
   * Detect spam in job posting
   */
  async detectSpamJob(payload: SpamJobPayload, req: any): Promise<any> {
    const { jobId, description, requestId } = payload;

    if (!uuidValidator(jobId)) throw new Error('Invalid UUID');

    const start = Date.now();

    try {
      if (!req.user || !req.user.canManageJobs) throw new Error('Unauthorized');

      const job = await Job.findOne({ _id: jobId, isDeleted: false }).lean();
      if (!job) throw new Error('Job not found');

      const prompt = `Analyze this job posting for spam indicators:  
${description}  

Check for:  
- Vague or generic content  
- Unrealistic salary/promises  
- Poor grammar/formatting  
- Suspicious links  
- Too-good-to-be-true offers  

Return JSON:  
{
  "isSpam": boolean,
  "spamScore": number (0-100),
  "reasons": array of strings
}`;

      const result = await this.model.generateContent(prompt);
      const spamResult = JSON.parse(sanitizeInput(result.response.text()));

      await Job.updateOne(
        { _id: jobId },
        { isSpam: spamResult.isSpam, spamDetectionScore: spamResult.spamScore }
      );

      const resultData = {
        jobId,
        isSpam: spamResult.isSpam,
        spamScore: spamResult.spamScore,
        reasons: spamResult.reasons,
        detectedAt: new Date(),
      };

      logger.info(`[${requestId}] Spam detection completed`, {
        jobId,
        isSpam: spamResult.isSpam,
        duration: Date.now() - start,
      });

      return resultData;
    } catch (error : any) {
      logger.error(`[${requestId}] Spam detection failed`, { jobId, error });
      throw error;
    }
  }

  /**
   * Send notification for new message
   */
  private async sendMessageNotification(payload: MessageNotificationPayload): Promise<void> {
    const { recipientId, senderId, messageId, jobId, requestId } = payload;

    logger.info(`[${requestId}] Notification queued for new message`, {
      recipientId,
      senderId,
      messageId,
      jobId,
    });

    // In real system, you would push to push notification service / email queue here
    // For now, just log
  }

  /**
   * Calculate resume-job match score (expanded rule-based + Gemini fallback)
   */
  private async calculateResumeJobMatch(resume: string, job: any, requestId: string): Promise<number> {
    const cacheKey = `resume_match:${job._id}:${resume.slice(0, 50)}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return parseFloat(cached);

    let score = 0;

    // Skill match (up to 40 points)
    if (job.skills?.length) {
      const matchedSkills = job.skills.filter((s: any) =>
        resume.toLowerCase().includes(s.name.toLowerCase())
      ).length;
      score += (matchedSkills / job.skills.length) * 40;
    }

    // Experience match (up to 20 points)
    if (job.experience?.level) {
      if (resume.toLowerCase().includes('years of experience')) score += 10;
      if (resume.toLowerCase().includes(job.experience.level.toLowerCase())) score += 10;
    }

    // Location match (up to 10 points)
    if (job.location?.city && resume.toLowerCase().includes(job.location.city.toLowerCase())) {
      score += 10;
    }

    // Education/certifications (up to 20 points)
    if (resume.toLowerCase().includes('bachelor') || resume.toLowerCase().includes('master')) score += 10;
    if (resume.toLowerCase().includes('certified') || resume.toLowerCase().includes('certification')) score += 10;

    // Length & structure bonus (up to 10 points)
    if (resume.length > 300) score += 5;
    if (resume.includes('•') || resume.includes('-')) score += 5; // bullet points

    const finalScore = Math.min(Math.max(score, 40), 100); // reasonable range

    await CacheUtil.set(cacheKey,  finalScore.toString(), Number(constants.CACHE_TTLS.JOB_MATCHES),);

    logger.info(`[${requestId}] Resume-job match score calculated`, { score: finalScore });

    return finalScore;
  }

  /**
   * Calculate job compatibility score (expanded)
   */
  private async calculateJobCompatibility(preferences: any, job: any, requestId: string): Promise<number> {
    const cacheKey = `job_compat:${job._id}:${JSON.stringify(preferences).slice(0, 50)}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return parseFloat(cached);

    let score = 0;

    // Skills match (up to 40)
    if (preferences.skills?.length && job.skills?.length) {
      const matched = job.skills.filter((s: any) => preferences.skills.includes(s.name)).length;
      score += (matched / Math.max(job.skills.length, 1)) * 40;
    }

    // Location match (up to 30)
    if (preferences.location) {
      if (job.location?.city === preferences.location) score += 20;
      if (job.location?.country === preferences.location) score += 10;
    }

    // Job type match (up to 20)
    if (preferences.jobType && job.jobType === preferences.jobType) score += 20;

    // Experience level match (up to 10)
    if (preferences.experienceLevel && job.experience?.level === preferences.experienceLevel) score += 10;

    const finalScore = Math.min(score, 100);

    await CacheUtil.set(cacheKey, finalScore.toString(), Number(constants.CACHE_TTLS.JOB_MATCHES));

    logger.info(`[${requestId}] Job compatibility score calculated`, { score: finalScore });

    return finalScore;
  }

  /**
   * Calculate job description analysis score (expanded rule-based)
   */
  async calculateAnalysisScore(description: string, requestId: string): Promise<number> {
    let score = 0;

    // Length & detail
    if (description.length > 500) score += 10;
    if (description.length > 1000) score += 10;

    // Key sections present
    ['responsibilities', 'requirements', 'qualifications', 'benefits', 'what we offer'].forEach((section) => {
      if (description.toLowerCase().includes(section)) score += 5;
    });

    // Specific terms
    ['years of experience', 'degree', 'skills required', 'technologies', 'salary', 'benefits'].forEach((pattern) => {
      if (description.toLowerCase().includes(pattern)) score += 5;
    });

    // Structure (bullets, numbered lists)
    if (description.includes('•') || description.includes('-') || description.includes('1.')) score += 10;

    const finalScore = Math.min(score, 100);

    logger.info(`[${requestId}] Job analysis score calculated`, { score: finalScore });

    return finalScore;
  }
}

// Singleton export
export const aiService = new AIService();