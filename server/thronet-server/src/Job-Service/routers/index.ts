// src/routes/index.ts
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import jobRouter from './job.routes';
import applicationRouter from './jobApplication.routes';
import analysisRouter from './jobAnalysis.routes';
import searchRouter from './search.routes';
import searchHistoryRouter from './searchHistory.routes';
import filterRouter from './filter.routes';
import sortRouter from './sort.routes';
import aiRouter from './ai.routes';
import qualityTrustRouter from './qualityTrust.routes';
import companyRouter from './company.routes';
import matchingRouter from './matching.routes';
import premiumExtendedRouter from './premium/premiumExended.routes';
import premiumJobSearchRouter from './premium/premium.jobSearch.routes';
import premiumProfessionalDevelopmentRouter from './premium/professionalDevelopment.routes';
import premiumRouter from './premium/premium.routes';


const router = Router();

// Create store function for rate limiting
// export const createStore = (prefix = 'rl:') => {
//     if (useRedis && redisClient) {
//         try {
//             return {
//                 // Increment the counter for the given key
//                 incr: async (key, cb) => {
//                     try {
//                         const result = await redisClient.incr(key);
//                         cb(null, result);
//                     } catch (err) {
//                         cb(err);
//                     }
//                 },
//                 // Reset the counter for the given key
//                 resetKey: async (key) => {
//                     try {
//                         await redisClient.del(key);
//                     } catch (err) {
//                         console.error('❌ Failed to reset key:', err.message);
//                     }
//                 },
//                 // Set TTL for the key
//                 setTTL: async (key, ttl) => {
//                     try {
//                         await redisClient.expire(key, Math.ceil(ttl / 1000));
//                     } catch (err) {
//                         console.error('❌ Failed to set TTL:', err.message);
//                     }
//                 },
//             };
//         } catch (error : any) {
//             console.error('❌ Failed to create Redis store, using memory store:', error.message);
//             return undefined;
//         }
//     }

//     console.log('ℹ️ Using memory store for rate limiting');
//     return undefined; // Use default memory store
// };


// export const premiumLimiter = rateLimit({
//     store: createStore("rate:premium:"),
//     windowMs: 15 * 60 * 1000, // 15 minutes
//     max: 100, // Limit each IP to 100 requests per windowMs
//     message: 'Too many premium requests, please try again later.',
//     standardHeaders: true,
//     legacyHeaders: false,
//     keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req),
// });

// Health check

router.get('/health', (_req, res) => {
    res.json({
        status: 'OK',
        service: 'Mentorship Service',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});


router.use('/jobs', jobRouter);
router.use('/jobs/applications', applicationRouter);
router.use('/jobs/analysis', analysisRouter);
router.use('/jobs/search', searchRouter);
router.use('/jobs/filters', filterRouter);
router.use('/jobs/search-history', searchHistoryRouter);
router.use('/jobs/sort', sortRouter);
router.use('/jobs/ai', aiRouter);
router.use('/jobs/quality-trust', qualityTrustRouter);
router.use('/jobs/company', companyRouter);
router.use('/jobs/matching', matchingRouter);
router.use('/jobs/premium',  premiumRouter);
router.use('/jobs/premiumExtended',  premiumExtendedRouter);
router.use('/jobs/premiumSearch',  premiumJobSearchRouter);
router.use('/jobs/premium/professionalDevelopment',  premiumProfessionalDevelopmentRouter);


export default router;