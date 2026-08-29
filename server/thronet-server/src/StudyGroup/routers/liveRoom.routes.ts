/**
 * ====================================
 * LIVE ROOM ROUTES
 * ====================================
 * API routes for live room management
 */
console.log('🟢 STEP-1: liveRoom.routes.ts file STARTED loading');
import express from 'express';
import liveRoomController  from '../controllers/liveRoom.controller';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';

const router = express.Router();

/**
 * ============================================
 * LIVE ROOM CRUD ROUTES
 * ============================================
 */
router.post('/', 
  AuthMiddleware.authenticate as any,
   liveRoomController.createLiveRoom
  );
router.get('/', 
  AuthMiddleware.authenticate as any,
   liveRoomController.getLiveRooms
  );
router.get('/:roomId', 
  AuthMiddleware.authenticate as any,
   liveRoomController.getLiveRoomById
  );
router.put('/:roomId', 
  AuthMiddleware.authenticate as any,
   liveRoomController.updateLiveRoom
  );
router.delete('/:roomId', 
  AuthMiddleware.authenticate as any,
   liveRoomController.deleteLiveRoom
  );

/**
 * ============================================
 * GROUP-SPECIFIC LIVE ROOM ROUTES
 * ============================================
 */
router.get('/group/:groupId', 
  AuthMiddleware.authenticate as any,
   liveRoomController.getGroupLiveRooms
  );
router.get('/group/:groupId/active', 
  AuthMiddleware.authenticate as any,
   liveRoomController.getActiveLiveRoom
  );
router.get('/group/:groupId/stats', 
  AuthMiddleware.authenticate as any,
   liveRoomController.getLiveRoomStats
  );

/**
 * ============================================
 * PARTICIPANT MANAGEMENT ROUTES
 * ============================================
 */
router.post('/:roomId/join', 
  AuthMiddleware.authenticate as any,
   liveRoomController.joinLiveRoom
  );
router.post('/:roomId/leave', 
  AuthMiddleware.authenticate as any,
   liveRoomController.leaveLiveRoom
  );
router.post('/:roomId/end', 
  AuthMiddleware.authenticate as any,
   liveRoomController.endLiveRoom
  );
router.get('/:roomId/participants', 
  AuthMiddleware.authenticate as any,
   liveRoomController.getLiveRoomParticipants
  );

/**
 * ============================================
 * MEDIA CONTROL ROUTES
 * ============================================
 */
router.patch('/:roomId/toggle-camera', 
  AuthMiddleware.authenticate as any,
   liveRoomController.toggleCamera
  );
router.patch('/:roomId/toggle-mic', 
  AuthMiddleware.authenticate as any,
   liveRoomController.toggleMic
  );
router.patch('/:roomId/toggle-screen-share', 
  AuthMiddleware.authenticate as any,
   liveRoomController.toggleScreenShare
  );

export default router;