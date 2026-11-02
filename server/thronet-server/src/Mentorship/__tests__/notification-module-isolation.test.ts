/**
 * notification-module-isolation.test.ts
 * 
 * Regression Test Suite for Senior Mentor vs Regular Industry Mentor Notification Module Isolation
 * 
 * Verifies all 10 core regression requirements:
 * 1. A Senior Mentor booking creates notification records with module: 'senior-mentor'.
 * 2. The Senior Mentor notification API returns those notifications.
 * 3. The regular Mentor API does not return them.
 * 4. The regular Mentor unread count does not include them.
 * 5. Marking Senior Mentor notifications as read does not modify Industry Mentor notifications.
 * 6. Socket events for Senior Mentor bookings carry correct module and are not delivered to regular Mentor stream.
 * 7. A regular Industry Mentor booking continues to work correctly.
 * 8. Missing or invalid module values are handled safely (400 Bad Request returned).
 * 9. Existing authorization and recipient isolation remain intact.
 * 10. One booking does not create unintended duplicate notifications.
 */

process.env['NODE_ENV'] = 'test';
process.env['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['MONGODB_TEST_URI'] = 'mongodb://127.0.0.1:27017/thronet_test';
process.env['REDIS_CLUSTER_MODE'] = 'false';
process.env['REDIS_HOST'] = '127.0.0.1';
process.env['DISABLE_CACHE'] = 'true';

import mongoose from 'mongoose';
import { Notification } from '../models';
import notificationRepository from '../repositories/notification.repository';
import notificationController from '../controllers/notification.controller';
import seniorNotificationService from '../services/seniorNotification.service';
import notificationService, { NotificationType, NotificationChannel } from '../services/notification.service';
import { emitNotificationCount } from '@/socket/handlers/notificationHandler';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  ❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ [PASS] ${message}`);
}

// Mock express response object
function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

export async function runNotificationIsolationTests() {
  console.log('\n===============================================================');
  console.log('🧪 Starting Notification Module Isolation Regression Suite');
  console.log('===============================================================\n');

  const mongoUri = 'mongodb://127.0.0.1:27017/thronet_test';
  
  // Connect to MongoDB
  if (mongoose.connection.readyState === 0) {
    console.log(`Connecting to local test MongoDB at: ${mongoUri}...`);
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  }

  // Generate unique test IDs
  const runId = Date.now();
  const seniorMentorUserId = `test_sr_mentor_${runId}`;
  const regularMentorUserId = `test_reg_mentor_${runId}`;
  const menteeUserId = `test_mentee_${runId}`;
  const otherUserId = `test_other_user_${runId}`;

  try {
    // Clean up any leftovers
    await Notification.deleteMany({
      userId: { $in: [seniorMentorUserId, regularMentorUserId, menteeUserId, otherUserId] }
    });

    console.log('\n--- 1. Testing Senior Mentor Booking Notification Creation ---');
    // Simulate booking a senior session
    const mockSeniorSession: any = {
      sessionId: `sr_session_${runId}`,
      mentorId: seniorMentorUserId,
      title: 'Senior Executive Mentorship 101',
      scheduledAt: new Date(),
    };
    const mockSeniorBooking: any = {
      _id: new mongoose.Types.ObjectId(),
      menteeId: menteeUserId,
      bookedBy: menteeUserId,
      status: 'pending',
      slotTime: '10:00 AM - 11:00 AM',
      scheduledAt: new Date(),
    };

    await seniorNotificationService.notifyBookingCreated(mockSeniorSession, mockSeniorBooking);

    // Verify DB records
    const srMentorNotifs = await Notification.find({ userId: seniorMentorUserId });
    const menteeNotifs = await Notification.find({ userId: menteeUserId });

    assert(srMentorNotifs.length === 1, 'Senior Mentor received exactly 1 notification record');
    assert(srMentorNotifs[0].module === 'senior-mentor', 'Senior Mentor notification has module === "senior-mentor"');
    assert(srMentorNotifs[0].title === 'New Booking Request', 'Senior Mentor notification title is "New Booking Request"');

    assert(menteeNotifs.length === 1, 'Mentee received exactly 1 notification record');
    assert(menteeNotifs[0].module === 'senior-mentor', 'Mentee notification has module === "senior-mentor"');
    assert(menteeNotifs[0].title === 'Booking Request Submitted', 'Mentee notification title is "Booking Request Submitted"');

    console.log('\n--- 2. Testing Senior Mentor Notification API (GET /mentorship/notifications?module=senior-mentor) ---');
    const reqSrMentor: any = {
      user: { id: seniorMentorUserId },
      query: { module: 'senior-mentor', page: 1, limit: 10 },
    };
    const resSrMentor = createMockRes();
    await notificationController.getUserNotifications(reqSrMentor, resSrMentor);

    assert(resSrMentor.statusCode === 200, 'Senior Mentor API returned 200 OK');
    const srList = resSrMentor.body?.data || [];
    assert(srList.length === 1, 'Senior Mentor API returned exactly the 1 senior notification');
    assert(srList[0].module === 'senior-mentor', 'Returned notification has module === "senior-mentor"');

    console.log('\n--- 3. Testing Regular Mentor Notification API does NOT return Senior Mentor notifications ---');
    const reqRegApiForSrUser: any = {
      user: { id: seniorMentorUserId },
      query: { module: 'industry-mentor', page: 1, limit: 10 },
    };
    const resRegApiForSrUser = createMockRes();
    await notificationController.getUserNotifications(reqRegApiForSrUser, resRegApiForSrUser);

    assert(resRegApiForSrUser.statusCode === 200, 'Regular Mentor API query returned 200 OK');
    const regList = resRegApiForSrUser.body?.data || [];
    assert(regList.length === 0, 'Regular Mentor API returned 0 notifications for Senior Mentor booking (Zero Leakage)');

    console.log('\n--- 4. Testing Unread Count Isolation ---');
    // Senior unread count for senior mentor user
    const reqSrCount: any = { user: { id: seniorMentorUserId }, query: { module: 'senior-mentor' } };
    const resSrCount = createMockRes();
    await notificationController.getUnreadCount(reqSrCount, resSrCount);
    assert(resSrCount.body?.data?.count === 1, 'Senior unread count is 1');

    // Industry unread count for senior mentor user
    const reqRegCount: any = { user: { id: seniorMentorUserId }, query: { module: 'industry-mentor' } };
    const resRegCount = createMockRes();
    await notificationController.getUnreadCount(reqRegCount, resRegCount);
    assert(resRegCount.body?.data?.count === 0, 'Industry mentor unread count is 0 (does not include Senior notifications)');

    console.log('\n--- 5. Testing Mark-as-read & Mark-all-as-read Module Isolation ---');
    // Add an Industry Mentor notification for seniorMentorUserId to test cross-module isolation
    await notificationService.sendNotification({
      userId: seniorMentorUserId,
      type: NotificationType.BOOKING_CONFIRMED,
      channels: [NotificationChannel.IN_APP],
      module: 'industry-mentor',
      data: {
        title: 'Regular Industry Session Booked',
        message: 'Your regular session is booked.',
      },
    });

    // Verify both exist before mark-all-read
    const preSrCount = await notificationRepository.countByUserId(seniorMentorUserId, true, 'senior-mentor');
    const preRegCount = await notificationRepository.countByUserId(seniorMentorUserId, true, 'industry-mentor');
    assert(preSrCount === 1, 'Senior mentor unread count is 1 before read operation');
    assert(preRegCount === 1, 'Industry mentor unread count is 1 before read operation');

    // Mark ALL Senior Mentor notifications as read
    const reqMarkAllSr: any = { user: { id: seniorMentorUserId }, query: { module: 'senior-mentor' } };
    const resMarkAllSr = createMockRes();
    await notificationController.markAllAsRead(reqMarkAllSr, resMarkAllSr);
    assert(resMarkAllSr.body?.data?.modifiedCount === 1, 'Mark all read modified exactly 1 senior notification');

    // Verify: Senior is now 0 unread, Industry is STILL 1 unread!
    const postSrCount = await notificationRepository.countByUserId(seniorMentorUserId, true, 'senior-mentor');
    const postRegCount = await notificationRepository.countByUserId(seniorMentorUserId, true, 'industry-mentor');
    assert(postSrCount === 0, 'Senior mentor unread count is now 0');
    assert(postRegCount === 1, 'Industry mentor notification was UNTOUCHED (remains 1 unread)');

    // Attempting to mark Senior notification using module: 'industry-mentor' must fail (not found)
    const srNotifId = srMentorNotifs[0].notificationId;
    const reqMarkSingleWrongModule: any = {
      params: { id: srNotifId },
      user: { id: seniorMentorUserId },
      query: { module: 'industry-mentor' },
    };
    const resMarkSingleWrongModule = createMockRes();
    await notificationController.markAsRead(reqMarkSingleWrongModule, resMarkSingleWrongModule);
    assert(resMarkSingleWrongModule.statusCode === 404, 'Marking Senior notification with module: industry-mentor returned 404 (Isolation intact)');

    console.log('\n--- 6. Testing Socket.IO Notification Delivery Isolation ---');
    // Mock Socket.IO server and room tracker
    const emittedToRooms: Record<string, { event: string; payload: any }[]> = {};
    const mockIo: any = {
      to(room: string) {
        return {
          emit(event: string, payload: any) {
            if (!emittedToRooms[room]) emittedToRooms[room] = [];
            emittedToRooms[room].push({ event, payload });
          },
        };
      },
    };

    emitNotificationCount(mockIo, seniorMentorUserId, 5, 'senior-mentor');
    assert(
      emittedToRooms[`user:${seniorMentorUserId}:senior-mentor`]?.length === 1,
      'Socket event was emitted strictly to room user:seniorMentorUserId:senior-mentor'
    );
    assert(
      !emittedToRooms[`user:${seniorMentorUserId}:industry-mentor`],
      'Socket event was NOT emitted to room user:seniorMentorUserId:industry-mentor'
    );
    assert(
      emittedToRooms[`user:${seniorMentorUserId}:senior-mentor`][0].payload.module === 'senior-mentor',
      'Socket event payload carries module: senior-mentor'
    );

    console.log('\n--- 7. Testing Regular Industry Mentor Booking Flow ---');
    await notificationService.sendNotification({
      userId: regularMentorUserId,
      type: NotificationType.NEW_BOOKING_REQUEST,
      channels: [NotificationChannel.IN_APP],
      module: 'industry-mentor',
      data: {
        title: 'New Regular Booking Request',
        message: 'A mentee booked an industry session with you.',
      },
    });

    const regMentorNotifs = await Notification.find({ userId: regularMentorUserId });
    assert(regMentorNotifs.length === 1, 'Regular Mentor received 1 notification');
    assert(regMentorNotifs[0].module === 'industry-mentor', 'Notification has module === "industry-mentor"');

    // Query with regular mentor API
    const reqRegMentor: any = { user: { id: regularMentorUserId }, query: { module: 'industry-mentor' } };
    const resRegMentor = createMockRes();
    await notificationController.getUserNotifications(reqRegMentor, resRegMentor);
    assert(resRegMentor.body?.data?.length === 1, 'Regular Mentor API returned the notification');

    // Query with senior mentor API
    const reqSrQueryForRegMentor: any = { user: { id: regularMentorUserId }, query: { module: 'senior-mentor' } };
    const resSrQueryForRegMentor = createMockRes();
    await notificationController.getUserNotifications(reqSrQueryForRegMentor, resSrQueryForRegMentor);
    assert(resSrQueryForRegMentor.body?.data?.length === 0, 'Senior Mentor API returns 0 notifications for Regular Mentor (Zero Leakage)');

    console.log('\n--- 8. Testing Missing or Invalid Module Handling ---');
    // Missing module
    const reqMissingModule: any = { user: { id: seniorMentorUserId }, query: {} };
    const resMissingModule = createMockRes();
    await notificationController.getUserNotifications(reqMissingModule, resMissingModule);
    assert(resMissingModule.statusCode === 400, 'Missing module parameter returns 400 Bad Request (No cross-module leakage)');

    // Invalid module
    const reqInvalidModule: any = { user: { id: seniorMentorUserId }, query: { module: 'malicious-module' } };
    const resInvalidModule = createMockRes();
    await notificationController.getUserNotifications(reqInvalidModule, resInvalidModule);
    assert(resInvalidModule.statusCode === 400, 'Invalid module parameter returns 400 Bad Request');

    // Missing module in unread count
    const reqMissingModuleCount: any = { user: { id: seniorMentorUserId }, query: {} };
    const resMissingModuleCount = createMockRes();
    await notificationController.getUnreadCount(reqMissingModuleCount, resMissingModuleCount);
    assert(resMissingModuleCount.statusCode === 400, 'Missing module in unread-count returns 400 Bad Request');

    console.log('\n--- 9. Testing Authorization & Recipient Isolation ---');
    // User otherUserId attempts to read seniorMentorUserId's notification
    const reqOtherUserRead: any = {
      params: { id: srNotifId },
      user: { id: otherUserId },
      query: { module: 'senior-mentor' },
    };
    const resOtherUserRead = createMockRes();
    await notificationController.getNotificationById(reqOtherUserRead, resOtherUserRead);
    assert(resOtherUserRead.statusCode === 404, 'User cannot read notifications belonging to another user (404 Not Found)');

    // User otherUserId attempts to mark seniorMentorUserId's notification as read
    const resOtherUserMarkRead = createMockRes();
    await notificationController.markAsRead(reqOtherUserRead, resOtherUserMarkRead);
    assert(resOtherUserMarkRead.statusCode === 404, 'User cannot mark read notifications belonging to another user');

    console.log('\n--- 10. Testing Duplicate Notification Prevention ---');
    // Count total notifications created across the test run for senior booking
    const totalSrMentorNotifs = await Notification.countDocuments({
      userId: seniorMentorUserId,
      module: 'senior-mentor',
    });
    const totalMenteeSrNotifs = await Notification.countDocuments({
      userId: menteeUserId,
      module: 'senior-mentor',
    });
    assert(totalSrMentorNotifs === 1, 'Senior Mentor has exactly 1 notification from the single booking');
    assert(totalMenteeSrNotifs === 1, 'Mentee has exactly 1 notification from the single booking');

    console.log('\n===============================================================');
    console.log('🎉 ALL 10 NOTIFICATION MODULE ISOLATION TESTS PASSED SUCCESSFULLY!');
    console.log('===============================================================\n');
  } finally {
    // Cleanup test records
    await Notification.deleteMany({
      userId: { $in: [seniorMentorUserId, regularMentorUserId, menteeUserId, otherUserId] },
    });
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runNotificationIsolationTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Test Suite Failed:', err);
      process.exit(1);
    });
}
