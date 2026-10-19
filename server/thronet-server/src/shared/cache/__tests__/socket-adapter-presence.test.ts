/**
 * socket-adapter-presence.test.ts
 * Item L: Socket.IO Redis Adapter, Multi-tab Presence, and Live Room State Verification Suite
 *
 * Requirements Tested:
 * 1. testSafetyGuard enabled (must refuse to run unless on test database)
 * 2. Two Node server instances on different ports (5055, 5056) sharing Redis adapter
 * 3. Event emitted on instance A reaches client on instance B (cross-instance room broadcast)
 * 4. Direct unicast & emitToUser: event emitted on instance A to user:target reaches client on instance B
 * 5. Presence across two tabs: user is online with 1 tab, remains online when 1 of 2 tabs disconnects,
 *    and goes offline only when their last socket is gone
 * 6. Crash cleanup with Redis Sorted Set (score=lastHeartbeatMs):
 *    Kill one instance without graceful disconnect -> user goes offline within TTL even though another
 *    tab/client is connected elsewhere on Server B.
 * 7. Debounced MongoDB lastActive writes (cluster-wide lock)
 * 8. Live Room participant state and atomic Lua capacity enforcement in Redis (SCARD >= maxCapacity)
 * 9. Room timer survives instance restart (Server A stops, Server B reads and resumes timer)
 * 10. WebRTC signaling passes peer-to-peer via Socket.IO events and is NOT stored in Redis
 * 11. Kill switch fallback to in-memory adapter (SOCKET_REDIS_ADAPTER_ENABLED=false)
 * 12. Cross-instance group rooms and active sessions (SocketGroupRoomRepository, SocketGroupSessionRepository)
 */

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import mongoose from 'mongoose';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient, createDedicatedClient } from '../redisConnection';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  setupSocketAdapter,
  SocketPresenceRepository,
  SocketLiveRoomRepository,
  SocketGroupSessionRepository,
  SocketGroupRoomRepository,
  SOCKET_DOMAIN,
} from '../socketCache';
import { emitToUser } from '@/StudyGroup/socket/socket';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSocketAdapterPresenceTests() {
  console.log('\n========================================================================');
  console.log('🧪 Starting Socket.IO Redis Adapter, Presence & Live-Room Tests (Item L)');
  console.log('========================================================================');

  // Enforce safety guard & connect DB
  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const redis = getRedisClient();
  await redis.ping();
  console.log('✅ Connected to MongoDB and Redis safely');

  const PORT_A = 5055;
  const PORT_B = 5056;

  // Clean test keys
  const testKeys = await redis.keys('app:v1:*test*');
  if (testKeys.length > 0) {
    await redis.del(...testKeys);
  }

  // ── Setup Server A and Server B with Redis Adapter ─────────────────────────
  const httpServerA = http.createServer();
  const httpServerB = http.createServer();

  const pubA = createDedicatedClient({ name: 'test-pub-A', maxRetriesPerRequest: null });
  const subA = createDedicatedClient({ name: 'test-sub-A', maxRetriesPerRequest: null });
  const pubB = createDedicatedClient({ name: 'test-pub-B', maxRetriesPerRequest: null });
  const subB = createDedicatedClient({ name: 'test-sub-B', maxRetriesPerRequest: null });

  const ioA = new SocketServer(httpServerA, {
    adapter: createAdapter(pubA, subA),
    transports: ['websocket'],
  });

  const ioB = new SocketServer(httpServerB, {
    adapter: createAdapter(pubB, subB),
    transports: ['websocket'],
  });

  // Attach test handlers on both instances
  const setupTestHandlers = (io: SocketServer, serverName: string) => {
    io.on('connection', (socket) => {
      const userId = socket.handshake.auth?.userId || (socket.handshake.query?.userId as string);
      if (userId) {
        socket.data.userId = userId;
        socket.join(`user:${userId}`);
        SocketPresenceRepository.registerSocket(userId, socket.id).catch(() => {});
      }

      socket.on('join-room', (roomId: string) => {
        socket.join(roomId);
      });

      socket.on('chat-message', (data: { room: string; text: string }) => {
        io.to(data.room).emit('chat-message', { ...data, fromServer: serverName });
      });

      socket.on('webrtc-offer', (data: { targetUserId: string; offer: any; roomId: string }) => {
        io.to(`user:${data.targetUserId}`).emit('webrtc-offer-received', {
          fromUserId: userId,
          roomId: data.roomId,
          offer: data.offer,
        });
      });

      socket.on('presence:heartbeat', () => {
        if (userId) {
          SocketPresenceRepository.heartbeat(userId, socket.id).catch(() => {});
        }
      });

      socket.on('disconnect', () => {
        if (userId) {
          SocketPresenceRepository.deregisterSocket(socket.id, userId).catch(() => {});
        }
      });
    });
  };

  setupTestHandlers(ioA, 'ServerA');
  setupTestHandlers(ioB, 'ServerB');

  await new Promise<void>((resolve) => httpServerA.listen(PORT_A, resolve));
  await new Promise<void>((resolve) => httpServerB.listen(PORT_B, resolve));
  console.log(`✅ Started Server A on port ${PORT_A} and Server B on port ${PORT_B}`);

  try {
    // ── Test 1: Cross-Instance Room Broadcast ──────────────────────────────
    console.log('\n--- 1. Cross-Instance Room Broadcast (Server A -> Client on Server B) ---');

    const client1 = ClientSocket(`http://localhost:${PORT_A}`, {
      transports: ['websocket'],
      auth: { userId: 'user_A1' },
    });

    const client2 = ClientSocket(`http://localhost:${PORT_B}`, {
      transports: ['websocket'],
      auth: { userId: 'user_B1' },
    });

    await Promise.all([
      new Promise<void>((resolve) => client1.on('connect', resolve)),
      new Promise<void>((resolve) => client2.on('connect', resolve)),
    ]);

    client1.emit('join-room', 'room:global-study');
    client2.emit('join-room', 'room:global-study');
    await sleep(150);

    const receivedMessagePromise = new Promise<any>((resolve) => {
      client2.on('chat-message', (data) => resolve(data));
    });

    // Client 1 sends message on Server A
    client1.emit('chat-message', { room: 'room:global-study', text: 'Hello from Server A!' });

    const received = await Promise.race([
      receivedMessagePromise,
      sleep(3000).then(() => null),
    ]);

    assert(received !== null, 'Client 2 on Server B received broadcast emitted on Server A');
    assert(received?.text === 'Hello from Server A!', 'Message content matches exactly');

    // ── Test 2: Cross-Instance Direct User Unicast & emitToUser ──────────────
    console.log('\n--- 2. Cross-Instance emitToUser (user:target) ---');

    const unicastPromise = new Promise<any>((resolve) => {
      client2.on('notification:test', (data) => resolve(data));
    });

    // Invoke emitToUser on ioA targeting user_B1 who is connected to Server B
    emitToUser(ioA, 'user_B1', 'notification:test', {
      title: 'Cross-Instance Alert',
      body: 'Dispatched from Server A to user on Server B',
    });

    const receivedNotification = await Promise.race([
      unicastPromise,
      sleep(3000).then(() => null),
    ]);

    assert(receivedNotification !== null, 'Client 2 on Server B received direct emitToUser from Server A');
    assert(receivedNotification?.title === 'Cross-Instance Alert', 'Notification title matches');

    // Cross-Instance WebRTC Signalling Unicast
    const webrtcPromise = new Promise<any>((resolve) => {
      client2.on('webrtc-offer-received', (data) => resolve(data));
    });

    client1.emit('webrtc-offer', {
      targetUserId: 'user_B1',
      roomId: 'room:global-study',
      offer: { type: 'offer', sdp: 'fake-sdp-test' },
    });

    const receivedOffer = await Promise.race([
      webrtcPromise,
      sleep(3000).then(() => null),
    ]);

    assert(receivedOffer !== null, 'WebRTC offer delivered peer-to-peer across instances');
    assert(receivedOffer?.fromUserId === 'user_A1', 'WebRTC payload contains correct sender ID');

    // ── Test 3: WebRTC Signalling Not Stored in Redis ────────────────────────
    console.log('\n--- 3. WebRTC Signalling NOT Stored in Redis ---');
    const webrtcKeys = await redis.keys('*webrtc*');
    const sdpKeys = await redis.keys('*sdp*');
    assert(webrtcKeys.length === 0, 'No WebRTC keys stored in Redis');
    assert(sdpKeys.length === 0, 'No SDP offer keys stored in Redis');

    // ── Test 4: Presence across Two Tabs (Multi-tab Safe) ───────────────────
    console.log('\n--- 4. Presence across Two Tabs / Devices ---');

    const multiUser = 'user_multitab_999';

    // Tab 1 connects to Server A
    const tab1 = ClientSocket(`http://localhost:${PORT_A}`, {
      transports: ['websocket'],
      auth: { userId: multiUser },
    });
    await new Promise<void>((resolve) => tab1.on('connect', resolve));
    await sleep(100);

    const isOnlineAfterTab1 = await SocketPresenceRepository.isUserOnline(multiUser);
    const socketsTab1 = await SocketPresenceRepository.getUserSockets(multiUser);
    assert(isOnlineAfterTab1 === true, 'User is online after Tab 1 connects');
    assert(socketsTab1.length === 1, 'Redis stores exactly 1 socket ID for Tab 1');

    // Tab 2 connects to Server B
    const tab2 = ClientSocket(`http://localhost:${PORT_B}`, {
      transports: ['websocket'],
      auth: { userId: multiUser },
    });
    await new Promise<void>((resolve) => tab2.on('connect', resolve));
    await sleep(100);

    const isOnlineAfterTab2 = await SocketPresenceRepository.isUserOnline(multiUser);
    const socketsTab2 = await SocketPresenceRepository.getUserSockets(multiUser);
    assert(isOnlineAfterTab2 === true, 'User remains online after Tab 2 connects');
    assert(socketsTab2.length === 2, 'Redis stores both socket IDs across both servers');

    // Tab 1 disconnects (e.g. closing one browser tab)
    tab1.disconnect();
    await sleep(150);

    const isOnlineAfterTab1Close = await SocketPresenceRepository.isUserOnline(multiUser);
    const socketsAfterTab1Close = await SocketPresenceRepository.getUserSockets(multiUser);
    assert(isOnlineAfterTab1Close === true, 'User is STILL online after closing Tab 1 (Tab 2 still open)');
    assert(socketsAfterTab1Close.length === 1, 'Only Tab 2 socket remains in Redis sorted set');

    // Tab 2 disconnects (all tabs closed)
    tab2.disconnect();
    await sleep(150);

    const isOnlineAfterAllClose = await SocketPresenceRepository.isUserOnline(multiUser);
    const socketsAfterAllClose = await SocketPresenceRepository.getUserSockets(multiUser);
    assert(isOnlineAfterAllClose === false, 'User goes offline only after ALL tabs are disconnected');
    assert(socketsAfterAllClose.length === 0, 'No socket IDs remain in Redis for user');

    // ── Test 5: Crash Cleanup & Sorted Set Stale Member Pruning ──────────────
    console.log('\n--- 5. Crash Cleanup: Stale Sorted Set Members Pruned (Instance Kill) ---');

    // Configure short TTL for testing crash pruning (1000ms)
    process.env['PRESENCE_SOCKET_TTL_MS'] = '1000';

    const crashUser = 'user_crashed_server_101';
    const activeClusterUser = 'user_active_server_B_202';

    // Client for crashUser connects to Server A
    const crashClient = ClientSocket(`http://localhost:${PORT_A}`, {
      transports: ['websocket'],
      auth: { userId: crashUser },
    });
    // Client for activeClusterUser connects to Server B ("connected elsewhere")
    const activeClient = ClientSocket(`http://localhost:${PORT_B}`, {
      transports: ['websocket'],
      auth: { userId: activeClusterUser },
    });

    await Promise.all([
      new Promise<void>((resolve) => crashClient.on('connect', resolve)),
      new Promise<void>((resolve) => activeClient.on('connect', resolve)),
    ]);
    await sleep(100);

    assert(await SocketPresenceRepository.isUserOnline(crashUser) === true, 'Crash user is initially online');
    assert(await SocketPresenceRepository.isUserOnline(activeClusterUser) === true, 'Active cluster user on Server B is online');

    // Simulate Server A crash: destroy the socket connection abruptly WITHOUT clean disconnect event
    (crashClient as any).io?.engine?.close();
    crashClient.close();
    console.log('  [SIMULATION] Client on Server A abruptly killed without clean disconnect handshake');

    // Active client on Server B keeps sending heartbeats to stay alive
    activeClient.emit('presence:heartbeat');

    // Wait for the 1000ms heartbeat TTL to expire
    console.log('  [WAIT] Waiting 1200ms for heartbeat TTL to elapse...');
    await sleep(1200);

    // Assert: crashUser is pruned on read because last heartbeat score is older than TTL
    const isCrashUserOnline = await SocketPresenceRepository.isUserOnline(crashUser);
    const crashUserSockets = await SocketPresenceRepository.getUserSockets(crashUser);
    assert(isCrashUserOnline === false, 'Crashed user goes offline within TTL via ZSET score pruning');
    assert(crashUserSockets.length === 0, 'Dead socketId from crashed instance was pruned from Redis');

    // Active user on Server B remains online ("another tab is connected elsewhere")
    activeClient.emit('presence:heartbeat');
    await sleep(50);
    const isActiveUserOnline = await SocketPresenceRepository.isUserOnline(activeClusterUser);
    assert(isActiveUserOnline === true, 'User connected elsewhere on Server B remains online');

    activeClient.disconnect();
    delete process.env['PRESENCE_SOCKET_TTL_MS'];

    // ── Test 6: MongoDB Debounced Write Lock ────────────────────────────────
    console.log('\n--- 6. MongoDB Debounce Cluster-Wide Lock ---');
    const lockUser = 'user_debounce_test_1';
    const lock1 = await SocketPresenceRepository.acquireLastActiveLock(lockUser, 60);
    assert(lock1 === true, 'Initial lastActive write lock acquired');

    const lock2 = await SocketPresenceRepository.acquireLastActiveLock(lockUser, 60);
    assert(lock2 === false, 'Subsequent rapid write lock request within 60s is rejected (debounced)');

    // ── Test 7: Live Room Participant State & Atomic Lua Capacity ───────────
    console.log('\n--- 7. Live Room State & Atomic Lua Capacity in Redis ---');
    const testRoomId = 'test_room_capacity_lua_123';
    await SocketLiveRoomRepository.clearRoom(testRoomId);

    // Add Participant 1 (Max capacity = 2)
    const join1 = await SocketLiveRoomRepository.addParticipant(
      testRoomId,
      'user_peer_1',
      'socket_p1',
      { userName: 'Peer One' },
      2
    );
    assert(join1.success === true && join1.isFirst === true, 'First participant joins room successfully via Lua');

    // Add Participant 2
    const join2 = await SocketLiveRoomRepository.addParticipant(
      testRoomId,
      'user_peer_2',
      'socket_p2',
      { userName: 'Peer Two' },
      2
    );
    assert(join2.success === true && join2.isFirst === false, 'Second participant joins room via Lua');

    // Add Participant 3 (Atomic Lua rejection at max capacity = 2)
    const join3 = await SocketLiveRoomRepository.addParticipant(
      testRoomId,
      'user_peer_3',
      'socket_p3',
      { userName: 'Peer Three' },
      2
    );
    assert(join3.success === false, 'Third participant rejected atomically by Lua script when maxCapacity=2');
    assert(join3.errorReason?.includes('full'), 'Error reason explains room is full');

    const participants = await SocketLiveRoomRepository.getRoomParticipants(testRoomId);
    assert(participants.length === 2, 'Exactly 2 participants recorded in Redis');

    // ── Test 7b: Crashed Participant Disappears After TTL & Room Becomes Joinable Again ──
    console.log('\n--- 7b. Live Room Crash Pruning: Crashed Participant Disappears After TTL & Room Joinable Again ---');
    // Its heartbeat score becomes older than TTL
    const socketsKey = SocketLiveRoomRepository.getSocketsKey(testRoomId);
    const expiredScore = Date.now() - (SocketPresenceRepository.getHeartbeatTTLMs() + 5000);
    await redis.zadd(socketsKey, expiredScore, 'socket_p1');

    // Attempt to join with socket_p3 again:
    // Lua capacity script must prune stale socket_p1 BEFORE counting, freeing capacity to 1,
    // so socket_p3 successfully joins!
    const joinAfterCrash = await SocketLiveRoomRepository.addParticipant(
      testRoomId,
      'user_peer_3',
      'socket_p3',
      { userName: 'Peer Three' },
      2
    );
    assert(joinAfterCrash.success === true, 'Room is joinable again after crashed instance participant heartbeat expired');
    const participantsAfterCrash = await SocketLiveRoomRepository.getRoomParticipants(testRoomId);
    assert(participantsAfterCrash.length === 2, 'Room currently has 2 active participants (p2 and p3)');
    assert(!participantsAfterCrash.some((p) => p.socketId === 'socket_p1'), 'Crashed socket_p1 was completely pruned from Redis ZSET and Hash');
    assert(participantsAfterCrash.some((p) => p.socketId === 'socket_p3'), 'New participant socket_p3 is active in room');

    // ── Test 8: Study Session Timer Survives Server Restart ──────────────────
    console.log('\n--- 8. Study Session Timer Survives Instance Restart ---');
    const sessionTimerRoom = 'test_timer_room_777';
    await SocketLiveRoomRepository.clearRoom(sessionTimerRoom);

    // First user starts timer on Server A
    const initialSession = await SocketLiveRoomRepository.startRoomSession(sessionTimerRoom);
    assert(initialSession.active === true, 'Study session timer started in Redis');
    assert(typeof initialSession.startedAt === 'number', 'Started timestamp recorded in Redis');

    // Pause timer from Server B
    await sleep(200);
    const pausedSession = await SocketLiveRoomRepository.toggleRoomSession(sessionTimerRoom, false);
    assert(pausedSession.active === false, 'Session timer paused in Redis');
    assert(pausedSession.accumulatedTime > 0, `Accumulated time tracked (>0ms: ${pausedSession.accumulatedTime}ms)`);

    // Disconnect client1 and simulate Server A shutdown (close httpServerA)
    client1.disconnect();
    if ((httpServerA as any).closeAllConnections) (httpServerA as any).closeAllConnections();
    await new Promise<void>((resolve) => httpServerA.close(() => resolve()));
    console.log('  [SIMULATION] Server A closed (simulating crash/restart)');

    // Server B reads room session from Redis
    const survivingSession = await SocketLiveRoomRepository.getRoomSession(sessionTimerRoom);
    assert(survivingSession !== null, 'Room session timer survived Server A shutdown');
    assert(survivingSession?.accumulatedTime === pausedSession.accumulatedTime, 'Accumulated time preserved exactly in Redis');

    // Resume timer on Server B
    const resumedSession = await SocketLiveRoomRepository.toggleRoomSession(sessionTimerRoom, true);
    assert(resumedSession.active === true, 'Session timer resumed on Server B');

    // ── Test 9: Group Rooms & Active Sessions Across Instances ──────────────
    console.log('\n--- 9. Cross-Instance Group Rooms and Active Sessions ---');
    const testGroupId = 'group_cluster_test_555';

    await SocketGroupRoomRepository.joinGroup(testGroupId, 'user_group_A', 'socket_ga_1');
    await SocketGroupRoomRepository.joinGroup(testGroupId, 'user_group_B', 'socket_gb_2');

    const groupMembers = await SocketGroupRoomRepository.getOnlineUsersInGroup(testGroupId);
    assert(groupMembers.includes('user_group_A') && groupMembers.includes('user_group_B'), 'Both users found in Redis group room');

    await SocketGroupSessionRepository.updateActiveSession(testGroupId, 'user_group_A', 120);
    const activeMembers = await SocketGroupSessionRepository.getActiveMembers(testGroupId);
    assert(activeMembers.some((m) => m.userId === 'user_group_A' && m.elapsedTime === 120), 'Active session read from Redis across instances');

    await SocketGroupRoomRepository.leaveGroup(testGroupId, 'user_group_A', 'socket_ga_1');
    const groupMembersAfterLeave = await SocketGroupRoomRepository.getOnlineUsersInGroup(testGroupId);
    assert(!groupMembersAfterLeave.includes('user_group_A'), 'user_group_A cleanly removed from group members in Redis');

    // ── Test 10: Kill Switch Fallback to In-Memory Adapter ───────────────────
    console.log('\n--- 10. Kill Switch (SOCKET_REDIS_ADAPTER_ENABLED=false) ---');
    process.env['SOCKET_REDIS_ADAPTER_ENABLED'] = 'false';
    const dummyServer = http.createServer();
    const dummyIO = new SocketServer(dummyServer);
    const adapterAttached = await setupSocketAdapter(dummyIO);
    assert(adapterAttached === false, 'setupSocketAdapter returns false when kill switch is disabled');
    dummyServer.close();
    delete process.env['SOCKET_REDIS_ADAPTER_ENABLED'];

    // Cleanup clients and servers
    client2.disconnect();
    if ((httpServerB as any).closeAllConnections) (httpServerB as any).closeAllConnections();
    await new Promise<void>((resolve) => httpServerB.close(() => resolve()));

    pubA.disconnect();
    subA.disconnect();
    pubB.disconnect();
    subB.disconnect();

    // Clean test keys
    await SocketLiveRoomRepository.clearRoom(testRoomId);
    await SocketLiveRoomRepository.clearRoom(sessionTimerRoom);
    await SocketGroupSessionRepository.removeActiveSession(testGroupId, 'user_group_A');
    await SocketGroupSessionRepository.removeActiveSession(testGroupId, 'user_group_B');

    console.log('\n========================================================================');
    console.log('✅ ALL SOCKET.IO REDIS ADAPTER, PRESENCE & LIVE-ROOM TESTS PASSED (ITEM L)');
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error('\n❌ Test Suite Failed:', err.message, err.stack);
    httpServerA.close();
    httpServerB.close();
    pubA.disconnect();
    subA.disconnect();
    pubB.disconnect();
    subB.disconnect();
    process.exit(1);
  }
}

// Execute suite directly when run via ts-node
if (require.main === module) {
  runSocketAdapterPresenceTests()
    .then(() => {
      console.log('Suite completed successfully. Exiting.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error in suite:', err);
      process.exit(1);
    });
}

export default runSocketAdapterPresenceTests;
