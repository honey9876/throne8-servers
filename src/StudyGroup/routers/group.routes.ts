      /**
       * ====================================
       * GROUP ROUTES
       * ====================================
       * API routes for group management
       */

      import { Router } from 'express';
      import groupController from '../controllers/group.controller';
      import AuthMiddleware from '@/shared/middlewares/auth.middleware';
      // import {
      //   isLeader,
      //   isNotMember,
      //   isGroupNotFull,
      //   isMember,
      // } from '../middlewares/groupAccess.middleware';

      import { isLeader, isNotMember, isGroupNotFull, isMember } from '../middleware/groupAccess.middleware';
      const router = Router();

      /**
       * IMPORTANT: Specific routes MUST come BEFORE dynamic routes
       * Order matters in Express routing!
       */

      /**
       * Public/Optional Auth Routes
       */

      // Get all groups (public, but shows more info if authenticated)
      router.get('/',
        AuthMiddleware.authenticate as any,
        groupController.getGroups
      );

      /**
       * Protected Routes (Authentication Required)
       * MUST be before dynamic :groupId routes
       */

      // Get user's groups - SPECIFIC ROUTE FIRST
      router.get('/my-groups',
        AuthMiddleware.authenticate as any, groupController.getMyGroups

      );

      // // Create a new group
      router.post('/create',
        AuthMiddleware.authenticate as any,
        groupController.createGroup
      );

      // ADD before /:groupId route
      router.get('/top-ranked',
        AuthMiddleware.authenticate as any,
        groupController.getTopRankedGroups
      );

      /**
       * Dynamic Routes with :groupId parameter
       * MUST come AFTER all specific routes
       */

      // Get group by ID (public for public groups, private for members only)
      router.get('/:groupId', AuthMiddleware.authenticate as any, groupController.getGroupById

      );

      // Get group members (public for public groups)
      router.get('/:groupId/members', AuthMiddleware.authenticate as any, groupController.getGroupMembers

      );

      // Update group (leader only)
      router.put('/:groupId',
        AuthMiddleware.authenticate as any, isLeader, groupController.updateGroup

      );

      // Delete group (leader only)
      router.delete('/:groupId',
        AuthMiddleware.authenticate as any, isLeader, groupController.deleteGroup

      );

      // Join group
      router.post(
        '/:groupId/join',

        AuthMiddleware.authenticate as any,
        isNotMember,
        isGroupNotFull,
        groupController.joinGroup
      );

      // Leave group
      router.post('/:groupId/leave',
        AuthMiddleware.authenticate as any, isMember, groupController.leaveGroup);



      export default router;
