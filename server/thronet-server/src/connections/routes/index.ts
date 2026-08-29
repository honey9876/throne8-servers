import { Router, Request, Response } from 'express';
import ProfileViewDigestCron from '@/jobs/profileViewDigestCron';
import BirthdayAnniversaryCron from '@/jobs/birthdayAnniversaryCron';

const router = Router();

async function loadRoutes() {
    console.log('🔍 [1] Loading connection.routes...');
    const { connectionRouter } = await import('./connection.routes');
    console.log('🔍 [2] connection.routes LOADED ✅');

    console.log('🔍 [3] Loading request.routes...');
    const { requestRouter } = await import('./request.routes');
    console.log('🔍 [4] request.routes LOADED ✅');

    console.log('🔍 [5] Loading follow.routes...');
    const { followRouter } = await import('./follow.routes');
    console.log('🔍 [6] follow.routes LOADED ✅');

    console.log('🔍 [7] Loading mutual.routes...');
    const { default: mutualRouter } = await import('./mutual.routes');
    console.log('🔍 [8] mutual.routes LOADED ✅');

    console.log('🔍 [9] Loading search.routes...');
    const { default: searchRoutes } = await import('./search.routes');
    console.log('🔍 [10] search.routes LOADED ✅');

    console.log('🔍 [11] Loading block.routes...');
    const { default: blockRouter } = await import('./block.routes');
    console.log('🔍 [12] block.routes LOADED ✅');

    console.log('🔍 [13] Loading catchup.routes...');
    const { default: catchupRoutes } = await import('./catchup.routes');
    console.log('🔍 [14] catchup.routes LOADED ✅');

    console.log('🔍 [15] Loading profileviews.routes...');
    const { default: profileviewsRoutes } = await import('./profileviews.routes');
    console.log('🔍 [16] profileviews.routes LOADED ✅');

    router.use('/catchup', catchupRoutes);
    router.use('/connection', connectionRouter);
    router.use('/requests', requestRouter);
    router.use('/follow', followRouter);
    router.use('/mutual', mutualRouter);
    router.use('/search', searchRoutes);
    router.use('/block', blockRouter);
    router.use('/profile-views', profileviewsRoutes);

    ProfileViewDigestCron.init();
    BirthdayAnniversaryCron.init();

    console.log('🔍 ALL connection sub-routes loaded successfully ✅');
}

loadRoutes().catch((err) => {
    console.error('🔥 FAILED to load connection routes:', err);
});

export default router;