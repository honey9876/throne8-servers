/**
 * Centralized Route Management
 * 
 * This file exports all application routes and provides
 * a main router for mounting in the Express app
 * 
 * @module routes/connections/index
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';

// ==================== MAIN ROUTER ====================

const router = Router();
console.log('🔍 ConnectionRoutes mounted successfully in routes/connections/index.ts');

// Mount connection request routes
import { connectionRouter } from './connection.routes';
import { requestRouter } from './request.routes';
import { followRouter } from './follow.routes';
import mutualRouter from './mutual.routes';
import searchRoutes from './search.routes';
import blockRouter from './block.routes';

// Mount other connection-related routes here as needed
import catchupRoutes from './catchup.routes';
router.use('/catchup', catchupRoutes);
// Use the routers
router.use('/connection', connectionRouter);  
router.use('/requests', requestRouter);
router.use('/follow', followRouter);
router.use('/mutual', mutualRouter);
// router.use('/search', searchRoutes);
router.use('/block', blockRouter);
export default router;
console.log('🔍 ConnectionRoutes loaded successfully in routes/connections/index.ts');