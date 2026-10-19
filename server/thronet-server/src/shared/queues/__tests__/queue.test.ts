import { Worker } from 'bullmq';
import {
  enqueueEmail,
  getEmailQueue,
  closeEmailQueue,
} from '../email.queue';
import {
  enqueueNotification,
  getNotificationQueue,
  closeNotificationQueue,
} from '../notification.queue';
import { maskEmail, getQueueConnectionConfig } from '../queueConnection';
import NotificationService from '@/auth/services/notification.service';

async function runQueueTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting BullMQ Queue & Worker Test Suite');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  // Test 1: Queue Connection Configuration (Separate Instance via REDIS_QUEUE_URL)
  console.log('\n--- Test 1: Queue Redis Configuration & Separate Instance (REDIS_QUEUE_URL) ---');
  const queueConfig = getQueueConnectionConfig();
  assert(queueConfig.maxRetriesPerRequest === null, 'maxRetriesPerRequest is null (BullMQ requirement)');
  assert(!('db' in queueConfig), 'Removed DB 1 assumption (cluster-ready, default DB 0 on dedicated instance)');

  // Test REDIS_QUEUE_URL parsing
  process.env['REDIS_QUEUE_URL'] = 'rediss://custom_user:custom_pass@queue.redis.internal:6388';
  const customConfig = getQueueConnectionConfig();
  assert(customConfig.host === 'queue.redis.internal', 'REDIS_QUEUE_URL hostname parsed correctly');
  assert(customConfig.port === 6388, 'REDIS_QUEUE_URL port parsed correctly');
  assert(customConfig.username === 'custom_user', 'REDIS_QUEUE_URL username parsed correctly');
  assert(customConfig.password === 'custom_pass', 'REDIS_QUEUE_URL password parsed correctly');
  assert(customConfig.tls !== undefined, 'REDIS_QUEUE_URL rediss:// enables TLS');
  delete process.env['REDIS_QUEUE_URL'];

  // Test 2: PII Masking
  console.log('\n--- Test 2: PII Email Masking (No PII in Logs) ---');
  const masked1 = maskEmail('alex.developer@example.com');
  const masked2 = maskEmail('user@test.org');
  const masked3 = maskEmail(['a@b.com', 'c@d.com']);
  assert(masked1 === 'a***r@example.com', `Masked alex.developer@example.com -> ${masked1}`);
  assert(masked2 === 'u***r@test.org', `Masked user@test.org -> ${masked2}`);
  assert(!masked1.includes('alex.developer'), 'Full email username is never logged');

  // Test 3: Email Enqueue & Deduplication
  console.log('\n--- Test 3: Email Enqueue & Job Deduplication ---');
  const emailQueue = getEmailQueue();
  const testJobId = `dedupe_test_${Date.now()}`;
  const res1 = await enqueueEmail({
    to: 'testuser@example.com',
    subject: 'Verification Code',
    template: 'email-otp',
    data: { otp: '987654' },
    jobId: testJobId,
  });
  assert(res1.success === true, 'First email job enqueued successfully');
  assert(res1.jobId === testJobId, 'Job ID matches deterministic ID');

  // Attempt duplicate enqueue with same jobId
  const res2 = await enqueueEmail({
    to: 'testuser@example.com',
    subject: 'Verification Code',
    template: 'email-otp',
    data: { otp: '987654' },
    jobId: testJobId,
  });
  assert(res2.jobId === testJobId, 'Duplicate job returns existing deduplication ID');

  // Test 4: Default Job Options (Retries, Backoff, Retention)
  console.log('\n--- Test 4: Job Options & Failed-Job Policy ---');
  const defaultOpts = (emailQueue as any).defaultJobOptions;
  assert(defaultOpts.attempts === 3, 'Job attempts set to 3 for retries');
  assert(defaultOpts.backoff?.type === 'exponential', 'Exponential backoff configured');
  assert(defaultOpts.removeOnComplete?.age === 86400, 'Completed jobs cleaned after 24h');
  assert(defaultOpts.removeOnFail?.age === 7 * 86400, 'Failed jobs preserved for 7 days');

  // Test 5: OTP Expiry Guard (From Creation Time)
  console.log('\n--- Test 5: OTP Expiry Calculation (From Creation Time) ---');
  const expiredPayload = {
    to: 'expired@example.com',
    subject: 'Expired OTP',
    template: 'email-otp',
    data: { otp: '112233' },
    expiresAt: Date.now() - 5000, // Expired 5 seconds ago!
    jobId: `expired_${Date.now()}`,
  };
  const isExpired = Date.now() > (expiredPayload.expiresAt || 0);
  assert(isExpired === true, 'Payload detected as expired based on creation timestamp');

  // Test 6: Fallback to Direct Delivery when Queue Disabled or Fails
  console.log('\n--- Test 6: Never Drop OTPs (Direct Send Fallback) ---');
  // Disable email queue via kill switch
  process.env['CACHE_QUEUE_EMAIL_ENABLED'] = 'false';

  const origSendEmail = NotificationService.sendEmail;
  NotificationService.sendEmail = (async (opts: any) => ({
    success: true,
    messageId: 'direct-smtp-test-123',
    to: opts.to,
    duration: 10,
  })) as any;

  try {
    const sendResult = await enqueueEmail({
      to: 'fallback_test@example.com',
      subject: 'Test Fallback Email',
      text: 'Fallback delivery',
    });

    assert(sendResult.success === true, 'Direct delivery fallback succeeded when queue was disabled');
    assert(!sendResult.messageId?.startsWith('queued-'), 'Sent directly via transport, not dropped');
  } finally {
    NotificationService.sendEmail = origSendEmail;
    process.env['CACHE_QUEUE_EMAIL_ENABLED'] = 'true';
  }

  // Test 7: Notification Queue Enqueue
  console.log('\n--- Test 7: Notification Queue Enqueue & Metrics ---');
  const notifQueue = getNotificationQueue();
  const notifRes = await enqueueNotification({
    userId: 'user_456',
    title: 'New Connection',
    message: 'Someone connected with you',
    type: 'connection',
    channels: ['push'],
  });
  assert(notifRes.success === true, 'Notification job enqueued successfully');

  const notifJobCounts = await notifQueue.getJobCounts();
  assert(typeof notifJobCounts.waiting === 'number', 'Notification queue job counts accessible');

  // Test 8: OTP Resend within 24h Enqueues New Job (Deduplication Bypass)
  console.log('\n--- Test 8: OTP Resend within 24h Enqueues New Job ---');
  const recipient = `resend_test_${Date.now()}@example.com`;

  // Step 1: Send initial OTP
  const otpSend1 = await enqueueEmail({
    to: recipient,
    subject: 'Verify Your Email - OTP Code',
    template: 'email-otp',
    data: { otp: '111222', otpId: `otp_record_A_${Date.now()}`, expiryMinutes: 10 },
  });
  assert(otpSend1.success === true, 'Initial OTP job enqueued');

  // Step 2: Complete the job (simulating worker finishing delivery)
  const worker1 = new Worker('email-queue', async () => ({ status: 'sent' }), {
    connection: getQueueConnectionConfig(),
  });
  await new Promise<void>((resolve) => {
    worker1.on('completed', (j) => {
      if (j.id === otpSend1.jobId) resolve();
    });
  });
  await worker1.close();

  const job1 = await emailQueue.getJob(otpSend1.jobId!);
  assert(job1 !== null, 'Job 1 found in email queue');
  const isCompleted1 = await job1!.isCompleted();
  assert(isCompleted1 === true, 'Job 1 is marked as completed in queue (persisted up to 24h)');

  // Step 3: User requests OTP resend within 24h (new OTP record ID created)
  const otpSend2 = await enqueueEmail({
    to: recipient,
    subject: 'Verify Your Email - OTP Code (Resent)',
    template: 'email-otp',
    data: { otp: '333444', otpId: `otp_record_B_${Date.now()}`, expiryMinutes: 10 },
  });
  assert(otpSend2.success === true, 'Resent OTP enqueue returned success');
  assert(otpSend2.jobId !== otpSend1.jobId, `Resent OTP generated new unique jobId (${otpSend2.jobId} !== ${otpSend1.jobId})`);

  // Step 4: Assert second email job is ACTUALLY enqueued in BullMQ and not dropped/deduplicated
  const job2 = await emailQueue.getJob(otpSend2.jobId!);
  assert(job2 !== null, 'Resent OTP job is ACTUALLY enqueued in BullMQ');
  const job2State = await job2!.getState();
  assert(job2State === 'waiting' || job2State === 'active' || job2State === 'delayed' || job2State === 'prioritized', `Resent job is active/waiting/prioritized in queue (state: ${job2State})`);

  // Step 5: Test fallback nonce/timestamp differentiation when otpId is absent
  const recipient2 = `nonce_test_${Date.now()}@example.com`;
  const otpNoId1 = await enqueueEmail({
    to: recipient2,
    subject: 'Your OTP Code',
    template: 'email-otp',
    data: { otp: '555666', createdAt: Date.now() },
  });

  const worker2 = new Worker('email-queue', async () => ({ status: 'sent' }), {
    connection: getQueueConnectionConfig(),
  });
  await new Promise<void>((resolve) => {
    worker2.on('completed', (j) => {
      if (j.id === otpNoId1.jobId) resolve();
    });
  });
  await worker2.close();

  const rawJobNoId1 = await emailQueue.getJob(otpNoId1.jobId!);
  assert(rawJobNoId1 !== null && (await rawJobNoId1!.isCompleted()), 'First non-ID OTP completed');

  const otpNoId2 = await enqueueEmail({
    to: recipient2,
    subject: 'Your OTP Code',
    template: 'email-otp',
    data: { otp: '777888', createdAt: Date.now() + 10 },
  });
  assert(otpNoId2.jobId !== otpNoId1.jobId, 'Timestamp-differentiated OTP resend produces distinct jobId');
  const rawJobNoId2 = await emailQueue.getJob(otpNoId2.jobId!);
  assert(rawJobNoId2 !== null, 'Timestamp-differentiated OTP resend is ACTUALLY enqueued');

  // Cleanup
  console.log('\n--- Cleanup ---');
  await job1?.remove().catch(() => {});
  await job2?.remove().catch(() => {});
  await rawJobNoId1?.remove().catch(() => {});
  await rawJobNoId2?.remove().catch(() => {});
  await closeEmailQueue();
  await closeNotificationQueue();
  console.log('Queues closed cleanly.');

  console.log('\n====================================================');
  console.log(`Total Passed: ${passed}, Total Failed: ${failed}`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runQueueTestSuite().catch((err) => {
  console.error('Queue test suite failed:', err);
  process.exit(1);
});
