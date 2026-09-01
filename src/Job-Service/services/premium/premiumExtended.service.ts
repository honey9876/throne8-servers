// src/services/premiumExtended.service.ts
import { v4 as uuidv4 } from 'uuid';
import CacheUtil from '@/shared/cache.util';
import logger from '@/shared/logger.util';
import { AppError, ValidationError, NotFoundError, ConflictError } from '@/shared/errors/app.error';
import { JobApplication,  UserInteractionModel, Insights, Search, Job } from '@/Job-Service/models';
import constants from '@/shared/constants.util';
import { premiumSchemaValidation } from '@/Job-Service/validations';
import { sanitizeInput, generateSecureId, validId } from '@/shared/security';

// const cacheService = createCacheService('premium');

interface Reminder {
  id: string;
  type: string;
  status?: string;
  reminderDate: string | Date;  // ✅ Both types supported
  [key: string]: any;
}

interface OfferDetails {
  id: string;
  salary?: number;
  bonus?: number;
  equity?: number;
  benefits?: string[];
  [key: string]: any;
}

interface OfferComparison {
  offers: Array<OfferDetails & { totalCompensation: number }>;
  recommendations: any;
}

class OptimizedModelService {
  async initializeUserPreferences(userId: string, defaultPreferences = {}): Promise<any> {
    validId(userId);
    let prefs = await Search.findOne({ userId });
    if (!prefs) {
      prefs = new Search({ userId, ...defaultPreferences });
      await prefs.save();
    }
    return prefs;
  }

  async getUserPreferences(userId: string) {
    validId(userId);
    const key = `${constants.CACHE_KEYS.USER_PREFERENCES}:${userId}`;
    let prefs = await CacheUtil.get(key);
    if (prefs) return prefs;

    prefs = await Search.findOne({ userId });
    if (!prefs) prefs = await this.initializeUserPreferences(userId);

    await CacheUtil.set(key, prefs, 3600);
    return prefs;
  }

  async updateTrendingScores(jobId: string, metrics: any) {
    validId(jobId);
    const score = this.calculateTrendingScore(metrics);

    await Insights.findOneAndUpdate(
      { jobId },
      {
        $set: {
          trendingScore: score,
          viewCount: metrics.viewCount || 0,
          applicationCount: metrics.applicationCount || 0,
          lastUpdated: new Date(),
        },
        $push: {
          dailyViews: { date: new Date(), count: metrics.dailyViewIncrease || 0 },
        },
      },
      { upsert: true }
    );

    await CacheUtil.del(`job_analytics:${jobId}`);
    return score;
  }

  async getUserNetwork(userId: string) {
    validId(userId);
    const key = `${constants.CACHE_KEYS.USER_NETWORK}:${userId}`;
    let network = await CacheUtil.get(key);
    if (network) return network;

    network = await UserInteractionModel.findOne({ userId });
    if (network) await CacheUtil.set(key, network, 1800);

    return network || null;
  }

  async getNetworkCompanies(userId: string) {
    const network = await this.getUserNetwork(userId);
    if (!network) return [];

    const ids = [
      ...network.connections?.map((c: any) => c.companyId) || [],
      ...network.workHistory?.map((w: any) => w.companyId) || [],
    ].filter(id => validId(id));

    return [...new Set(ids)];
  }

  async getUserAlumniSchools(userId: string) {
    const network = await this.getUserNetwork(userId);
    if (!network) return [];

    return (network.education || [])
      .filter((edu: any) => validId(edu.schoolId))
      .map((edu: any) => ({
        schoolId: edu.schoolId,
        schoolName: edu.schoolName,
        graduationYear: edu.graduationYear,
      }));
  }

  calculateTrendingScore(metrics: any) {
    const {
      viewCount = 0,
      applicationCount = 0,
      saveCount = 0,
      shareCount = 0,
      createdAt = Date.now(),
    } = metrics;

    const timeDecay = Math.exp(-((Date.now() - createdAt) / (7 * 24 * 60 * 60 * 1000)));
    const raw = viewCount * 1 + applicationCount * 10 + saveCount * 5 + shareCount * 7;
    return Math.min(100, Math.max(0, Math.floor(raw * timeDecay / 10)));
  }

  async trackSearchWithAnalytics(userId: string, searchParams: any, results: any, searchType = 'simple') {
    validId(userId);

    const searchEntry = {
      userId,
      query: searchParams.q,
      filters: searchParams,
      searchType,
      searchContext: searchParams.context,
      resultMetrics: {
        totalResults: results.total,
        clickedResults: 0,
        applicationsMade: 0,
        timeSpentOnResults: 0,
      },
      timestamp: new Date(),
    };

    // Real mein SearchHistory model save karna
    // await SearchHistory.create(searchEntry);

    await this.updateUserSearchBehavior(userId, searchParams);
    return searchEntry;
  }

  async updateUserSearchBehavior(userId: string, searchParams: any) {
    validId(userId);
    const hour = new Date().getHours();

    const updateData = {
      $addToSet: {
        'searchBehavior.preferredFilters': {
          $each: Object.keys(searchParams).filter(key => searchParams[key]),
        },
        'searchBehavior.commonKeywords': searchParams.q?.split(' ').filter(Boolean) || [],
      },
      $inc: {
        [`searchBehavior.searchPatterns.${hour}.frequency`]: 1,
      },
      $set: {
        lastActiveAt: new Date(),
      },
    };

    // Real mein UserActivity update karna
    // await UserActivity.updateOne({ userId }, updateData, { upsert: true });
  }

  async logFeatureUsage(userId: string, feature: string, details: Record<string, any> = {}) {
    try {
      const usageKey = `feature_usage:${userId}:${feature}:${new Date().getMonth()}`;
      await CacheUtil.incr(usageKey);
      await CacheUtil.expire(usageKey, Number(constants.CACHE_TTLS.FEATURE_USAGE));
      logger.info(`Feature used`, { userId, feature, details });
    } catch (err) {
      logger.error(`logFeatureUsage failed`, { error: err, userId, feature });
      throw err;
    }
  }
}

export const modelService = new OptimizedModelService();

class PremiumExtendedService {
  async createFollowUpReminder(data: any) {
    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.followUpReminder.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    validId(value.jobId);
    validId(value.applicationId);

    await this.checkRateLimit(value.userId, 'followUpReminder', 20, 3600);

    const reminderId = generateSecureId();
    const reminder = {
      id: reminderId,
      type: 'reminder',
      content: value.message,
      reminderDate: new Date(value.reminderDate),
      status: 'pending',
      createdAt: new Date(),
    };

    await JobApplication.updateOne(
      { applicationId: value.applicationId, userId: value.userId },
      { $push: { notes: reminder }, $set: { updatedAt: new Date() } }
    );

    await modelService.logFeatureUsage(value.userId, 'followUpReminder', { reminderId });

    return { success: true, reminderId, reminder };
  }

  async getFollowUpReminders(userId: string, status: string | null = null): Promise<Reminder[]> {
    validId(userId);

    const pattern = `${constants.CACHE_KEYS.FOLLOW_UPS(userId)}:*`;

    // ✅ Use scan to get keys instead of clearByPattern
    let cursor = '0';
    const keys: string[] = [];

    // Scan all matching keys
    do {
      const [nextCursor, foundKeys] = await CacheUtil.scan(cursor, pattern, 100);
      keys.push(...foundKeys);
      cursor = nextCursor;
    } while (cursor !== '0');

    let reminders: Reminder[] = [];

    if (keys.length > 0) {
      // Get all cached reminders
      const cached = await CacheUtil.mget(keys);

      // cached is Record<string, any>, iterate over values
      Object.values(cached).forEach((data: any) => {
        if (data) {
          try {
            const reminder: Reminder = typeof data === 'string' ? JSON.parse(data) : data;
            if (reminder.type === 'reminder' && (!status || reminder.status === status)) {
              reminders.push(reminder);
            }
          } catch (error : any) {
            console.error('Error parsing reminder:', error);
          }
        }
      });
    }

    // If no cached reminders, fetch from database
    if (reminders.length === 0) {
      const applications = await JobApplication.find({ userId }).lean();

      // Flatten and filter notes
      const dbReminders = applications.flatMap(app =>
        (app.notes || []).filter((note: any) =>
          note.type === 'reminder' && (!status || note.status === status)
        )
      );

      // Convert to Reminder type and normalize reminderDate to string
      reminders = dbReminders.map((note: any) => ({
        ...note,
        reminderDate: note.reminderDate instanceof Date
          ? note.reminderDate.toISOString()
          : note.reminderDate
      })) as Reminder[];

      // Cache the reminders
      if (reminders.length > 0) {
        const setPromises = reminders.map(reminder =>
          CacheUtil.set(
            `${constants.CACHE_KEYS.FOLLOW_UPS(userId)}:${reminder.id}`,
            JSON.stringify(reminder),
            Number(constants.CACHE_TTLS.FOLLOW_UPS)
          )
        );
        await Promise.all(setPromises);
      }
    }

    // Sort by reminder date
    reminders.sort((a, b) => {
      const dateA = a.reminderDate instanceof Date
        ? a.reminderDate.getTime()
        : new Date(a.reminderDate).getTime();
      const dateB = b.reminderDate instanceof Date
        ? b.reminderDate.getTime()
        : new Date(b.reminderDate).getTime();
      return dateA - dateB;
    });

    return reminders;
  }

  async createInterview(data: any) {
    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.interview.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    validId(value.jobId);
    validId(value.applicationId);

    const interviewId = generateSecureId();
    const interview = {
      id: interviewId,
      type: 'interview',
      content: value.details,
      status: value.status || 'scheduled',
      tags: ['interview'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await JobApplication.updateOne(
      { applicationId: value.applicationId, userId: value.userId },
      { $push: { notes: interview }, $set: { status: 'interviewed', updatedAt: new Date() } }
    );

    await UserInteractionModel.create({
      userId: value.userId,
      action: value.status === 'scheduled' ? 'INTERVIEW_SCHEDULED' : 'INTERVIEW_CONFIRMED',
      entityType: 'interview',
      jobId: value.jobId,
      details: { scheduleId: interviewId, interviewType: value.interviewType || 'other' },
      createdAt: new Date(),
    });

    await modelService.logFeatureUsage(value.userId, 'interview', { interviewId });

    return { success: true, interviewId, interview };
  }

  async updateInterviewStatus(interviewId: string, userId: string, status: string, notes = '') {
    validId(interviewId);
    validId(userId);

    if (!['scheduled', 'completed', 'cancelled', 'rescheduled'].includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const cacheKey = `${constants.CACHE_KEYS.INTERVIEWS(userId)}:${interviewId}`;
    let interview = await CacheUtil.get(cacheKey);

    if (!interview) {
      const application = await JobApplication.findOne({ userId, 'notes.id': interviewId }, { 'notes.$': 1 }).lean();
      if (!application || !application.notes[0]) throw new NotFoundError('Interview not found');
      interview = application.notes[0];
      await CacheUtil.set(cacheKey, interview, Number(constants.CACHE_TTLS.INTERVIEWS));
    }

    interview.status = status;
    interview.content = sanitizeInput(notes) || interview.content;
    interview.updatedAt = new Date();

    await CacheUtil.set(cacheKey, interview, Number(constants.CACHE_TTLS.INTERVIEWS));

    await JobApplication.updateOne(
      { userId, 'notes.id': interviewId },
      { $set: { 'notes.$.status': status, 'notes.$.content': interview.content, 'notes.$.updatedAt': new Date(), updatedAt: new Date() } }
    );

    await UserInteractionModel.create({
      userId,
      action: status === 'completed' ? 'INTERVIEW_CONFIRMED' : `INTERVIEW_${status.toUpperCase()}`,
      entityType: 'interview',
      details: { scheduleId: interviewId },
      createdAt: new Date(),
    });

    return { success: true, interview };
  }

  async createOffer(data: any) {
    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.offer.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    validId(value.jobId);
    validId(value.applicationId);

    const offerId = generateSecureId();
    const offer = {
      id: offerId,
      salary: value.salary,
      equity: value.equity,
      benefits: value.benefits,
      companyName: value.companyName,
      competitiveScore: this.calculateOfferScore(value),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await JobApplication.updateOne(
      { applicationId: value.applicationId, userId: value.userId },
      { $set: { offerDetails: offer, status: 'hired', updatedAt: new Date() } }
    );

    await CacheUtil.set(`offer:${value.userId}:${offerId}`, offer, Number(constants.CACHE_TTLS.OFFERS));

    await Insights.updateJobMetrics(value.userId, value.jobId, {
      offerCount: 1,
      averageSalary: value.salary,
      averageEquity: value.equity,
    });

    await modelService.logFeatureUsage(value.userId, 'offer', { offerId });

    return { success: true, offerId, offer };
  }

  async compareOffers(userId: string, offerIds: string[]): Promise<OfferComparison> {
    validId(userId);
    offerIds.forEach(id => validId(id));

    // Build cache keys
    const cacheKeys = offerIds.map(id => `offer:${userId}:${id}`);

    // ✅ Fix 1: mget takes array, not spread
    const cached = await CacheUtil.mget(cacheKeys);

    // ✅ Fix 2: cached is Record<string, any>, not array
    let offers: OfferDetails[] = [];
    const missingIds: string[] = [];

    // Process cached results
    offerIds.forEach((offerId, index) => {
      const cacheKey = cacheKeys[index];
      const cachedData = cached[cacheKey];

      if (cachedData) {
        try {
          const offer = typeof cachedData === 'string'
            ? JSON.parse(cachedData)
            : cachedData;
          offers.push(offer);
        } catch (error : any) {
          console.error(`Error parsing cached offer ${offerId}:`, error);
          missingIds.push(offerId);
        }
      } else {
        missingIds.push(offerId);
      }
    });

    // ✅ Fix 3: Fetch missing offers from database
    if (missingIds.length > 0) {
      const dbApplications = await JobApplication.find(
        {
          userId,
          'offerDetails.id': { $in: missingIds }
        },
        { offerDetails: 1 }
      ).lean();

      const dbOffers = dbApplications
        .map(app => app.offerDetails)
        // .filter((offer): offer is OfferDetails => offer != null)
        .filter((offer): offer is NonNullable<typeof offer> => offer != null)
      // Cache the DB offers
      if (dbOffers.length > 0) {
        const setPromises = dbOffers.map(offer =>
          CacheUtil.set(
            `offer:${userId}:${offer.id}`,
            JSON.stringify(offer),
            Number(constants.CACHE_TTLS.OFFERS)
          )
        );
        await Promise.all(setPromises);
        offers.push(...dbOffers);
      }
    }

    // ✅ Fix 4: Calculate compensation and format response
    return {
      offers: offers.map((offer) => ({
        ...offer,
        totalCompensation: this.calculateTotalComp(offer),
        benefits: offer.benefits || [],
      })),
      recommendations: this.generateOfferRecommendations(offers),
    };
  }



  async createApplicationNote(data: any) {
    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.applicationNotes.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    validId(value.applicationId);

    const noteId = generateSecureId();
    const note = {
      id: noteId,
      type: 'note',
      content: value.content,
      tags: value.tags,
      isPrivate: value.isPrivate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const cacheKey = `${constants.CACHE_KEYS.NOTES(value.applicationId)}:${noteId}`;
    await CacheUtil.set(cacheKey, note, Number(constants.CACHE_TTLS.NOTES));

    await JobApplication.updateOne(
      { applicationId: value.applicationId, userId: value.userId },
      { $push: { notes: note }, $set: { updatedAt: new Date() } }
    );

    await modelService.logFeatureUsage(value.userId, 'applicationNote', { noteId });

    return { success: true, noteId, note };
  }

  async getApplicationNotes(applicationId: string, userId: string) {
    validId(applicationId);
    validId(userId);

    // ❌ Wrong - keys() method doesn't exist
    // const keys = await CacheUtil.keys(pattern);

    // ✅ Correct - Use scan()
    const pattern = `${constants.CACHE_KEYS.NOTES(applicationId)}:*`;
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, foundKeys] = await CacheUtil.scan(cursor, pattern, 100);
      keys.push(...foundKeys);
      cursor = nextCursor;
    } while (cursor !== '0');
    let notes: any[] = [];

    if (keys.length > 0) {
      const cached = await CacheUtil.mget(keys);
      Object.values(cached).forEach((data: any) => {
        if (data) {
          const note = JSON.parse(data);
          if (note.type === 'note') notes.push(note);
        }
      });
    }

    if (notes.length === 0) {
      const application = await JobApplication.findOne({ applicationId, userId }).lean();
      if (!application) throw new NotFoundError('Application not found');
      notes = (application.notes || []).filter(note => note.type === 'note');

      const setPromises = notes.map(note =>
        CacheUtil.set(`${constants.CACHE_KEYS.NOTES(applicationId)}:${note.id}`, JSON.stringify(note), Number(constants.CACHE_TTLS.NOTES))
      );
      await Promise.all(setPromises);
    }

    // notes.sort((a, b) => {
    //   const dateA = a.createdAt instanceof Date
    //     ? a.createdAt.getTime()
    //     : new Date(a.createdAt).getTime();
    //   const dateB = b.createdAt instanceof Date
    //     ? b.createdAt.getTime()
    //     : new Date(b.createdAt).getTime();
    //   return dateA - dateB;
    // });

    // Sort by createdAt
    notes.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    // notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return notes;
  }

  async createBatchApplication(data: any) {
    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.batchApplication.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    value.jobIds.forEach((id: string) => validId(id));

    const { hasAccess } = await this.checkFeatureLimit(value.userId, 'batchApplications');
    if (!hasAccess) throw new ConflictError('Monthly batch application limit exceeded');

    const preferences = await modelService.getUserPreferences(value.userId);
    if (preferences.quickApplySettings?.enabled && value.jobIds.length > preferences.quickApplySettings.maxApplicationsPerDay) {
      throw new ConflictError('Batch size exceeds daily quick apply limit');
    }

    const results = [];
    for (const jobId of value.jobIds) {
      try {
        const application = await this.processIndividualApplication(
          jobId,
          value.userId,
          preferences.quickApplySettings.templates?.[0]?.id,
          sanitizeInput(value.customizations?.[jobId] || {})
        );
        results.push({ jobId, status: 'success', applicationId: application.applicationId });
        // Naya (sahi)
        await Insights.updateJobMetrics(
          value.userId,           // ← userId bhi dena padega!
          jobId,
          { applications: 1 }   // ← simple increment format
        );
        await modelService.updateTrendingScores(jobId, { applicationCount: 1 });
      } catch (err) {
        results.push({ jobId, status: 'failed', error: (err as Error).message });
      }
    }

    return { success: true, results };
  }

  async processIndividualApplication(jobId: string, userId: string, templateId: string | undefined, customization: any) {
    validId(jobId);
    validId(userId);
    if (templateId) validId(templateId);

    const applicationId = generateSecureId();
    const application = {
      applicationId,
      jobId,
      userId,
      companyId: customization.companyId,
      status: 'submitted',
      appliedAt: new Date(),
      resumeVersion: templateId,
      coverLetter: customization.coverLetter,
      source: 'direct',
      metadata: customization.metadata || {},
      notes: [],
      attachments: [],
      offerDetails: null,
    };

    await JobApplication.create(application);

    await UserInteractionModel.create({
      userId,
      action: 'apply_job',
      entityType: 'job',
      jobId,
      details: { applicationStatus: 'submitted' },
      createdAt: new Date(),
    });

    await modelService.logFeatureUsage(userId, 'application', { applicationId });

    return application;
  }

  async updateQuickApplySettings(userId: string, settings: any) {
    const s = sanitizeInput(settings);
    const { error, value } = premiumSchemaValidation.quickApplySettings.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(userId);

    await this.checkRateLimit(userId, 'quickApplySettings', 5, 3600);

    const preferences = await modelService.getUserPreferences(userId);
    preferences.quickApplySettings = {
      ...preferences.quickApplySettings,
      ...value,
      templates: value.templates || preferences.quickApplySettings.templates || [],
    };
    preferences.updatedAt = new Date();

    const key = `${constants.CACHE_KEYS.USER_PREFERENCES}:${userId}`;
    await CacheUtil.set(key, preferences, Number(constants.CACHE_TTLS.QUICK_APPLY));

    await Search.updateOne(
      { userId },
      { $set: { quickApplySettings: preferences.quickApplySettings, updatedAt: new Date() } },
      { upsert: true }
    );

    await modelService.logFeatureUsage(userId, 'quickApplySettings', { settings });

    return { success: true, settings: preferences.quickApplySettings };
  }

  async exportApplicationData(userId: string, format = 'json', filters = {}) {
    validId(userId);
    if (!['json', 'csv', 'excel'].includes(format)) {
      throw new ValidationError('Invalid export format');
    }

    await this.checkRateLimit(userId, 'dataExport', 5, 3600);

    const exportId = generateSecureId();

    // Real mein file generate kar ke S3 pe upload karna
    // Abhi direct success response
    return { success: true, exportId, message: 'Export queued', estimatedTime: '5-10 minutes' };
  }

  async createThankYouNote(interviewId: string, userId: string, message: string) {
    validId(interviewId);
    validId(userId);

    const sanitized = sanitizeInput(message);
    if (!sanitized || sanitized.length > 2000) {
      throw new ValidationError('Invalid message length');
    }

    const noteId = generateSecureId();
    const note = {
      id: noteId,
      type: 'thankYou',
      content: sanitized,
      interviewId,
      createdAt: new Date(),
      status: 'draft',
    };

    const cacheKey = `thankyou:${interviewId}:${noteId}`;
    await CacheUtil.set(cacheKey, note, Number(constants.CACHE_TTLS.THANK_YOU));

    await JobApplication.updateOne(
      { userId, 'notes.id': interviewId },
      { $push: { notes: note }, $set: { updatedAt: new Date() } }
    );

    await modelService.logFeatureUsage(userId, 'thankYouNote', { noteId });

    return { success: true, noteId, thankYouNote: note };
  }

  async saveVideoIntroduction(data: any, fileBuffer: Buffer) {
    if (!fileBuffer) throw new ValidationError('Video file required');

    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.videoIntro.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    validId(value.applicationId);

    const videoId = generateSecureId();
    const video = {
      id: videoId,
      type: 'video',
      fileUrl: await this.uploadVideoFile(videoId, fileBuffer),
      tags: value.tags,
      createdAt: new Date(),
    };

    const cacheKey = `${constants.CACHE_KEYS.VIDEO(value.userId)}:${videoId}`;
    await CacheUtil.set(cacheKey, video, Number(constants.CACHE_TTLS.VIDEO));

    await JobApplication.updateOne(
      { applicationId: value.applicationId, userId: value.userId },
      { $push: { attachments: video }, $set: { updatedAt: new Date() } }
    );

    await modelService.logFeatureUsage(value.userId, 'videoIntroduction', { videoId });

    return { success: true, videoId, video };
  }

  async savePortfolioAttachment(data: any, fileBuffer: Buffer) {
    if (!fileBuffer) throw new ValidationError('Portfolio file required');

    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.portfolio.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    validId(value.applicationId);

    const portfolioId = generateSecureId();
    const portfolio = {
      id: portfolioId,
      type: 'portfolio',
      fileUrl: await this.uploadPortfolioFile(portfolioId, fileBuffer),
      categories: value.categories,
      createdAt: new Date(),
    };

    const cacheKey = `${constants.CACHE_KEYS.PORTFOLIO(value.userId)}:${portfolioId}`;
    await CacheUtil.set(cacheKey, portfolio, Number(constants.CACHE_TTLS.PORTFOLIO));

    await JobApplication.updateOne(
      { applicationId: value.applicationId, userId: value.userId },
      { $push: { attachments: portfolio }, $set: { updatedAt: new Date() } }
    );

    await modelService.logFeatureUsage(value.userId, 'portfolio', { portfolioId });

    return { success: true, portfolioId, portfolio };
  }

  async createReference(data: any) {
    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.reference.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);
    validId(value.companyId);

    const referenceId = generateSecureId();
    const reference = {
      connectionId: referenceId,
      connectionType: 'referral',
      name: value.name,
      email: value.email,
      company: value.company,
      companyId: value.companyId,
      position: value.position,
      canRefer: true,
      isActive: true,
      connectedAt: new Date(),
    };

    await CacheUtil.del(`user_network:${value.userId}`);

    await UserInteractionModel.updateOne(
      { userId: value.userId },
      { $push: { connections: reference }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    await modelService.logFeatureUsage(value.userId, 'reference', { referenceId });

    return { success: true, referenceId, reference };
  }

  // Add these two methods to your PremiumExtendedService class

  async createApplicationTemplate(data: any) {
    const s = sanitizeInput(data);
    const { error, value } = premiumSchemaValidation.applicationTemplate.validate(s);
    if (error) throw new ValidationError(error.details[0].message);

    validId(value.userId);

    await this.checkRateLimit(value.userId, 'applicationTemplate', 10, 3600);

    const templateId = value.id || generateSecureId();
    const template = {
      id: templateId,
      userId: value.userId,
      name: value.name,
      coverLetter: value.coverLetter,
      customFields: value.customFields || {},
      tags: value.tags || [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Cache the template
    const cacheKey = `${constants.CACHE_KEYS.APPLICATION_TEMPLATE}:${value.userId}:${templateId}`;
    await CacheUtil.set(cacheKey, template, Number(constants.CACHE_TTLS.APPLICATION_TEMPLATE));

    // Save to database in Search model
    await Search.updateOne(
      { userId: value.userId },
      {
        $push: {
          applicationTemplates: template
        },
        $set: { updatedAt: new Date() }
      },
      { upsert: true }
    );

    await modelService.logFeatureUsage(value.userId, 'applicationTemplate', { templateId });

    return { success: true, templateId, template };
  }

  async calculateApplicationScore(applicationId: string, userId: string) {
    validId(applicationId);
    validId(userId);

    // Check cache first
    const cacheKey = `${constants.CACHE_KEYS.APPLICATION_SCORE}:${applicationId}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) {
      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    }

    // Fetch application details
    const application = await JobApplication.findOne({
      applicationId,
      userId
    }).lean();

    if (!application) throw new NotFoundError('Application not found');

    // Fetch related job details
    const job = await Job.findById(application.jobId)
      .select('title skills experience location salary')
      .lean();

    if (!job) throw new NotFoundError('Job not found');

    // Get user preferences for better scoring
    const preferences = await modelService.getUserPreferences(userId);

    // Calculate different score factors
    const completenessScore = this.calculateCompletenessScore(application);
    const relevanceScore = this.calculateRelevanceScore(application, job, preferences);
    const qualityScore = this.calculateQualityScore(application);

    // Calculate overall weighted score
    const overallScore = Math.round(
      completenessScore * 0.3 +
      relevanceScore * 0.4 +
      qualityScore * 0.3
    );

    // Generate actionable suggestions
    const suggestions = this.generateScoreSuggestions(application, job, {
      completeness: completenessScore,
      relevance: relevanceScore,
      quality: qualityScore,
    });

    const scoreResult = {
      applicationId,
      score: overallScore,
      breakdown: {
        completeness: completenessScore,
        relevance: relevanceScore,
        quality: qualityScore,
      },
      factors: {
        hasResume: !!application.resumeVersion,
        hasCoverLetter: !!application.coverLetter && application.coverLetter.length > 100,
        skillMatch: this.calculateSkillMatch(application, job),
        experienceMatch: this.calculateExperienceMatch(application, job),
        locationMatch: preferences.searchFilters?.locations?.includes(job.location) || false,
      },
      suggestions,
      calculatedAt: new Date(),
    };

    // Cache the score for 1 hour
    await CacheUtil.set(cacheKey, JSON.stringify(scoreResult), 3600);

    await modelService.logFeatureUsage(userId, 'applicationScore', { applicationId });

    return scoreResult;
  }

  // Helper methods for calculateApplicationScore
  private calculateCompletenessScore(application: any): number {
    let score = 0;

    // Resume check (30 points)
    if (application.resumeVersion) score += 30;

    // Cover letter check (30 points)
    if (application.coverLetter && application.coverLetter.length > 100) score += 30;

    // Notes check (15 points)
    if (application.notes && application.notes.length > 0) score += 15;

    // Attachments check (15 points)
    if (application.attachments && application.attachments.length > 0) score += 15;

    // Metadata/skills check (10 points)
    if (application.metadata?.skills && application.metadata.skills.length > 0) score += 10;

    return Math.min(score, 100);
  }

  private calculateRelevanceScore(application: any, job: any, preferences: any): number {
    let score = 50; // Base score

    // Skill matching (30 points)
    const appSkills = application.metadata?.skills || [];
    const jobSkills = job.skills || [];

    if (jobSkills.length > 0) {
      const matchingSkills = appSkills.filter((skill: string) =>
        jobSkills.some((js: string) => js.toLowerCase().includes(skill.toLowerCase()))
      );
      score += (matchingSkills.length / jobSkills.length) * 30;
    }

    // Experience level match (20 points)
    if (job.experience?.level && preferences.searchFilters?.experienceLevel?.includes(job.experience.level)) {
      score += 20;
    }

    return Math.min(Math.round(score), 100);
  }

  private calculateQualityScore(application: any): number {
    let score = 60; // Base score

    if (application.coverLetter) {
      const wordCount = application.coverLetter.split(/\s+/).length;

      // Optimal length: 200-400 words (25 points)
      if (wordCount >= 200 && wordCount <= 400) {
        score += 25;
      } else if (wordCount > 400 && wordCount <= 600) {
        score += 15;
      } else if (wordCount > 100) {
        score += 10;
      }

      // Quality indicators
      // Mentions company (5 points)
      if (application.coverLetter.includes(application.companyId)) score += 5;

      // Good length (10 points)
      if (application.coverLetter.length > 500) score += 10;
    }

    return Math.min(Math.round(score), 100);
  }

  private calculateSkillMatch(application: any, job: any): number {
    const appSkills = application.metadata?.skills || [];
    const jobSkills = job.skills || [];

    if (jobSkills.length === 0) return 0;

    const matches = appSkills.filter((skill: string) =>
      jobSkills.some((js: string) => js.toLowerCase().includes(skill.toLowerCase()))
    );

    return Math.round((matches.length / jobSkills.length) * 100);
  }

  private calculateExperienceMatch(application: any, job: any): number {
    // If job has experience level requirement, check match
    if (job.experience?.level) {
      // You can enhance this based on user's actual experience
      // For now, returning a default value
      return 75;
    }
    return 50;
  }

  private generateScoreSuggestions(
    application: any,
    job: any,
    scores: { completeness: number; relevance: number; quality: number }
  ): string[] {
    const suggestions: string[] = [];

    // Completeness suggestions
    if (scores.completeness < 80) {
      if (!application.resumeVersion) {
        suggestions.push('Upload a resume to strengthen your application');
      }
      if (!application.coverLetter || application.coverLetter.length < 100) {
        suggestions.push('Add a detailed cover letter (200-400 words recommended)');
      }
      if (!application.attachments || application.attachments.length === 0) {
        suggestions.push('Consider adding portfolio items or certificates');
      }
      if (!application.metadata?.skills || application.metadata.skills.length === 0) {
        suggestions.push('Add relevant skills to your application');
      }
    }

    // Relevance suggestions
    if (scores.relevance < 70) {
      if (job.skills && job.skills.length > 0) {
        suggestions.push(`Highlight these key skills: ${job.skills.slice(0, 3).join(', ')}`);
      }
      suggestions.push('Tailor your application to match the job requirements more closely');
    }

    // Quality suggestions
    if (scores.quality < 75) {
      const wordCount = application.coverLetter?.split(/\s+/).length || 0;

      if (wordCount < 200) {
        suggestions.push('Expand your cover letter to 200-400 words for better impact');
      } else if (wordCount > 500) {
        suggestions.push('Consider making your cover letter more concise (200-400 words is optimal)');
      }

      suggestions.push('Review and improve the content quality of your cover letter');
      suggestions.push('Personalize your cover letter by mentioning the company name');
    }

    // If all scores are good
    if (suggestions.length === 0) {
      suggestions.push('Your application looks great! Good luck! 🎉');
    }

    return suggestions;
  }

  async checkRateLimit(userId: string, feature: string, limit: number, windowSeconds: number) {
    validId(userId);
    const key = `ratelimit:${userId}:${feature}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const count = await CacheUtil.incr(key);
    if (count === 1) await CacheUtil.expire(key, windowSeconds);
    if (count > limit) throw new ConflictError(`Rate limit exceeded for ${feature}`);
  }

  async checkFeatureLimit(
    userId: string,
    feature: string
  ): Promise<{ hasAccess: boolean }> {
    validId(userId);

    const limits: Record<string, number> = {
      batchApplications: 10,
      quickApplySettings: 5,
    };

    if (!(feature in limits)) {
      throw new Error(`Unknown feature: ${feature}`);
    }

    const usageKey = `feature:${userId}:${feature}:${new Date().getMonth()}`;

    const count = await CacheUtil.incr(usageKey);

    if (count === 1) {
      await CacheUtil.expire(usageKey, 86400 * 31); // ~1 month
    }

    const limit = limits[feature];
    const hasAccess = count <= limit;

    if (!hasAccess) {
      throw new ConflictError(`Monthly limit exceeded for ${feature}`);
    }

    return { hasAccess: true };
  }

  async calculateOfferScore(offer: any) {
    const baseScore = (offer.salary || 0) / 100000 + (offer.equity || 0) * 10;
    return Math.min(100, Math.max(0, Math.floor(baseScore)));
  }

  async computeApplicationScore(applicationId: string, userId: string) {
    validId(applicationId);
    validId(userId);

    const application = await JobApplication.findOne({ applicationId, userId }).lean();
    if (!application) throw new NotFoundError('Application not found');

    // Job model se real job details lao
    const job = await Job.findById(application.jobId).select(
      'experienceLevel skills location salary'
    ).lean();

    if (!job) throw new NotFoundError('job not found');



    const preferences = await modelService.getUserPreferences(userId);
    const score = {
      score: 85,
      // factors: {
      //   skillMatch: preferences.searchFilters.skills?.some((s: string) => application.skills?.includes(s)) ? 90 : 70,
      //   experienceMatch: preferences.searchFilters.experienceLevel?.includes(application.experienceLevel) ? 85 : 65,
      //   locationPreference: preferences.searchFilters.locations?.includes(application.location) ? 80 : 60,
      //   salaryAlignment: preferences.searchFilters.salaryRange?.min <= (application.salary || 0) ? 85 : 65,
      // },
      // Ab factors calculate karo job ke basis pe (kyunki preferences job ke against hain)
      factors: {
        skillMatch: preferences.searchFilters.skills?.some((s: any) =>
          job.skills?.includes(s) ?? false
        ) ? 90 : 70,

        experienceMatch: preferences.searchFilters.experienceLevel?.includes(
          job.experience.level
        ) ? 85 : 65,

        locationPreference: preferences.searchFilters.locations?.includes(
          job.location
        ) ? 80 : 60,

        salaryAlignment: preferences.searchFilters.salaryRange?.min <=
          (job.salary?.min ?? 0) ? 85 : 65,
      },
      recommendations: ['Highlight project management experience', 'Emphasize technical skills'],
    };

    return score;
  }

  async scheduleThankYouReminder(userId: string, interviewId: string) {
    validId(userId);
    validId(interviewId);

    const reminderId = generateSecureId();
    const reminder = {
      id: reminderId,
      type: 'reminder',
      content: 'Send thank you note for interview',
      reminderDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'pending',
      createdAt: new Date(),
    };

    await CacheUtil.set(`${constants.CACHE_KEYS.FOLLOW_UPS(userId)}:${reminderId}`, reminder, Number(constants.CACHE_TTLS.FOLLOW_UPS));

    await JobApplication.updateOne(
      { userId, 'notes.id': interviewId },
      { $push: { notes: reminder }, $set: { updatedAt: new Date() } }
    );

    await modelService.logFeatureUsage(userId, 'thankYouReminder', { reminderId });
  }

  async uploadVideoFile(videoId: string, fileBuffer: Buffer) {
    validId(videoId);
    // Real mein S3/AWS upload karna
    return `https://storage.example.com/videos/${videoId}`;
  }

  async uploadPortfolioFile(portfolioId: string, fileBuffer: Buffer) {
    validId(portfolioId);
    // Real mein S3/AWS upload karna
    return `https://storage.example.com/portfolios/${portfolioId}`;
  }

  // Helper method for calculating total compensation
  private calculateTotalComp(offer: OfferDetails): number {
    const salary = offer.salary || 0;
    const bonus = offer.bonus || 0;
    const equity = offer.equity || 0;
    return salary + bonus + equity;
  }

  // Helper method for generating recommendations
  private generateOfferRecommendations(offers: OfferDetails[]): any {
    if (offers.length === 0) {
      return { message: 'No offers to compare' };
    }

    // Find best offer by total compensation
    const offersWithComp = offers.map(offer => ({
      ...offer,
      totalCompensation: this.calculateTotalComp(offer),
    }));

    const bestOffer = offersWithComp.reduce((best, current) =>
      current.totalCompensation > best.totalCompensation ? current : best
    );

    return {
      bestOffer: bestOffer.id,
      highestCompensation: bestOffer.totalCompensation,
      averageCompensation: offersWithComp.reduce((sum, o) => sum + o.totalCompensation, 0) / offers.length,
      totalOffersCompared: offers.length,
    };
  }
}

export const premiumExtendedService = new PremiumExtendedService();