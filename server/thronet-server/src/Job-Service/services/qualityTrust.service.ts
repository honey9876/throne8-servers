// src/services/qualityTrust.service.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
// import { Company, Job, JobApplication, QualityTrust } from "@/models";
import { Company } from "@/company/models";
import { Job, JobApplication, QualityTrust } from "../models";
import logger from "@/shared/logger.util";
import { sanitizeInput } from "@/shared/security";
import axios from "axios";
import { serviceLatency, serviceErrors } from "@/shared/metrics";

import {
  AppError,
  NotFoundError,
  DatabaseError,
  ExternalServiceError,
} from "@/shared/errors/app.error";
import CacheUtil from "@/shared/cache.util";
import constants from "@/shared/constants.util";

dotenv.config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export class QualityTrustService {

  // Kafka consumer logic removed completely

  async verifyCompany(params: {
    companyId: string;
    verifiedBy: string;
    requestId: string;
  }) {
    const { companyId, verifiedBy, requestId } = params;
    const operation = "company_verification";
    const endLatency = serviceLatency.startTimer({ operation });

    try {
      logger.info(`[${requestId}] Starting company verification`, { companyId });

      const company = await Company.findById(companyId).lean();
      if (!company || company.audit.isDeleted) {
        throw new NotFoundError(`Company not found`);
      }

      // const verificationChecks = await this.runCompanyVerificationChecks( company);
      // ✅ Fix
      const verificationChecks = await this.runCompanyVerificationChecks({
        company: {
          name: company.companyName,
          domain: company.website || '',
          address: company.headquarters?.address || '',
          socialProfiles: Array.isArray(company.socialMedia)
            ? (company.socialMedia as any[]).map(s => s.url || s).join(',')
            : ''
        },
        requestId
      });

      const passed = verificationChecks.overall.passed;

      const verification = await QualityTrust.create({
        type: "company_verification",
        companyId,
        verifiedBy,
        verificationChecks,
        status: passed ? "verified" : "pending",
        verifiedAt: new Date(),
      }).catch((err: any) => {
        throw new DatabaseError("Failed to save verification record", { cause: err });
      });

      await Company.updateOne(
        { companyId: companyId },
        {
          isVerified: passed,
          verifiedBadge: passed,
          verificationId: verification._id,
          lastVerificationCheck: new Date(),
        }
      );

      const result = {
        companyId: companyId.toString(),
        isVerified: passed,
        verification: verification.toObject(),
        checks: verificationChecks,
      };

      await CacheUtil.set(
        `company_verification:${companyId}`,
        JSON.stringify(result),
        Number(constants.CACHE_TTLS.COMPANY_VERIFICATION),
      );

      logger.info(`[${requestId}] Company verification completed`);
      endLatency();
      return result;
    } catch (error: any) {
      serviceErrors.inc({ operation });
      logger.error(`[${requestId}] Company verification failed`, { companyId });

      if (error instanceof AppError) throw error;
      throw new ExternalServiceError(`Company verification process failedwith with error ${error}`);
    }
  }

  async checkJobSpam(params: { jobId: string; requestId: string }) {
    const { jobId, requestId } = params;
    const operation = "spam_detection";
    const endLatency = serviceLatency.startTimer({ operation });

    try {
      logger.info(`[${requestId}] Starting spam check`, { jobId });

      const job = await Job.findById(jobId).populate("companyId").lean();
      if (!job || job.isDeleted) {
        throw new NotFoundError("Job not found");
      }

      const spamChecks = await this.runSpamDetection(job, requestId);
      const spamScore = this.calculateSpamScore(spamChecks);
      const isSpam = spamScore > 0.7;

      const verification = await QualityTrust.create({
        type: "spam_check",
        jobId,
        spamScore,
        isSpam,
        checks: spamChecks,
        checkedAt: new Date(),
      });

      if (isSpam) {
        await Job.updateOne(
          { _id: jobId },
          { isSpam: true, spamScore, flaggedAt: new Date() }
        );
      }

      const result = {
        jobId: jobId.toString(),
        isSpam,
        confidence: spamScore,
        checks: spamChecks,
        verification: verification.toObject(),
      };

      await CacheUtil.set(`job_spam:${jobId}`, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_SPAM),);

      logger.info(`[${requestId}] Spam check completed`, { spamScore });
      endLatency();
      return result;
    } catch (error: any) {
      serviceErrors.inc({ operation });
      logger.error(`[${requestId}] Spam check failed`);

      if (error instanceof AppError) throw error;
      throw new ExternalServiceError("Job spam detection failed", error);
    }
  }

  // verifySalary method (similar pattern)
  async verifySalary(params: {
    jobId: string;
    salaryData: any;
    requestId: string;
  }) {
    const { jobId, salaryData, requestId } = params;
    const operation = "salary_verification";
    const endLatency = serviceLatency.startTimer({ operation });

    try {
      const job = await Job.findById(jobId).lean();
      if (!job || job.isDeleted) throw new NotFoundError("Job not found");

      const marketData = await this.getMarketSalaryData({
        title: job.title,
        location: job.location?.city || '',
        experience: job.experience.level,
        skills: job.skills?.map((s: any) => (typeof s === 'string' ? s : s.name)) || [],
      });

      const verification = await this.compareSalaryToMarket(salaryData, marketData, requestId);

      const record = await QualityTrust.create({
        type: "salary_verification",
        jobId,
        providedSalary: salaryData,
        marketData,
        verification,
        verifiedAt: new Date(),
      });

      await Job.updateOne({ _id: jobId }, { salaryVerified: verification.isValid });

      const result = {
        jobId: jobId.toString(),
        isVerified: verification.isValid,
        confidence: verification.confidence,
        marketComparison: verification.comparison,
        verification: record.toObject(),
      };

      await CacheUtil.set(
        `salary_verification:${jobId}`,
        JSON.stringify(result),
        Number(constants.CACHE_TTLS.SALARY_VERIFICATION),
      );

      endLatency();
      return result;
    } catch (error: any) {
      serviceErrors.inc({ operation });
      if (error instanceof AppError) throw error;
      throw new ExternalServiceError("Salary verification failed");
    }
  }

  async checkDuplicateApplication(params: {
    userId: string;
    jobId: string;
    requestId: string;
  }) {
    const { userId, jobId, requestId } = params;
    const operation = "duplicate_application";
    const endLatency = serviceLatency.startTimer({ operation });

    try {
      const job = await Job.findById(jobId).lean();
      if (!job || job.isDeleted) throw new NotFoundError("Job not found");

      const existingApplication = await JobApplication.findOne({
        userId,
        jobId,
        status: { $ne: "withdrawn" },
      }).lean();

      const similarApplications = await JobApplication.find({
        userId,
        companyId: job.companyId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }).lean();

      const isDuplicate = !!existingApplication;
      const hasSimilarRecent = similarApplications.length > 0;

      const verification = await QualityTrust.create({
        type: "duplicate_check",
        userId,
        jobId,
        isDuplicate,
        hasSimilarRecent,
        existingApplications: existingApplication ? [existingApplication._id] : [],
        similarApplications: similarApplications.map((app) => app._id),
        checkedAt: new Date(),
      });

      const result = {
        userId: userId.toString(),
        jobId: jobId.toString(),
        isDuplicate,
        hasSimilarRecent,
        existingApplication: existingApplication ? existingApplication._id.toString() : null,
        similarCount: similarApplications.length,
        recommendation: this.getDuplicateRecommendation(isDuplicate, hasSimilarRecent),
        verification: verification.toObject(),
      };

      await CacheUtil.set(
        `duplicate_application:${userId}:${jobId}`,
        JSON.stringify(result),
        Number(constants.CACHE_TTLS.DUPLICATE_APPLICATION),

      );

      logger.info(`[${requestId}] Duplicate check completed`, { userId, jobId, isDuplicate, duration: Date.now() });
      endLatency();
      return result;
    } catch (error: any) {
      serviceErrors.inc({ operation });
      logger.error(`[${requestId}] Duplicate check failed: ${error.message}`, { userId, jobId, error: error.stack });
      throw error;
    }
  }

  async calculateJobQuality(params: { jobId: string; requestId: string }) {
    const operation = "job_quality";
    const { jobId, requestId } = params;
    try {

      const latency = serviceLatency.startTimer({ operation });
      logger.info(`[${requestId}] Calculating job quality`, { jobId });

      const job = await Job.findById(jobId).populate("companyId").lean();
      if (!job || job.isDeleted) throw new Error("Job not found");

      const qualityMetrics = await this.assessJobQuality(job, requestId);
      const overallScore = this.calculateOverallQualityScore(qualityMetrics);

      const verification = await QualityTrust.create({
        type: "quality_assessment",
        jobId,
        metrics: qualityMetrics,
        overallScore,
        assessedAt: new Date(),
      });

      await Job.updateOne({ _id: jobId }, { qualityScore: overallScore, lastQualityCheck: new Date() });

      const result = {
        jobId: jobId.toString(),
        score: overallScore,
        grade: this.getQualityGrade(overallScore),
        metrics: qualityMetrics,
        recommendations: this.getQualityRecommendations(qualityMetrics),
        verification: verification.toObject(),
      };

      await CacheUtil.set(`job_quality:${jobId}`, JSON.stringify(result),
        Number(constants.CACHE_TTLS.JOB_QUALITY),);

      logger.info(`[${requestId}] Job quality calculated`, { jobId, score: overallScore, duration: Date.now() });
      latency();
      return result;
    } catch (error: any) {
      serviceErrors.inc({ operation });
      logger.error(`[${requestId}] Job quality calculation failed: ${error.message}`, { jobId, error: error.stack });
      throw error;
    }
  }

  async getCompanyVerification(params: { companyId: string; requestId: string }) {
    const operation = "get_company_verification";
    const { companyId, requestId } = params;
    try {
      const latency = serviceLatency.startTimer({ operation });
      logger.info(`[${requestId}] Getting company verification status`, { companyId });

      const company = await Company.findById(companyId).lean();
      if (!company || company.audit.isDeleted) throw new Error("Company not found");

      // let verification = null;
      // if ((company as any).verificationId) {
      //   verification = await QualityTrust.findOne({ _id: company.verificationId, type: "company_verification" }).lean();
      // }
      // ✅ Replace with direct query
      const verification = await QualityTrust.findOne({
        companyId: companyId,
        type: "company_verification"
      }).sort({ verifiedAt: -1 }).lean(); // Get latest verification

      const result = {
        companyId: companyId.toString(),
        isVerified: company.account.isVerified || false,
        verificationDate: company.account.verifiedAt,
        verification,
        badgeLevel: this.getVerificationBadgeLevel(company, verification),
      };

      await CacheUtil.set(
        `company_verification_status:${companyId}`,
        JSON.stringify(result),
        Number(constants.CACHE_TTLS.COMPANY_VERIFICATION),

      );

      logger.info(`[${requestId}] Company verification status retrieved`, { companyId, duration: Date.now() });
      latency();
      return result;
    } catch (error: any) {
      serviceErrors.inc({ operation });
      logger.error(`[${requestId}] Get verification status failed: ${error.message}`, { companyId, error: error.stack });
      throw error;
    }
  }

  async runCompanyVerificationChecks(params: {
    company: {
      name: string, domain: string, address: string, socialProfiles: string
    }; requestId: string
  }) {
    const { company, requestId } = params;
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Verify company: ${JSON.stringify({
      name: company.name,
      domain: company.domain,
      address: company.address,
      socialProfiles: company.socialProfiles,
    })}. Check business registration, website, social media, employee count, and address. Return { checks: object, overall: { passed: boolean, score: number } }.`;

    const retry = async (fn: any, retries = 3, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (error: any) {
          if (i === retries - 1) throw new Error(`Gemini API failed: ${error.message}`);
          await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    };

    const result = await retry(() => model.generateContent(prompt));
    const checks = JSON.parse(sanitizeInput(result.response.text()));

    const passedChecks = Object.values(checks.checks).filter((check: any) => check.passed).length;
    const totalChecks = Object.keys(checks.checks).length;

    checks.overall = {
      passed: passedChecks >= Math.ceil(totalChecks * 0.6),
      score: (passedChecks / totalChecks) * 100,
      passedChecks,
      totalChecks,
    };

    return checks;
  }

  async runSpamDetection(job: any, requestId: string) {
    const checks = await Promise.all([
      this.checkDuplicateJobContent(job),
      this.checkSuspiciousKeywords(job),
      this.checkUnrealisticSalary(job),
      this.assessDescriptionQuality(job),
      this.checkCompanyReputation(job.companyId),
      this.validateContactInformation(job),
    ]);

    return {
      duplicateContent: checks[0],
      suspiciousKeywords: checks[1],
      unrealisticSalary: checks[2],
      descriptionQuality: checks[3],
      companyReputation: checks[4],
      contactInformation: checks[5],
    };
  }

  calculateSpamScore(checks: any): number {
    const weights = {
      duplicateContent: 0.25,
      suspiciousKeywords: 0.15,
      unrealisticSalary: 0.20,
      descriptionQuality: 0.15,
      companyReputation: 0.15,
      contactInformation: 0.10,
    };

    let score: any = 0;
    // Object.keys(weights as any).forEach((check: any) => {
    //   if (checks[check]?.isSpam) {
    //     score += weights[check] * (checks[check].confidence || 1);
    //   }
    // });

    Object.keys(weights).forEach((check) => {
      const weightKey = check as keyof typeof weights;
      if (checks[weightKey]?.isSpam) {
        score += weights[weightKey] * (checks[weightKey].confidence || 1);
      }
    });
    return Math.min(score, 1.0);
  }

  async getMarketSalaryData(params: { title: string, location: string, experience: string, skills: string[] }) {
    const { title, location, experience, skills } = params;
    const cacheKey = `market_salary:${title}:${location}:${experience}`;
    const cachedData = await CacheUtil.get(cacheKey);
    if (cachedData) return JSON.parse(cachedData);

    // Replace with real API (e.g., Glassdoor)
    const response = await axios.get(
      `https://api.glassdoor.com/salary?title=${encodeURIComponent(title)}&location=${encodeURIComponent(location)}&experience=${experience}`,
      { timeout: 5000 }
    ).catch(() => ({
      data: {
        min: 70000,
        max: 120000,
        median: 95000,
        currency: "USD",
        source: "mock",
      },
    }));

    const marketData = {
      minSalary: response.data.min,
      maxSalary: response.data.max,
      medianSalary: response.data.median,
      currency: response.data.currency,
      dataSource: response.data.source,
      confidence: response.data.source === "mock" ? 0.5 : 0.9,
    };

    await CacheUtil.set(cacheKey, JSON.stringify(marketData), Number(constants.CACHE_TTLS.SALARY_VERIFICATION),);
    return marketData;
  }

  async compareSalaryToMarket(
    providedSalary: any,
    marketData: any,
    requestId: string
  ): Promise<any> {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `Compare provided salary: ${JSON.stringify(providedSalary)} with market data: ${JSON.stringify(marketData)}. Return { isValid: boolean, confidence: number, comparison: object, reasons: array }.`;

    try {
      const result = await this.generateWithRetry(prompt);  // Use the shared retry helper
      return result;
    } catch (error: any) {
      logger.error(`[${requestId}] Salary comparison with Gemini failed`);
      throw new ExternalServiceError(`Failed to compare salary with market data via AI with error${error}`);
    }
  }

  // Add this method in class:
  private async generateWithRetry(prompt: string, retries = 3): Promise<any> {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    for (let i = 0; i < retries; i++) {
      try {
        const result = await model.generateContent(prompt);
        return JSON.parse(sanitizeInput(result.response.text()));
      } catch (error: any) {
        if (i === retries - 1) throw error;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  }

  getDuplicateRecommendation(
    isDuplicate: boolean,
    hasSimilarRecent: boolean
  ): { action: "block" | "warn" | "allow"; message: string } {
    if (isDuplicate) {
      return { action: "block", message: "You have already applied to this position" };
    } else if (hasSimilarRecent) {
      return { action: "warn", message: "You recently applied to a similar position at this company" };
    }
    return { action: "allow", message: "Application can proceed" };
  }

  async assessJobQuality(job: any, requestId: string) {
    const checks = await Promise.all([
      this.assessDescriptionQuality(job),
      this.assessCompanyInformation(job.companyId),
      this.assessSalaryTransparency(job),
      this.assessRequirementsClarity(job),
      this.assessContactInformation(job),
      this.assessApplicationProcess(job),
    ]);

    return {
      descriptionQuality: checks[0],
      companyInformation: checks[1],
      salaryTransparency: checks[2],
      requirementsClarity: checks[3],
      contactInformation: checks[4],
      applicationProcess: checks[5],
    };
  }

  calculateOverallQualityScore(metrics: any) {
    const weights = {
      descriptionQuality: 0.25,
      companyInformation: 0.20,
      salaryTransparency: 0.15,
      requirementsClarity: 0.20,
      contactInformation: 0.10,
      applicationProcess: 0.10,
    };

    let totalScore = 0;
    Object.keys(weights).forEach((metric) => {
      const weightKey = metric as keyof typeof weights;
      totalScore += (metrics[weightKey]?.score || 0) * weights[weightKey];
    });

    return Math.round(totalScore);
  }

  getQualityGrade(score: any) {
    if (score >= 90) return "A+";
    if (score >= 80) return "A";
    if (score >= 70) return "B";
    if (score >= 60) return "C";
    return "D";
  }

  getQualityRecommendations(metrics: any) {
    const recommendations: Array<{
      area: string;
      suggestion: string;
      priority: 'high' | 'medium';
    }> = [];
    Object.keys(metrics).forEach((key) => {
      if (metrics[key].score < 70) {
        recommendations.push({
          area: key,
          suggestion: metrics[key].suggestion || `Improve ${key}`,
          priority: metrics[key].score < 50 ? "high" : "medium",
        });
      }
    });
    return recommendations;
  }

  getVerificationBadgeLevel(company: any, verification: any) {
    if (!company.isVerified) return "none";
    if (verification && verification.checks.overall.score >= 90) return "gold";
    if (verification && verification.checks.overall.score >= 70) return "silver";
    return "bronze";
  }

  async checkBusinessRegistration(company: any) {
    try {
      const response = await axios.get(
        `https://api.business-registry.com/verify?name=${encodeURIComponent(company.name)}`,
        { timeout: 5000 }
      );
      // ✅ Fix
      const data = response.data as any;
      return {
        passed: data.isRegistered || false,
        confidence: 0.9,
        details: data.details || 'No details available',
      };
    } catch (error: any) {
      return { passed: false, confidence: 0.3, details: "Registration check failed" };
    }
  }

  async verifyCompanyWebsite(company: any) {
    try {
      const response = await axios.get(`https://${company.domain}`, { timeout: 5000 });
      return {
        passed: response.status === 200,
        confidence: 0.8,
        details: `Website ${company.domain} is accessible`,
      };
    } catch (error: any) {
      return { passed: false, confidence: 0.4, details: `Website ${company.domain} is inaccessible` };
    }
  }

  async checkSocialMediaPresence(company: any) {
    const profiles = company.socialProfiles || [];
    const validProfiles = await Promise.all(
      profiles.map(async (url: any) => {
        try {
          await axios.get(url, { timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );
    return {
      passed: validProfiles.some((v) => v),
      confidence: validProfiles.filter((v) => v).length / Math.max(profiles.length, 1),
      details: `Valid profiles: ${validProfiles.filter((v) => v).length}/${profiles.length}`,
    };
  }

  async verifyEmployeeCount(company: any) {
    return {
      passed: company.employeeCount >= 10,
      confidence: company.employeeCount >= 10 ? 0.8 : 0.5,
      details: `Employee count: ${company.employeeCount}`,
    };
  }

  async verifyBusinessAddress(company: any) {
    return {
      passed: !!company.address,
      confidence: company.address ? 0.9 : 0.2,
      details: company.address ? `Address: ${company.address}` : "No address provided",
    };
  }

  async checkDuplicateJobContent(job: any) {
    const cacheKey = `duplicate_job:${job._id}`;
    const cached = await CacheUtil.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const similarJobs = await Job.find({
      companyId: { $ne: job.companyId },
      description: { $regex: job.description.slice(0, 100), $options: "i" },
      isDeleted: false,
    }).lean();

    const result = {
      isSpam: similarJobs.length > 0,
      confidence: similarJobs.length > 0 ? 0.8 : 0.2,
      details: similarJobs.length > 0 ? `Found ${similarJobs.length} similar jobs` : "No duplicates",
    };

    await CacheUtil.set(cacheKey, JSON.stringify(result), Number(constants.CACHE_TTLS.JOB_SPAM),);
    return result;
  }

  checkSuspiciousKeywords(job: any) {
    const suspiciousWords = [
      "urgent",
      "immediate start",
      "no experience required",
      "work from home",
      "easy money",
      "guaranteed income",
    ];

    const description = (job.description || "").toLowerCase();
    const foundSuspicious = suspiciousWords.filter((word) => description.includes(word));

    return {
      isSpam: foundSuspicious.length > 2,
      confidence: Math.min(foundSuspicious.length * 0.3, 1.0),
      keywords: foundSuspicious,
    };
  }

  async checkUnrealisticSalary(job: any) {
    const salary = job.salaryRange || { min: 0, max: 0 };
    const marketData = await this.getMarketSalaryData({
      title: job.title,
      location: job.location,
      experience: job.experienceLevel,
      skills: job.skills,
    });

    const isUnrealistic = salary.max > marketData.maxSalary * 2 || salary.min < marketData.minSalary * 0.5;
    return {
      isSpam: isUnrealistic,
      confidence: isUnrealistic ? 0.9 : 0.3,
      details: isUnrealistic ? "Salary outside market range" : "Salary within market range",
    };
  }

  assessDescriptionQuality(job: any) {
    const description = job.description || "";
    let score = 0;
    const issues = [];

    if (description.length > 200) score += 20;
    else issues.push("Description too short");

    const sections = ["responsibilities", "requirements", "qualifications"];
    const foundSections = sections.filter((section) => description.toLowerCase().includes(section));
    score += (foundSections.length / sections.length) * 30;

    const commonErrors = ["recieve", "seperate", "occured"];
    const hasErrors = commonErrors.some((error) => description.includes(error));
    if (!hasErrors) score += 25;

    if (description.includes("years of experience") && description.includes("skills")) score += 25;

    return {
      score: Math.min(score, 100),
      issues,
      suggestion: issues.length > 0 ? "Improve job description content and structure" : null,
    };
  }

  // async checkCompanyReputation(companyId: string) {
  //   const company = await Company.findById(companyId).lean();
  //   return {
  //     isSpam: !company.isVerified,
  //     confidence: company.isVerified ? 0.2 : 0.8,
  //     details: company.isVerified ? "Company verified" : "Company not verified",
  //   };
  // }

  async checkCompanyReputation(companyId: any) {
  const company = await Company.findById(companyId).lean();
  
  if (!company) {
    return {
      isSpam: true,
      confidence: 0.9,
      details: "Company not found"
    };
  }
  
  const isVerified = (company as any).isVerified || company.account?.isVerified || false;
  
  return {
    isSpam: !isVerified,
    confidence: isVerified ? 0.2 : 0.8,
    details: isVerified ? "Company verified" : "Company not verified",
  };
}

  validateContactInformation(job: any) {
    const hasContact = !!(job.contactEmail || job.contactPhone);
    return {
      isSpam: !hasContact,
      confidence: hasContact ? 0.2 : 0.7,
      details: hasContact ? "Contact information provided" : "No contact information",
    };
  }

  // ✅ Fix
async assessCompanyInformation(companyId: any) {
  const company = await Company.findById(companyId).lean();
  
  if (!company) {
    return {
      score: 0,
      issues: ['Company not found'],
      suggestion: 'Verify company exists'
    };
  }
  
  let score = 0;
  const issues: string[] = [];

  // Use 'descriptions' instead of 'description'
  if (company.descriptions.detailed) score += 30;
  else issues.push("Missing company description");

  if (company.website) score += 30;
  else issues.push("Missing company website");

  if ((company as any).isVerified || company.account?.isVerified) score += 40;

  return {
    score,
    issues,
    suggestion: issues.length > 0 ? "Complete company profile" : null,
  };
}


  // async assessCompanyInformation(companyId: string) {
  //   const company = await Company.findById(companyId).lean();
  //   let score = 0;
  //   const issues = [];

  //   if (company.description) score += 30;
  //   else issues.push("Missing company description");

  //   if (company.website) score += 30;
  //   else issues.push("Missing company website");

  //   if (company.isVerified) score += 40;

  //   return {
  //     score,
  //     issues,
  //     suggestion: issues.length > 0 ? "Complete company profile" : null,
  //   };
  // }

  assessSalaryTransparency(job: any) {
    const hasSalary = !!(job.salaryRange?.min && job.salaryRange?.max);
    return {
      score: hasSalary ? 80 : 20,
      suggestion: hasSalary ? null : "Provide salary range",
    };
  }

  assessRequirementsClarity(job: any) {
    const hasSkills = job.skills?.length > 0;
    const hasExperience = !!job.experienceLevel;
    let score = 0;
    const issues = [];

    if (hasSkills) score += 50;
    else issues.push("Missing required skills");

    if (hasExperience) score += 50;
    else issues.push("Missing experience level");

    return {
      score,
      issues,
      suggestion: issues.length > 0 ? "Specify skills and experience requirements" : null,
    };
  }

  assessContactInformation(job: any) {
    const hasContact = !!(job.contactEmail || job.contactPhone);
    return {
      score: hasContact ? 80 : 20,
      suggestion: hasContact ? null : "Provide contact information",
    };
  }

  assessApplicationProcess(job: any) {
    const hasApplyLink = !!job.applyLink;
    return {
      score: hasApplyLink ? 80 : 20,
      suggestion: hasApplyLink ? null : "Provide clear application instructions",
    };
  }

  async processTask(payload: any, requestId: string) {
    // Implement your task processing logic
    logger.info(`Processing task for request ${requestId}`, { service: 'quality-trust', payload });
    return { result: 'processed', data: payload }; // Example
  }
}

export const qualityTrustService = new QualityTrustService();

