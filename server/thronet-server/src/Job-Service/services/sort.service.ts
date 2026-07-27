// src/services/jobSorting.service.ts
// Fully updated TypeScript version
// Kafka removed (not present anyway)
// Proper error handling with AppError family
// Added types, modern syntax, consistent logging
// All functions complete - no shortcuts

import logger from "@/shared/logger.util";
import {Job} from "../models";
import {
  AppError,
  NotFoundError,
  DatabaseError,
  ValidationError,
  ExternalServiceError,
} from "@/shared/errors/app.error";
import { DateTime } from "luxon"; // Optional: better date handling (install if needed: npm i luxon)

// =============================================
// 1. calculateRelevanceScore
// =============================================
export function calculateRelevanceScore(
  job: any,
  searchQuery: string,
  userProfile: any = {}
): number {
  try {
    if (!searchQuery) {
      // Fallback to recency if no query
      return Date.now() - new Date(job.dates?.posted || 0).getTime();
    }

    let score = 0;
    const queryTerms = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    if (queryTerms.length === 0) return 0;

    // Title match - highest weight
    queryTerms.forEach((term: string) => {
      if (job.title?.toLowerCase().includes(term)) {
        score += 50;
      }
    });

    // Skills match
    if (job.skills?.length) {
      queryTerms.forEach((term: string) => {
        job.skills.forEach((skill: any) => {
          if (skill.name?.toLowerCase().includes(term)) {
            score += 30;
          }
        });
      });
    }

    // Company match
    if (job.company?.name?.toLowerCase().includes(queryTerms.join(" "))) {
      score += 20;
    }

    // Description match
    if (job.description?.summary) {
      queryTerms.forEach((term: string) => {
        if (job.description.summary.toLowerCase().includes(term)) {
          score += 10;
        }
      });
    }

    // Exact title match boost
    if (job.title?.toLowerCase() === searchQuery.toLowerCase().trim()) {
      score += 100;
    }

    // Recency boost (newer jobs get extra points)
    const daysOld = (Date.now() - new Date(job.dates?.posted || 0).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 20 - daysOld);

    return Math.round(score);
  } catch (error : any) {
    logger.error("Relevance score calculation failed", { jobId: job._id, query: searchQuery });
    throw new ExternalServiceError("Failed to calculate relevance score");
  }
}

// =============================================
// 2. calculateTrendingScore
// =============================================
export function calculateTrendingScore(job: any): number {
  try {
    const now = Date.now();
    const postedDate = new Date(job.dates?.posted || now).getTime();
    const hoursOld = (now - postedDate) / (1000 * 60 * 60);

    // Only consider jobs from last 7 days
    if (hoursOld > 168) return 0;

    const applications = job.applicationsCount || 0;
    const views = job.viewsCount || 0;
    const shares = job.sharesCount || 0;

    const engagementRate = applications / Math.max(views, 1);

    // Time decay: exponential half-life of 48 hours
    const timeDecay = Math.exp(-hoursOld / 48);

    // Weighted trending score
    const trendingScore =
      (applications * 3 + views * 1 + shares * 5 + engagementRate * 100) * timeDecay;

    return Math.round(trendingScore);
  } catch (error : any) {
    logger.error("Trending score calculation failed", { jobId: job._id });
    throw new ExternalServiceError("Failed to calculate trending score");
  }
}

// =============================================
// 3. calculateUrgencyScore
// =============================================
export function calculateUrgencyScore(job: any): number {
  try {
    const now = new Date();
    const deadline = new Date(job.dates?.expires || job.dates?.applicationDeadline);

    if (isNaN(deadline.getTime())) return 0; // No deadline

    const hoursToDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursToDeadline <= 0) return -1; // Expired
    if (hoursToDeadline <= 24) return 100; // Critical urgency
    if (hoursToDeadline <= 72) return 80; // High
    if (hoursToDeadline <= 168) return 60; // Medium
    return 20; // Low urgency
  } catch (error : any) {
    logger.error("Urgency score calculation failed", { jobId: job._id });
    throw new ExternalServiceError("Failed to calculate urgency score");
  }
}

// =============================================
// 4. buildSortQuery (for MongoDB query building)
// =============================================
export function buildSortQuery(filters: any): any {
  try {
    const query: any = {
      status: "active",
      isDeleted: false,
    };

    // Exclude expired jobs unless explicitly asked
    if (!filters.includeExpired) {
      query["dates.expires"] = { $gt: new Date() };
    }

    // Text search
    if (filters.query?.trim()) {
      query.$text = { $search: filters.query.trim() };
    }

    // Location filter
    if (filters.location?.trim()) {
      query["location.city"] = new RegExp(filters.location.trim(), "i");
    }

    // Salary range filter
    if (filters.minSalary || filters.maxSalary) {
      query["salary.min"] = {};
      if (filters.minSalary) query["salary.min"].$gte = Number(filters.minSalary);
      if (filters.maxSalary) query["salary.max"] = { $lte: Number(filters.maxSalary) };
    }

    return query;
  } catch (error : any) {
    logger.error("Sort query building failed", { filters });
    throw new ValidationError("Invalid filters for sort query");
  }
}

// =============================================
// 5. getSortOptions (returns MongoDB sort object)
// =============================================
export function getSortOptions(
  sortBy: string,
  sortOrder: "asc" | "desc" = "desc",
  userProfile: any = null,
  searchQuery: string = ""
): any {
  try {
    const order = sortOrder === "asc" ? 1 : -1;

    const sortOptions: Record<string, any> = {
      relevance: searchQuery.trim()
        ? { score: { $meta: "textScore" }, "dates.posted": -1 }
        : { "dates.posted": -1 },

      date: { "dates.posted": order },
      "salary-high": { "salary.max": -1, "dates.posted": -1 },
      "salary-low": { "salary.min": 1, "dates.posted": -1 },
      alphabetical: { title: order },

      "company-rating": { "company.rating": -1, "company.reviewCount": -1, "dates.posted": -1 },
      applications: { applicationsCount: -1, "dates.posted": -1 },
      views: { viewsCount: -1, "dates.posted": -1 },
      "company-size": { "company.employeeCount": order, "dates.posted": -1 },
      deadline: { "dates.expires": 1, "dates.applicationDeadline": 1 },
      featured: { featured: -1, premium: -1, "dates.posted": -1 },
    };

    return sortOptions[sortBy] || sortOptions.relevance;
  } catch (error : any) {
    logger.error("Sort options generation failed", { sortBy, sortOrder });
    throw new ValidationError("Invalid sort parameters");
  }
}

// =============================================
// 6. getSortIndexHint (for query performance)
// =============================================
export function getSortIndexHint(sortBy: string): any {
  const indexHints: Record<string, any> = {
    date: { "dates.posted": -1, status: 1 },
    "salary-high": { "salary.max": -1, status: 1 },
    "salary-low": { "salary.min": 1, status: 1 },
    "company-rating": { "company.rating": -1, status: 1 },
    applications: { applicationsCount: -1, status: 1 },
    views: { viewsCount: -1, status: 1 },
    alphabetical: { title: 1, status: 1 },
    featured: { featured: -1, premium: -1 },
  };

  return indexHints[sortBy] || null;
}

// =============================================
// 7. getSortDescription (human-readable)
// =============================================
export function getSortDescription(sortBy: string): string {
  const descriptions: Record<string, string> = {
    relevance: "Search relevance and recency",
    date: "Most recent first",
    "salary-high": "Highest salary first",
    "salary-low": "Lowest salary first",
    "company-rating": "Best rated companies first",
    applications: "Most applied jobs first",
    views: "Most viewed jobs first",
    "company-size": "Company size",
    deadline: "Urgent deadlines first",
    featured: "Featured & premium jobs first",
    alphabetical: "Alphabetical by title",
    trending: "Trending based on engagement",
    "match-score": "Best match for your profile",
    distance: "Closest to your location",
    urgency: "Urgent deadlines first",
  };

  return descriptions[sortBy] || "Default sorting (relevance)";
}