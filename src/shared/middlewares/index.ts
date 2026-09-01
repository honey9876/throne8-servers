import {
    initializeRateLimiters,
    uploadRateLimiter,
    readRateLimiter,
    updateRateLimiter,
    deleteRateLimiter,
    generalRateLimiter,
    setRateLimitHeaders,
    handleRateLimitExceeded,
    getRateLimitKey,
    // getRateLimiter
} from "@/Profile/middlewares/profile.rateLimiter.middlewares";

import { rateLimitSearch,
  rateLimitGeneral,
  rateLimitStrict,
  rateLimitByUser,
  rateLimitByIP,
  createRateLimiter} from '@/Mentorship/middlewares/rateLimit.middleware';

export {
    initializeRateLimiters,
    uploadRateLimiter,
    readRateLimiter,
    updateRateLimiter,
    deleteRateLimiter,
    generalRateLimiter,
    setRateLimitHeaders,
    handleRateLimitExceeded,
    getRateLimitKey,
    // getRateLimiter,

    rateLimitSearch,
      rateLimitGeneral,
      rateLimitStrict,
      rateLimitByUser,
      rateLimitByIP,
      createRateLimiter,
}