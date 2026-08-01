// src/connections/routes/catchup.routes.ts
import { Router } from 'express';
import { getCatchUpFeed } from '../controllers/catchup.controller';

const router: Router = Router();

// GET /catchup/:userId  (final path depends on how this gets mounted — see notes below)
router.get('/:userId', getCatchUpFeed);

export default router;

/**
 * ✅ SETUP NOTE:
 * Iss router ko `src/connections/routes/index.ts` mein mount karo, jaise:
 *
 *   import catchupRoutes from './catchup.routes';
 *   router.use('/catchup', catchupRoutes);
 *
 * Final URL final `app.ts` mein connections module ke mount prefix pe depend karega
 * (jaise agar connections module `/api/v1/connections` pe mount hai, toh final URL:
 *  GET /api/v1/connections/catchup/:userId )
 *
 * Frontend mein URL isi hisaab se set karna — connection.service.ts mein
 * getCatchUpFeed() method mein path adjust kar lena agar prefix alag ho.
 */