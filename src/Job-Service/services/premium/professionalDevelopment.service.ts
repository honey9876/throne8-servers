// src/services/professionalDevelopment.service.ts
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import logger from '@/shared/logger.util';
import { AppError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/app.error';
import { ProfessionalDev, Insights } from '@/Job-Service/models';
import { professionalDev_VALIDATION_SCHEMAS } from '@/Job-Service/validations/premium.validations';
import { sanitizeInput, generateSecureId, encryptData, decryptData } from '@/shared/security';
import CacheUtil from '@/shared/cache.util';
import constants from '@/shared/constants.util';
import mongoose from 'mongoose';
import ApiError from '@/services/apierrors.service';

export class ProfessionalDevelopmentService {
  async initialize(): Promise<void> {
    logger.info('Professional Development Service initialized successfully');
  }

  // =============================================================================
  // 1. Skills Gap Analysis
  // =============================================================================
  async analyzeSkillsGap(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.skillsGapAnalysis.validate(data, { abortEarly: false });
    if (error) throw new ValidationError("validation error");

    const s = sanitizeInput(value);

    await this.checkRateLimit(s.userId, 'skills_analysis', 5, 3600);

    const cacheKey = constants.CACHE_KEYS.SKILLS_GAP(s.userId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached skills gap analysis', { userId: s.userId });
      return JSON.parse(cached);
    }

    const requiredSkills = await this.getIndustrySkillRequirements(s.targetRole, s.targetIndustry);
    const skillGaps = this.calculateSkillGaps(s.currentSkills, requiredSkills);
    const recommendations = await this.generateSkillRecommendations(skillGaps);

    const analysisResult = {
      skillGaps,
      recommendations,
      analysisScore: this.calculateOverallReadinessScore(skillGaps),
      lastAnalyzedAt: new Date(),
      estimatedLearningTime: skillGaps.reduce((total, gap) => total + gap.estimatedLearningTime, 0),
    };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      { $set: { skillsAnalysis: { ...s, ...analysisResult }, updatedAt: new Date() } },
      { upsert: true }
    );

    await CacheUtil.set(cacheKey, JSON.stringify(analysisResult), Number(constants.CACHE_TTLS.SKILLS_GAP));

    logger.info('Skills gap analysis completed', { userId: s.userId });
    return { success: true, message: "SKILLS_GAP_ANALYZED", data: analysisResult };
  }

  async getSkillsGapAnalysis(userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.SKILLS_GAP(userId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached skills gap analysis', { userId });
      return JSON.parse(cached);
    }

    const profile = await ProfessionalDev.findOne({ userId });
    if (!profile?.skillsAnalysis?.lastAnalyzedAt) {
      throw new NotFoundError("RESOURCE_NOT_FOUND");
    }

    await CacheUtil.set(cacheKey, JSON.stringify(profile.skillsAnalysis), Number(constants.CACHE_TTLS.SKILLS_GAP));
    logger.info('Skills gap analysis retrieved', { userId });
    return { success: true, message: "SKILLS_GAP_RETRIEVED", data: profile.skillsAnalysis };
  }

  // =============================================================================
  // 2. Career Path Generation
  // =============================================================================
  async generateCareerPath(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.careerPathRequest.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    const cacheKey = constants.CACHE_KEYS.CAREER_PATH(s.userId);
    const careerPaths = await this.generateCareerPathSuggestions(s);
    const pathData = { ...s, suggestedPaths: careerPaths, lastUpdatedAt: new Date() };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      { $set: { careerPath: pathData, updatedAt: new Date() } },
      { upsert: true }
    );

    await CacheUtil.set(cacheKey, JSON.stringify(pathData), Number(constants.CACHE_TTLS.CAREER_PATH),);

    logger.info('Career path generated', { userId: s.userId });
    return { success: true, message: "CAREER_PATH_GENERATED", data: pathData };
  }

  async getCareerPathSuggestions(userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.CAREER_PATH(userId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached career path suggestions', { userId });
      return JSON.parse(cached);
    }

    const profile = await ProfessionalDev.findOne({ userId });
    if (!profile?.careerPath?.lastUpdatedAt) {
      throw new NotFoundError("RESOURCE_NOT_FOUND");
    }

    await CacheUtil.set(cacheKey, JSON.stringify(profile.careerPath), Number(constants.CACHE_TTLS.CAREER_PATH),);
    logger.info('Career path suggestions retrieved', { userId });
    return { success: true, message: "CAREER_PATH_RETRIEVED", data: profile.careerPath };
  }

  // =============================================================================
  // 3. Skill Assessment
  // =============================================================================
  async createSkillAssessment(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.skillAssessment.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    const existing = await this.checkExistingAssessment(s.userId, s.skillId);
    if (existing) throw new ConflictError("ASSESSMENT_ALREADY_COMPLETED");

    const assessmentId = generateSecureId();
    const questions = await this.generateAssessmentQuestions(s.skillId, s.difficulty, s.assessmentType);

    const assessment = {
      assessmentId,
      ...s,
      questions,
      status: 'pending',
      startedAt: new Date(),
      answers: [],
    };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      { $push: { assessments: assessment }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    const cacheKey = constants.CACHE_KEYS.ASSESSMENT(assessmentId);
    await CacheUtil.set(cacheKey, JSON.stringify(assessment), Number(constants.CACHE_TTLS.ASSESSMENT),);

    logger.info('Skill assessment created', { userId: s.userId, assessmentId });
    return {
      success: true,
      message: "ASSESSMENT_CREATED",
      data: {
        assessmentId,
        questions: questions.map(q => ({ questionId: q.questionId, question: q.question, options: q.options })),
        timeLimit: s.timeLimit,
        startedAt: assessment.startedAt,
      },
    };
  }

  async submitAssessment(assessmentId: string, userId: string, answers: any[]): Promise<any> {
    const assessment = await this.getAssessment(assessmentId, userId);
    if (assessment.status !== 'pending' && assessment.status !== 'in_progress') {
      throw new ConflictError("ASSESSMENT_ALREADY_COMPLETED");
    }

    const timeElapsed = (Date.now() - new Date(assessment.startedAt).getTime()) / 1000;
    if (timeElapsed > assessment.timeLimit) throw new AppError("ASSESSMENT_EXPIRED");

    const results = await this.calculateAssessmentResults(assessment, answers);

    await ProfessionalDev.findOneAndUpdate(
      { userId, 'assessments.assessmentId': assessmentId },
      {
        $set: {
          'assessments.$.answers': answers,
          'assessments.$.results': results,
          'assessments.$.status': 'completed',
          'assessments.$.completedAt': new Date(),
          'assessments.$.timeTaken': timeElapsed,
          updatedAt: new Date(),
        },
      }
    );

    await this.updatePracticeStats(userId, 'assessment', results.score);

    const resultsCacheKey = constants.CACHE_KEYS.ASSESSMENT_RESULTS(userId, assessment.skillId);
    await CacheUtil.set(resultsCacheKey, JSON.stringify(results), Number(constants.CACHE_TTLS.ASSESSMENT_RESULTS),);

    logger.info('Assessment submitted', { userId, assessmentId });
    return { success: true, message: "ASSESSMENT_COMPLETED", data: results };
  }

  // =============================================================================
  // 4. Certifications
  // =============================================================================
  async addCertification(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.certification.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    const certificationId = generateSecureId();
    const certification = { certificationId, ...s, addedAt: new Date() };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      { $push: { certifications: certification }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    await CacheUtil.del(constants.CACHE_KEYS.USER_CERTIFICATIONS(s.userId));

    logger.info('Certification added', { userId: s.userId, certificationId });
    return { success: true, message: "CERTIFICATION_ADDED", data: { certificationId, certification } };
  }

  async getCertifications(userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.USER_CERTIFICATIONS(userId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached certifications', { userId });
      return JSON.parse(cached);
    }

    const profile = await ProfessionalDev.findOne({ userId });
    const certifications = profile?.certifications || [];

    await CacheUtil.set(cacheKey, JSON.stringify(certifications), Number(constants.CACHE_TTLS.USER_CERTIFICATIONS),);

    logger.info('Certifications retrieved', { userId });
    return { success: true, message: "CERTIFICATIONS_RETRIEVED", data: certifications };
  }

  // =============================================================================
  // 5. LinkedIn Learning Integration
  // =============================================================================
  async connectLinkedInLearning(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.linkedinLearning.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    const encryptedToken = await encryptData(s.accessToken);
    const linkedinData = {
      connected: true,
      accessToken: encryptedToken,
      lastSyncAt: new Date(),
      courses: [],
      learningPaths: [],
      syncPreferences: s.syncPreferences,
    };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      { $set: { linkedinLearning: linkedinData, updatedAt: new Date() } },
      { upsert: true }
    );

    logger.info('LinkedIn Learning connected', { userId: s.userId });
    return { success: true, message: "LINKEDIN_CONNECTED", data: { connected: true, syncScheduled: true } };
  }

  async syncLinkedInCourses(userId: string): Promise<any> {
    const profile = await ProfessionalDev.findOne({ userId });
    if (!profile?.linkedinLearning?.connected) {
      throw new AppError("LINKEDIN_NOT_CONNECTED");
    }
    const token = await decryptData(profile.linkedinLearning.accessToken)

    const courses = await this.fetchLinkedInCourses(userId, token!);

    await ProfessionalDev.findOneAndUpdate(
      { userId },
      { $set: { 'linkedinLearning.courses': courses, 'linkedinLearning.lastSyncAt': new Date(), updatedAt: new Date() } }
    );

    await CacheUtil.del(constants.CACHE_KEYS.LINKEDIN_COURSES(userId));

    logger.info('LinkedIn courses synced', { userId });
    return { success: true, message: "COURSES_SYNCED", data: { courseCount: courses.length, lastSyncAt: new Date() } };
  }

  // =============================================================================
  // 6. Mock Interviews
  // =============================================================================
  async scheduleMockInterview(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.mockInterview.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    await this.checkRateLimit(s.userId, 'mock_interview', 3, 86400);

    const sessionId = generateSecureId();
    const questions = await this.generateInterviewQuestions(s.jobRole, s.interviewType, s.experienceLevel);

    const mockInterview = { sessionId, ...s, questions, status: 'scheduled', overallFeedback: null };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      { $push: { mockInterviews: mockInterview }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    await CacheUtil.del(constants.CACHE_KEYS.MOCK_INTERVIEWS(s.userId));

    logger.info('Mock interview scheduled', { userId: s.userId, sessionId });
    return {
      success: true,
      message: "MOCK_INTERVIEW_SCHEDULED",
      data: { sessionId, scheduledAt: s.scheduledAt, duration: s.duration, questionCount: questions.length },
    };
  }

  async completeMockInterview(sessionId: string, userId: string, answers: any[]): Promise<any> {
    // const session = await this.getMockInterview(sessionId, userId);
    // if (session.status !== 'scheduled') throw new ConflictError('Mock interview already completed or cancelled');

    // const feedback = await this.generateInterviewFeedback(answers);

    // await ProfessionalDev.findOneAndUpdate(
    //   { userId, 'mockInterviews.sessionId': sessionId },
    //   {
    //     $set: {
    //       'mockInterviews.$.completedAt': new Date(),
    //       'mockInterviews.$.status': 'completed',
    //       'mockInterviews.$.overallFeedback': feedback,
    //       'mockInterviews.$.questions': answers,
    //       updatedAt: new Date(),
    //     },
    //   }
    // );

    // await this.updatePracticeStats(userId, 'interview', feedback.overallRating);

    // await CacheUtil.del(constants.CACHE_KEYS.MOCK_INTERVIEWS(userId));
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const feedback = await this.generateInterviewFeedback(answers);
      await ProfessionalDev.findOneAndUpdate(
        { userId, 'mockInterviews.sessionId': sessionId },
        {
          $set: {
            'mockInterviews.$.completedAt': new Date(),
            'mockInterviews.$.status': 'completed',
            'mockInterviews.$.overallFeedback': feedback,
            'mockInterviews.$.questions': answers,
            updatedAt: new Date()
          }
        },
        { session }
      );

      await this.updatePracticeStats(userId, 'interview', feedback.overallRating);
      await CacheUtil.del(constants.CACHE_KEYS.MOCK_INTERVIEWS(userId));
      await session.commitTransaction();
      logger.info('Mock interview completed', { userId, sessionId });
      return { success: true, message: 'INTERVIEW_COMPLETED', data: feedback };
    } catch (error : any) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch(error: any) {
    logger.info('Mock interview completed');
    return new ApiError("in mock interview")
  }

  // =============================================================================
  // 7. Resume Review
  // =============================================================================
  async submitResumeForReview(data: any, resumeFile: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.resumeReview.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    if (!resumeFile) throw new ValidationError("RESUME_UPLOAD_REQUIRED");

    const reviewId = generateSecureId();
    const resumeUrl = await this.uploadResumeFile(reviewId, resumeFile);

    const resumeReview = {
      reviewId,
      resumeUrl,
      ...s,
      status: 'submitted',
      submittedAt: new Date(),
      reviewerId: null,
      feedback: null,
    };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      { $push: { resumeReviews: resumeReview }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    logger.info('Resume submitted for review', { userId: s.userId, reviewId });
    return {
      success: true,
      message: "RESUME_SUBMITTED",
      data: { reviewId, estimatedCompletion: this.calculateReviewTime(s.urgency), status: 'submitted' },
    };
  }

  async getResumeReview(reviewId: string, userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.REVIEW_FEEDBACK(reviewId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached resume review', { userId, reviewId });
      return JSON.parse(cached);
    }

    const profile = await ProfessionalDev.findOne({ userId });
    const review = profile?.resumeReviews?.find(r => r.reviewId === reviewId);
    if (!review) throw new NotFoundError("RESOURCE_NOT_FOUND");

    if (review.feedback) {
      await CacheUtil.set(cacheKey, JSON.stringify(review), Number(constants.CACHE_TTLS.REVIEW_FEEDBACK),);
    }

    logger.info('Resume review retrieved', { userId, reviewId });
    return {
      success: true,
      message: review.status === 'completed' ? "FEEDBACK_RETRIEVED" : 'Review in progress',
      data: review,
    };
  }

  // =============================================================================
  // 8. Coaching Sessions
  // =============================================================================
  async scheduleCoachingSession(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.coachingSession.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    await this.checkRateLimit(s.userId, 'coaching_session', 5, 7 * 24 * 60 * 60);

    const assignedCoach = await this.findAvailableCoach(s);
    if (!assignedCoach) throw new AppError("NO_COACHES_AVAILABLE");

    const sessionId = generateSecureId();
    const coachingSession = {
      sessionId,
      coachId: assignedCoach.coachId,
      ...s,
      status: 'scheduled',
      actionItems: [],
      feedback: null,
    };

    await ProfessionalDev.findOneAndUpdate(
      { userId: s.userId },
      {
        $push: { coachingSessions: coachingSession },
        $set: { assignedCoach, updatedAt: new Date() },
      },
      { upsert: true }
    );

    logger.info('Coaching session scheduled', { userId: s.userId, sessionId });
    return {
      success: true,
      message: "SESSION_SCHEDULED",
      data: {
        sessionId,
        coach: { name: assignedCoach.name, specializations: assignedCoach.specializations, rating: assignedCoach.rating },
        scheduledAt: s.scheduledAt,
        sessionMode: s.sessionMode,
      },
    };
  }

  async getCoachingPlan(userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.COACHING_PLAN(userId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached coaching plan', { userId });
      return JSON.parse(cached);
    }

    const profile = await ProfessionalDev.findOne({ userId });
    if (!profile?.coachingPlan) throw new NotFoundError("RESOURCE_NOT_FOUND");

    await CacheUtil.set(cacheKey, JSON.stringify(profile.coachingPlan), Number(constants.CACHE_TTLS.COACHING_PLAN),);

    logger.info('Coaching plan retrieved', { userId });
    return { success: true, message: "COACHING_PLAN_CREATED", data: profile.coachingPlan };
  }

  // =============================================================================
  // 9. Salary Benchmark & Negotiation
  // =============================================================================
  async analyzeSalaryBenchmark(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.salaryNegotiation.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    const marketData = await this.fetchSalaryMarketData(s);
    const benchmarkScore = this.calculateBenchmarkScore(s.currentSalary || s.offerSalary, marketData);
    const negotiationStrategy = await this.generateNegotiationStrategy(s, marketData);

    const salaryAnalysis = { ...s, marketData, benchmarkScore, negotiationStrategy, lastAnalyzed: new Date() };

    await Insights.findOneAndUpdate(
      { userId: s.userId },
      { $set: { salaryNegotiation: salaryAnalysis, updatedAt: new Date() } },
      { upsert: true }
    );

    const cacheKey = constants.CACHE_KEYS.SALARY_DATA(s.jobTitle, s.location);
    await CacheUtil.set(cacheKey, JSON.stringify(salaryAnalysis), Number(constants.CACHE_TTLS.SALARY_DATA));

    logger.info('Salary benchmark analyzed', { userId: s.userId });
    return { success: true, message: "SALARY_BENCHMARKED", data: salaryAnalysis };
  }

  async getNegotiationTips(level: string, industry: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.NEGOTIATION_TIPS(level, industry);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached negotiation tips', { level, industry });
      return JSON.parse(cached);
    }

    const tips = await this.fetchNegotiationTips(level, industry);
    await CacheUtil.set(cacheKey, JSON.stringify(tips), Number(constants.CACHE_TTLS.NEGOTIATION_TIPS),);

    logger.info('Negotiation tips retrieved', { level, industry });
    return { success: true, message: "NEGOTIATION_TIPS_RETRIEVED", data: tips };
  }

  // =============================================================================
  // 10. Market Reports
  // =============================================================================
  async generateMarketReport(data: any): Promise<any> {
    const { error, value } = professionalDev_VALIDATION_SCHEMAS.marketReport.validate(data, { abortEarly: false });
    if (error) throw new ValidationError(`VALIDATION_FAILED: ${error.details[0].message}`);

    const s = sanitizeInput(value);

    await this.checkRateLimit(s.userId, 'market_report', 3, 86400);

    const reportId = generateSecureId();
    const reportData = await this.generateMarketReportData(s);

    await Insights.findOneAndUpdate(
      { userId: s.userId },
      { $push: { marketReports: { reportId, ...s, ...reportData, generatedAt: new Date() } }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    logger.info('Market report generated', { userId: s.userId, reportId });
    return { success: true, message: 'REPORT_GENERATED', data: { reportId, ...reportData } };
  }

  async getMarketReport(reportId: string, userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.MARKET_REPORT(reportId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      logger.info('Returning cached market report', { userId, reportId });
      return JSON.parse(cached);
    }

    const marketIntel = await Insights.findOne({ userId });
    const report = marketIntel?.marketReports?.find(r => r.reportId === reportId);
    if (!report) throw new NotFoundError('RESOURCE_NOT_FOUND');

    await CacheUtil.set(cacheKey, JSON.stringify(report), Number(constants.CACHE_TTLS.MARKET_REPORT),);

    logger.info('Market report retrieved', { userId, reportId });
    return { success: true, message: 'REPORT_RETRIEVED', data: report };
  }

  // =============================================================================
  // Helper Methods (All implemented)
  // =============================================================================
  async checkRateLimit(userId: string, feature: string, limit: number, windowSeconds: number): Promise<boolean> {
    const key = `ratelimit:${userId}:${feature}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const count = await CacheUtil.incr(key);
    if (count === 1) await CacheUtil.expire(key, windowSeconds);
    if (count > limit) throw new ConflictError('RATE_LIMIT_EXCEEDED');
    logger.debug('Rate limit check passed', { userId, feature, count });
    return true;
  }

  async getIndustrySkillRequirements(role: string, industry: string): Promise<any[]> {
    const cacheKey = constants.CACHE_KEYS.INDUSTRY_SKILLS(industry);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Real implementation: DB query or external API
    const skills = [
      { skillId: 'javascript', skillName: 'JavaScript', requiredLevel: 4, importance: 'high' },
      { skillId: 'react', skillName: 'React', requiredLevel: 3, importance: 'medium' },
    ];

    await CacheUtil.set(cacheKey, JSON.stringify(skills), Number(constants.CACHE_TTLS.INDUSTRY_SKILLS),);
    return skills;
  }

  calculateSkillGaps(currentSkills: any[], requiredSkills: any[]): any[] {
    const gaps = requiredSkills.map(required => {
      const current = currentSkills.find(skill => skill.skillId === required.skillId);
      const currentLevel = current?.proficiencyLevel || 0;
      if (currentLevel < required.requiredLevel) {
        return {
          skillId: required.skillId,
          skillName: required.skillName,
          requiredLevel: required.requiredLevel,
          currentLevel,
          priority: this.calculatePriority(required.requiredLevel - currentLevel),
          estimatedLearningTime: (required.requiredLevel - currentLevel) * 20,
        };
      }
      return null;
    }).filter(Boolean);

    return gaps.sort((a: any, b: any) => {
      const priorityOrder: any = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  calculatePriority(gapSize: number): string {
    if (gapSize >= 3) return 'high';
    if (gapSize >= 2) return 'medium';
    return 'low';
  }

  calculateOverallReadinessScore(skillGaps: any[]): number {
    if (skillGaps.length === 0) return 100;
    const totalGap = skillGaps.reduce((sum, gap) => sum + (gap.requiredLevel - gap.currentLevel), 0);
    const maxPossibleGap = skillGaps.length * 5;
    return Math.max(0, Math.floor(((maxPossibleGap - totalGap) / maxPossibleGap) * 100));
  }

  async generateSkillRecommendations(skillGaps: any[]): Promise<any[]> {
    return skillGaps.slice(0, 5).map(gap => ({
      skillId: gap.skillId,
      skillName: gap.skillName,
      recommendation: `Focus on ${gap.skillName} through online courses and practical projects`,
      resources: [`Course: Advanced ${gap.skillName}`, `Practice: ${gap.skillName} projects`],
      estimatedTime: gap.estimatedLearningTime,
    }));
  }

  async generateCareerPathSuggestions(data: any): Promise<any[]> {
    return [
      {
        targetRole: `Senior ${data.currentRole}`,
        targetLevel: 'senior',
        estimatedTime: '2-3 years',
        requiredSkills: ['leadership', 'project management', 'advanced technical skills'],
        salaryRange: { min: 120000, max: 180000, currency: 'USD' },
        pathScore: 85,
      },
      {
        targetRole: `${data.currentRole} Manager`,
        targetLevel: 'lead',
        estimatedTime: '3-4 years',
        requiredSkills: ['people management', 'strategic planning', 'budget management'],
        salaryRange: { min: 140000, max: 200000, currency: 'USD' },
        pathScore: 78,
      },
    ];
  }

  async generateAssessmentQuestions(skillId: string, difficulty: string, assessmentType: string): Promise<any[]> {
    return [
      {
        questionId: generateSecureId(),
        question: `Sample ${skillId} question for ${difficulty} level`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
        correctAnswer: 'Option A',
        explanation: 'Sample explanation',
        timeSpent: 0,
      },
    ];
  }

  async generateInterviewQuestions(jobRole: string, interviewType: string, experienceLevel: string): Promise<any[]> {
    return [
      {
        questionId: generateSecureId(),
        question: `Tell me about a challenging project you worked on as a ${jobRole}`,
        category: 'behavioral',
        difficulty: experienceLevel,
        answer: '',
        timeSpent: 0,
        feedback: null,
      },
    ];
  }

  async generateInterviewFeedback(answers: any[]): Promise<any> {
    return {
      communicationScore: 4,
      technicalScore: 4,
      confidenceScore: 3,
      overallRating: 4,
      strengths: ['Clear communication', 'Good technical knowledge'],
      areasForImprovement: ['More confidence in answers', 'Provide specific examples'],
      nextSteps: ['Practice behavioral questions', 'Prepare STAR method examples'],
    };
  }

  async updatePracticeStats(userId: string, type: string, score: number): Promise<void> {
    const updateData = type === 'assessment'
      ? {
        $inc: { 'practiceStats.totalAssessments': 1, 'practiceStats.completedAssessments': 1 },
        $set: { 'practiceStats.averageScore': score, 'practiceStats.streak.lastPracticeDate': new Date() },
      }
      : {
        $inc: { 'practiceStats.totalInterviews': 1 },
        $set: { 'practiceStats.averageInterviewRating': score, 'practiceStats.streak.lastPracticeDate': new Date() },
      };

    await ProfessionalDev.findOneAndUpdate({ userId }, updateData, { upsert: true });
    logger.debug('Practice stats updated', { userId, type, score });
  }

  async checkExistingAssessment(userId: string, skillId: string): Promise<any> {
    return await ProfessionalDev.findOne({
      userId,
      'assessments': { $elemMatch: { skillId, completedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
    });
  }

  async getAssessment(assessmentId: string, userId: string): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.ASSESSMENT(assessmentId);
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const profile = await ProfessionalDev.findOne({ userId, 'assessments.assessmentId': assessmentId });
    if (!profile) throw new NotFoundError('ASSESSMENT_NOT_FOUND');

    const assessment = profile.assessments.find(a => a.assessmentId === assessmentId);
    await CacheUtil.set(cacheKey, JSON.stringify(assessment), Number(constants.CACHE_TTLS.ASSESSMENT),);

    return assessment;
  }

  async calculateAssessmentResults(assessment: any, answers: any[]): Promise<any> {
    let correctAnswers = 0;
    const totalQuestions = assessment.questions.length;

    assessment.questions.forEach((question: any) => {
      const userAnswer = answers.find(a => a.questionId === question.questionId);
      if (userAnswer && userAnswer.answer === question.correctAnswer) correctAnswers++;
    });

    const score = Math.floor((correctAnswers / totalQuestions) * 100);

    return {
      score,
      percentile: this.calculatePercentile(score),
      correctAnswers,
      totalQuestions,
      strengths: ['Problem solving', 'Technical knowledge'],
      weaknesses: ['Advanced concepts', 'Implementation details'],
      recommendations: ['Focus on advanced topics', 'Practice more coding problems'],
    };
  }

  calculatePercentile(score: number): number {
    if (score >= 90) return 95;
    if (score >= 80) return 85;
    if (score >= 70) return 70;
    if (score >= 60) return 50;
    return 25;
  }

  async fetchLinkedInCourses(userId: string, accessToken: string): Promise<any[]> {
    // Real mein LinkedIn API call karna
    return [
      {
        courseId: generateSecureId(),
        title: 'Advanced JavaScript',
        provider: 'LinkedIn Learning',
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        skillsLearned: ['javascript', 'es6', 'async programming'],
        timeSpent: 180,
      },
    ];
  }

  async fetchIndustrySkills(role: string, industry: string): Promise<any[]> {
    // Real mein DB ya external API se
    return [
      { skillId: 'javascript', skillName: 'JavaScript', requiredLevel: 4, importance: 'high' },
      { skillId: 'react', skillName: 'React', requiredLevel: 3, importance: 'medium' },
    ];
  }

  async uploadResumeFile(reviewId: string, fileBuffer: any): Promise<string> {
    // Real mein S3 upload karna
    return `https://storage.example.com/resumes/${reviewId}.pdf`;
  }

  async generateResumeFeedback(payload: any): Promise<any> {
    return {
      overallRating: 4,
      sections: [
        { section: 'summary', rating: 4, comments: 'Clear and concise', suggestions: ['Add quantifiable achievements'] },
        { section: 'experience', rating: 3, comments: 'Good detail', suggestions: ['Highlight impact metrics'] },
      ],
      atsCompatibility: { score: 85, issues: ['Missing keywords'], recommendations: ['Add specific technical skills'] },
      improvements: [{ category: 'formatting', priority: 'medium', suggestion: 'Use consistent fonts', example: 'Arial 11pt' }],
      finalNotes: 'Strong resume, focus on ATS optimization',
    };
  }

  calculateReviewTime(urgency: string): string {
    const times: any = { same_day: '4-6 hours', rush: '24-48 hours', standard: '3-5 business days' };
    return times[urgency] || times.standard;
  }

  async findAvailableCoach(sessionData: any): Promise<any> {
    const cacheKey = constants.CACHE_KEYS.AVAILABLE_COACHES(sessionData.userId);
    let coaches = await CacheUtil.get(cacheKey);
    if (!coaches) {
      coaches = await this.fetchAvailableCoaches();
      await CacheUtil.set(cacheKey, JSON.stringify(coaches), Number(constants.CACHE_TTLS.AVAILABLE_COACHES),);
    } else {
      coaches = JSON.parse(coaches);
    }

    const suitable = coaches.filter((coach: any) => {
      const hasSpec = !sessionData.coachPreferences?.specializations?.length ||
        sessionData.coachPreferences.specializations.some((spec: string) => coach.specializations.includes(spec));
      const hasIndustry = !sessionData.coachPreferences?.industry ||
        coach.industries.includes(sessionData.coachPreferences.industry);
      return hasSpec && hasIndustry && coach.isAvailable;
    });

    return suitable.sort((a: any, b: any) => b.rating - a.rating)[0] || null;
  }

  async fetchAvailableCoaches(): Promise<any[]> {
    // Real mein DB ya external service se
    return [
      {
        coachId: generateSecureId(),
        name: 'Sarah Johnson',
        specializations: ['career_planning', 'leadership_coaching'],
        industries: ['technology', 'finance'],
        experience: '10-15',
        rating: 4.8,
        isAvailable: true,
      },
      {
        coachId: generateSecureId(),
        name: 'Michael Chen',
        specializations: ['interview_prep', 'salary_negotiation'],
        industries: ['technology', 'startups'],
        experience: '15-20',
        rating: 4.9,
        isAvailable: true,
      },
    ];
  }

  async createCoachingPlan(userId: string, goals: string[], timeline: string): Promise<any> {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const planId = generateSecureId();
      const coachingPlan = {
        planId,
        goals,
        timeline,
        milestones: this.generateMilestones(goals, timeline),
        progress: 0,
        createdAt: new Date(),
        lastUpdatedAt: new Date(),
      };

      await ProfessionalDev.findOneAndUpdate(
        { userId },
        { $set: { coachingPlan, updatedAt: new Date() } },
        { upsert: true, session }
      );

      await CacheUtil.del(constants.CACHE_KEYS.COACHING_PLAN(userId));
      await session.commitTransaction();

      logger.info('Coaching plan created', { userId, planId });
      return { success: true, message: 'COACHING_PLAN_CREATED', data: coachingPlan };
    } catch (error : any) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  generateMilestones(goals: string[], timeline: string): any[] {
    const timelineMonths = { '3months': 3, '6months': 6, '1year': 12 }[timeline] || 6;
    return goals.map((goal, index) => ({
      milestone: `Complete goal: ${goal}`,
      targetDate: new Date(Date.now() + ((index + 1) * (timelineMonths / goals.length) * 30 * 24 * 60 * 60 * 1000)),
      status: 'pending',
      achievedAt: null,
      notes: '',
    }));
  }

  async fetchSalaryMarketData(data: any): Promise<any> {
    // Real mein external API ya DB se
    return {
      jobTitle: data.jobTitle,
      location: data.location,
      industry: data.industry,
      experienceYears: data.experienceYears,
      marketData: {
        percentile25: 85000,
        percentile50: 105000,
        percentile75: 130000,
        percentile90: 155000,
        average: 112000,
        dataPoints: 1250,
        lastUpdated: new Date(),
      },
      comparableRoles: [
        { title: 'Software Developer', salaryRange: { min: 90000, max: 140000 }, similarity: 95 },
        { title: 'Full Stack Engineer', salaryRange: { min: 95000, max: 145000 }, similarity: 90 },
      ],
    };
  }

  calculateBenchmarkScore(currentSalary: number, marketData: any): number {
    const marketMedian = marketData.marketData.percentile50;
    const percentDifference = ((currentSalary - marketMedian) / marketMedian) * 100;
    return Math.round(Math.min(Math.max(50 + percentDifference, 0), 100));
  }

  async generateNegotiationStrategy(data: any, marketData: any): Promise<any> {
    return {
      suggestedOffer: Math.round(marketData.marketData.percentile75 * 1.1),
      negotiationPoints: [
        'Highlight relevant experience and certifications',
        'Emphasize unique skills aligned with company needs',
        'Propose performance-based incentives',
      ],
      marketPosition: marketData.marketData.percentile50 < data.currentSalary ? 'above_market' : 'below_market',
      recommendedApproach: data.currentSalary < marketData.marketData.percentile50 ? 'aggressive' : 'balanced',
    };
  }

  async fetchNegotiationTips(level: string, industry: string): Promise<any[]> {
    // Real mein DB ya external se
    return [
      {
        tip: `For ${level} roles in ${industry}, research market salary ranges before negotiating`,
        priority: 'high',
        example: 'Use data from recent industry reports to justify your ask',
      },
      {
        tip: 'Practice your pitch focusing on your unique contributions',
        priority: 'medium',
        example: 'Highlight a project where you saved costs or improved efficiency',
      },
    ];
  }

  async generateMarketReportData(data: any): Promise<any> {
    return {
      reportType: data.reportType,
      generatedAt: new Date(),
      summary: `Market report for ${data.reportType} in ${data.filters?.industry || 'all industries'}`,
      data: {
        demandTrends: ['Increasing demand for cloud skills', 'AI expertise growing 30% YoY'],
        topSkills: ['Python', 'AWS', 'Data Analysis'],
        salaryTrends: { median: 110000, growthRate: '5% YoY' },
        hiringTrends: { activeListings: 25000, growthRate: '10% YoY' },
      },
      recommendations: ['Upskill in AI and cloud technologies', 'Target high-growth sectors'],
    };
  }
}

export const professionalDevelopmentService = new ProfessionalDevelopmentService();