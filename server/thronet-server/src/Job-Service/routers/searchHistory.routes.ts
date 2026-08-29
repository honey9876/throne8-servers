// src/routes/searchHistory.js
import express from 'express';

import AuthMiddleware from '@/shared/middlewares/auth.middleware'; // Adjust path as needed
// import { createSearchHistoryController } from '../controllers';
import { createSearchHistoryController, getSearchHistoryByIdController, getUserSearchHistoryController, hardDeleteSearchHistoryController, softDeleteSearchHistoryController, updateSearchHistoryController } from '../controllers';


const router = express.Router();

router.post(
    '/create',
     AuthMiddleware.authenticate as any,
      createSearchHistoryController
    );
router.get(
    '/:searchId',
     AuthMiddleware.authenticate as any,
      getSearchHistoryByIdController
);
router.get(
    '/',
     AuthMiddleware.authenticate as any,
     getUserSearchHistoryController
);
router.put(
    '/:searchId',
    AuthMiddleware.authenticate as any,
    updateSearchHistoryController
);
router.delete(
    '/:searchId/soft',
    AuthMiddleware.authenticate as any,
    softDeleteSearchHistoryController
);
router.delete(
    '/:searchId/hard',
    AuthMiddleware.authenticate as any,
    hardDeleteSearchHistoryController
); // Add admin middleware if needed

export default router;