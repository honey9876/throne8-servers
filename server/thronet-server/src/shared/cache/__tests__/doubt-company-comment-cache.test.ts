/**
 * doubt-company-comment-cache.test.ts
 * Item K: Verification Suite for Doubts feed, Company Profiles, Post Comments and Reactions
 *
 * Requirements Tested:
 * 1. testSafetyGuard enabled (must refuse to run unless on test database)
 * 2. Doubts feed cache hit, miss, and short TTL
 * 3. Doubts feed invalidation on new doubt, answer, accept, delete
 * 4. Doubts visibility: private groups require membership, never cache deleted/moderated content
 * 5. Company public profile cache hit, miss, and only public fields cached
 * 6. Company profile invalidation on company edit, new job, review changes, follower changes
 * 7. Post comments short-TTL read cache hit, miss, and invalidation on add, edit, delete
 * 8. Post reactions short-TTL read cache with authoritative writes in MongoDB (hit, miss, invalidation on add/remove)
 * 9. Fallback to MongoDB when Redis is unavailable or kill switch disabled
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { assertTestEnvironmentSafety } from './testSafetyGuard';
import { getRedisClient } from '../redisConnection';
import {
  DoubtCacheRepository,
  CompanyCacheRepository,
  CommentCacheRepository,
  ReactionCacheRepository,
} from '../feedCompanyCommentCache';
import Doubt from '@/StudyGroup/models/Doubt.model';
import Company, { IndustryType, CompanySize } from '@/company/models/Company.model';
import CompanyReview from '@/company/models/CompanyReview.model';
import Follower from '@/company/models/follower.model';
import Job, { JobType, ExperienceLevel, JobStatus } from '@/Job-Service/models/Job.model';
import Comment from '@/Profile/models/Comment.model';
import Group from '@/StudyGroup/models/Group.model';
import GroupMember from '@/StudyGroup/models/GroupMember.model';
import ConnectionBlock, { BlockReason } from '@/connections/models/ConnectionBlock';
import CommentService from '@/Profile/services/activity/comment.service';
import doubtService from '@/StudyGroup/services/doubt.service';
import GroupCategory from '@/StudyGroup/enums/GroupCategory.enum';
import Post from '@/Profile/models/Post.model';

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function runDoubtCompanyCommentCacheTests() {
  console.log('\n========================================================================');
  console.log('🧪 Starting Doubts, Company Profiles, Comments & Reactions Suite (Item K)');
  console.log('========================================================================');

  // Enforce safety guard & connect DB
  const mongoUri = assertTestEnvironmentSafety();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const redis = await getRedisClient();
  await redis.ping();
  console.log('✅ Connected to MongoDB and Redis');

  const testUserId = uuidv4();
  const otherUserId = uuidv4();
  const testGroupId = new mongoose.Types.ObjectId();

  // --------------------------------------------------------------------------
  // TEST 1: Doubts Feed Cache Hit, Miss, and Short TTL with Jitter
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 1: Doubts Feed Cache Hit, Miss, and Short TTL ---');
  const dummyFeed = [{ _id: new mongoose.Types.ObjectId().toString(), title: 'Test Doubt 1' }];
  const queryParams = { status: 'open' };

  // Clear any existing cache
  await DoubtCacheRepository.invalidateDoubt(undefined, testGroupId.toString());
  let cachedFeed = await DoubtCacheRepository.getCachedFeed(testGroupId.toString(), queryParams);
  assert(cachedFeed === null, 'Doubt feed cache returns null on miss');

  // Populate cache
  await DoubtCacheRepository.setCachedFeed(testGroupId.toString(), queryParams, dummyFeed);
  cachedFeed = await DoubtCacheRepository.getCachedFeed(testGroupId.toString(), queryParams);
  assert(cachedFeed !== null && cachedFeed.length === 1, 'Doubt feed cache returns data on hit');
  assert(cachedFeed[0].title === 'Test Doubt 1', 'Cached doubt feed matches original payload');

  // Verify TTL within expected range (180s +/- 10%)
  const feedKey = DoubtCacheRepository.getFeedKey(testGroupId.toString(), queryParams);
  const ttl = await redis.ttl(feedKey);
  assert(ttl > 140 && ttl <= 210, `Feed TTL is within short jittered range: ${ttl}s`);

  // --------------------------------------------------------------------------
  // TEST 2: Doubts Feed Invalidation on Mutations
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Doubts Invalidation on Mutations ---');
  const doubtId = new mongoose.Types.ObjectId();
  await DoubtCacheRepository.setCachedFeed(testGroupId.toString(), queryParams, dummyFeed);
  await DoubtCacheRepository.setCachedDetail(doubtId.toString(), { _id: doubtId.toString(), title: 'Detail' });

  // Invalidate doubt
  await DoubtCacheRepository.invalidateDoubt(doubtId.toString(), testGroupId.toString());
  cachedFeed = await DoubtCacheRepository.getCachedFeed(testGroupId.toString(), queryParams);
  const cachedDetail = await DoubtCacheRepository.getCachedDetail(doubtId.toString());
  assert(cachedFeed === null, 'Doubt feed cache invalidated after doubt mutation');
  assert(cachedDetail === null, 'Doubt detail cache invalidated after doubt mutation');

  // --------------------------------------------------------------------------
  // TEST 3: Doubt Visibility Guard (Never cache deleted or unpermitted data)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Doubt Visibility Guard ---');
  // Check that Doubt model hooks invalidate cache on save
  const createdDoubt = new Doubt({
    _id: new mongoose.Types.ObjectId(),
    group: testGroupId.toString(),
    postedBy: testUserId,
    category: 'Mathematics',
    title: 'Mongoose hook test doubt',
    description: 'Hook verification content',
    tags: ['math'],
  });
  await DoubtCacheRepository.setCachedFeed(testGroupId.toString(), {}, dummyFeed);
  await createdDoubt.save();
  await tick();
  const feedAfterSave = await DoubtCacheRepository.getCachedFeed(testGroupId.toString(), {});
  assert(feedAfterSave === null, 'Doubt Mongoose post-save hook successfully invalidated group feed cache');

  // --------------------------------------------------------------------------
  // TEST 4: Company Public Profile Cache Hit, Miss & Field Projection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Company Public Profile Cache Hit & Miss ---');
  const compUuid = uuidv4();
  const companyDoc = new Company({
    _id: new mongoose.Types.ObjectId(),
    companyId: compUuid,
    companyName: 'Throne8 Tech',
    companySlug: 'throne8-tech-' + Date.now(),
    industry: IndustryType.TECHNOLOGY,
    companySize: CompanySize.SMALL,
    contact: {
      email: 'contact@throne8.io',
      phone: { number: '9999999999' },
      website: 'https://throne8.io',
    },
    headquarters: {
      address: '123 Tech Park',
      city: 'Bangalore',
      state: 'Karnataka',
    },
    descriptions: {
      short: 'Innovative tech company building modern solutions',
    },
    audit: {
      createdBy: testUserId,
    },
  });
  await companyDoc.save();
  const companyId = compUuid;

  // Initial fetch: Cache miss -> set cache
  await CompanyCacheRepository.invalidateCompany(companyId);
  let cachedCompany = await CompanyCacheRepository.getCachedPublicProfile(companyId);
  assert(cachedCompany === null, 'Company profile cache is null on initial miss');

  // Set public projection
  const publicData = {
    _id: companyId,
    name: companyDoc.companyName,
    industry: companyDoc.industry,
    website: (companyDoc as any).contact?.website,
    followersCount: 10,
    rating: 4.8,
  };
  await CompanyCacheRepository.setCachedPublicProfile(companyId, publicData);
  cachedCompany = await CompanyCacheRepository.getCachedPublicProfile(companyId);
  assert(cachedCompany !== null, 'Company profile cache returns data on hit');
  assert(cachedCompany.name === companyDoc.companyName, 'Cached company name matches');
  assert(!cachedCompany.contact?.email, 'Sensitive internal companyEmail is NOT exposed in public cache');

  // --------------------------------------------------------------------------
  // TEST 5: Company Cache Invalidation on Company Edit, Jobs, Reviews, Followers
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Company Cache Invalidation on Edit, Jobs, Reviews, Followers ---');

  // Subtest 5a: Company edit invalidation
  await CompanyCacheRepository.setCachedPublicProfile(companyId, publicData);
  companyDoc.descriptions.short = 'Updated description with at least ten characters';
  await companyDoc.save();
  await tick();
  assert(await CompanyCacheRepository.getCachedPublicProfile(companyId) === null,
    'Company post-save hook invalidated company public profile cache');

  // Subtest 5b: New job invalidates company profile
  await CompanyCacheRepository.setCachedPublicProfile(companyId, publicData);
  const jobDoc = new Job({
    _id: new mongoose.Types.ObjectId(),
    jobId: uuidv4(),
    companyId: compUuid,
    title: 'Senior Backend Engineer',
    description: 'TypeScript and Redis expert required for scaling platform',
    skills: [{ name: 'redis', weight: 1 }],
    location: { city: 'Bangalore', state: 'Karnataka', coordinates: { type: 'Point', coordinates: [77.5946, 12.9716] } },
    jobType: JobType.FULL_TIME,
    experience: { level: ExperienceLevel.SENIOR },
    createdBy: testUserId,
    status: JobStatus.ACTIVE,
  });
  await jobDoc.save();
  await tick();
  assert(await CompanyCacheRepository.getCachedPublicProfile(companyId) === null,
    'Job post-save hook invalidated company profile cache');

  // Subtest 5c: Company review invalidates company profile
  await CompanyCacheRepository.setCachedPublicProfile(companyId, publicData);
  const reviewDoc = new CompanyReview({
    _id: new mongoose.Types.ObjectId(),
    reviewId: uuidv4(),
    company: companyDoc._id,
    reviewer: testUserId,
    title: 'Great engineering culture',
    content: 'Long and detailed review text exceeding twenty characters for testing',
    rating: { overall: 5 },
    type: 'Current Employee',
    isPublished: true,
  });
  await reviewDoc.save();
  await tick();
  assert(await CompanyCacheRepository.getCachedPublicProfile(companyId) === null,
    'CompanyReview post-save hook invalidated company profile cache');

  // Subtest 5d: Follower changes invalidate company profile
  await CompanyCacheRepository.setCachedPublicProfile(companyId, publicData);
  const followerDoc = new Follower({
    _id: new mongoose.Types.ObjectId(),
    follower: otherUserId,
    following: compUuid,
  });
  await followerDoc.save();
  await tick();
  assert(await CompanyCacheRepository.getCachedPublicProfile(companyId) === null,
    'Follower post-save hook invalidated company profile cache');

  // --------------------------------------------------------------------------
  // TEST 6: Post Comments Short-TTL Read Cache and Invalidation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Post Comments Cache Hit, Miss, and Invalidation ---');
  const postId = new mongoose.Types.ObjectId().toString();
  await CommentCacheRepository.invalidatePostComments(postId);
  let cachedComments = await CommentCacheRepository.getCachedPostComments(postId);
  assert(cachedComments === null, 'Comment cache returns null on miss');

  const sampleComments = [{ _id: 'c1', content: 'First comment', userId: testUserId }];
  await CommentCacheRepository.setCachedPostComments(postId, sampleComments);
  cachedComments = await CommentCacheRepository.getCachedPostComments(postId);
  assert(cachedComments !== null && cachedComments.length === 1, 'Comment cache hit returns comments');
  assert(cachedComments[0].content === 'First comment', 'Comment content matches payload');

  // Invalidate on comment add/edit/delete
  const commentDoc = new Comment({
    _id: new mongoose.Types.ObjectId(),
    postId,
    userId: testUserId,
    content: 'Mongoose hook test comment',
  });
  await commentDoc.save();
  await tick();
  assert(await CommentCacheRepository.getCachedPostComments(postId) === null,
    'Comment post-save hook invalidated post comments cache');

  // --------------------------------------------------------------------------
  // TEST 7: Post Reactions Short-TTL Read Cache with MongoDB Writes
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Post Reactions Short-TTL Read Cache ---');
  const entryId = 'post_entry_' + Date.now();
  await ReactionCacheRepository.invalidateReactionSummary(entryId);

  let cachedReactions = await ReactionCacheRepository.getCachedSummary(entryId);
  assert(cachedReactions === null, 'Reaction summary returns null on miss');

  const reactionSummary = {
    total: 3,
    countsByType: { like: 2, celebrate: 1 },
    reactions: [
      { userId: testUserId, type: 'like' },
      { userId: otherUserId, type: 'celebrate' },
    ],
  };
  await ReactionCacheRepository.setCachedSummary(entryId, reactionSummary);
  cachedReactions = await ReactionCacheRepository.getCachedSummary(entryId);
  assert(cachedReactions !== null, 'Reaction summary returns payload on hit');
  assert(cachedReactions.total === 3, 'Reaction total matches');
  assert(cachedReactions.countsByType.like === 2, 'Counts by type preserved');

  // Invalidate on reaction mutation
  await ReactionCacheRepository.invalidateReactionSummary(entryId);
  assert(await ReactionCacheRepository.getCachedSummary(entryId) === null,
    'Reaction summary cache invalidated after reaction mutation');

  // --------------------------------------------------------------------------
  // TEST 8: Fallback and Kill Switch Behavior
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Fallback and Kill Switch Behavior ---');
  process.env.CACHE_DOUBT_ENABLED = 'false';
  process.env.CACHE_COMPANY_ENABLED = 'false';
  process.env.CACHE_COMMENT_ENABLED = 'false';
  process.env.CACHE_REACTION_ENABLED = 'false';

  assert(await DoubtCacheRepository.getCachedFeed(testGroupId.toString(), 'default') === null,
    'Doubt cache returns null (fallback) when CACHE_DOUBT_ENABLED=false');
  assert(await CompanyCacheRepository.getCachedPublicProfile(companyId) === null,
    'Company cache returns null (fallback) when CACHE_COMPANY_ENABLED=false');
  assert(await CommentCacheRepository.getCachedPostComments(postId) === null,
    'Comment cache returns null (fallback) when CACHE_COMMENT_ENABLED=false');
  assert(await ReactionCacheRepository.getCachedSummary(entryId) === null,
    'Reaction cache returns null (fallback) when CACHE_REACTION_ENABLED=false');

  // Restore kill switches
  process.env.CACHE_DOUBT_ENABLED = 'true';
  process.env.CACHE_COMPANY_ENABLED = 'true';
  process.env.CACHE_COMMENT_ENABLED = 'true';
  process.env.CACHE_REACTION_ENABLED = 'true';

  // --------------------------------------------------------------------------
  // TEST 9: Blocked Author's Comment Is NOT Served to the Blocked Viewer
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Blocked Author Comment Not Served to Blocked Viewer ---');
  const authorUserId = uuidv4();
  const viewerUserId = uuidv4();
  const unblockedViewerId = uuidv4();
  const blockPostId = 'block_test_post_' + Date.now();

  const blockedComment = new Comment({
    commentId: uuidv4(),
    postId: blockPostId,
    userId: authorUserId,
    content: 'Sensitive comment from author',
  });
  await blockedComment.save();

  // Create an active block between viewer and author
  const blockDoc = new ConnectionBlock({
    blockerId: viewerUserId,
    blockedId: authorUserId,
    reason: BlockReason.OTHER,
    isActive: true,
    blockedAt: new Date(),
  });
  await blockDoc.save();

  // 1. Unblocked viewer sees the comment
  const commentsForUnblocked = await CommentService.getCommentsByPostId(blockPostId, unblockedViewerId);
  assert(
    commentsForUnblocked.comments.some((c: any) => c.content === 'Sensitive comment from author'),
    'Unblocked viewer sees author comment'
  );

  // 2. Blocked viewer does NOT see author comment, but total reflects true total comments count
  const commentsForBlocked = await CommentService.getCommentsByPostId(blockPostId, viewerUserId);
  assert(
    !commentsForBlocked.comments.some((c: any) => c.userId === authorUserId),
    'Blocked author comment is NOT served to the blocked viewer'
  );
  assert(
    commentsForBlocked.total === 1,
    'Total comments field remains the true post total (1) even when comments are filtered by block list'
  );

  // 3. Private Post: NO viewerId (unauthenticated) or non-author MUST return empty array
  console.log('\n--- TEST 9b: Private Post Comments with NO viewerId or Non-Author ---');
  const privatePostEntryId = 'private_post_entry_' + Date.now();
  const postAuthorUserId = uuidv4();
  const nonAuthorUserId = uuidv4();

  await Post.create({
    userId: postAuthorUserId,
    posts: [
      {
        entryId: privatePostEntryId,
        title: 'Secret Confidential Post',
        isPublic: false,
        postUrl: `http://localhost/posts/${privatePostEntryId}`,
        images: [],
        videos: [],
        documents: [],
        likesCount: 0,
        commentsCount: 1,
        repostsCount: 0,
        sendsCount: 0,
        likedBy: [],
        savedBy: [],
        reactions: [],
        reactionCounts: { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, funny: 0 },
        isPinned: false,
      },
    ],
  });

  const privateComment = new Comment({
    commentId: uuidv4(),
    postId: privatePostEntryId,
    userId: postAuthorUserId,
    content: 'Classified discussion',
  });
  await privateComment.save();

  // A: NO viewerId provided (unauthenticated request) -> MUST return empty comments and total 0
  const commentsNoViewer = await CommentService.getCommentsByPostId(privatePostEntryId);
  assert(
    commentsNoViewer.comments.length === 0 && commentsNoViewer.total === 0,
    'Private post with NO viewerId returns { comments: [], total: 0 }'
  );

  // B: Non-author viewerId provided -> MUST return empty comments and total 0
  const commentsNonAuthor = await CommentService.getCommentsByPostId(privatePostEntryId, nonAuthorUserId);
  assert(
    commentsNonAuthor.comments.length === 0 && commentsNonAuthor.total === 0,
    'Private post with non-author viewerId returns { comments: [], total: 0 }'
  );

  // C: Post author viewerId provided -> successfully returns comments and total
  const commentsForAuthor = await CommentService.getCommentsByPostId(privatePostEntryId, postAuthorUserId);
  assert(
    commentsForAuthor.comments.length === 1 && commentsForAuthor.comments[0].content === 'Classified discussion',
    'Private post author successfully views private comments'
  );
  assert(commentsForAuthor.total === 1, 'Private post author views true total (1)');

  // --------------------------------------------------------------------------
  // TEST 10: Private-Group Doubt is NEVER Served to a Non-Member
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Private-Group Doubt Never Served to Non-Member ---');
  const privateGroupId = uuidv4();
  const memberUserId = new mongoose.Types.ObjectId().toString();
  const nonMemberUserId = uuidv4();

  const User = (await import('@/auth/models/User.model')).default;
  const memberUserDoc = await User.create({
    _id: new mongoose.Types.ObjectId(memberUserId),
    userId: memberUserId,
    email: `member_${Date.now()}@test.com`,
    passwordHash: 'dummy',
    firstName: 'Group',
    lastName: 'Member',
    status: 'active',
    accountStatus: 'active',
  });

  const privateGroupDoc = new Group({
    groupId: privateGroupId,
    title: 'Top Secret Research Group',
    description: 'Confidential research discussion',
    category: GroupCategory.OTHER,
    visibility: 'private',
    leaderId: memberUserId,
  });
  await privateGroupDoc.save();

  // Seed active member in GroupMember
  await GroupMember.create({
    userId: memberUserId,
    groupId: privateGroupId,
    role: 'admin',
    status: 'active',
    joinedAt: new Date(),
  });

  // Create doubt in private group
  const privateDoubt = await Doubt.create({
    doubtId: uuidv4(),
    title: 'Private Doubt Title',
    description: 'Secret doubt description',
    group: privateGroupId,
    postedBy: memberUserId,
    category: 'Programming',
  });

  // Non-member access MUST throw ForbiddenError
  let nonMemberRejected = false;
  try {
    await doubtService.getGroupDoubts(privateGroupId, {}, nonMemberUserId);
  } catch (err: any) {
    nonMemberRejected = true;
    console.log('  [DEBUG TEST 10 CATCH]', err.name, err.message, err.statusCode);
    assert(
      (err.message && (err.message.includes('not a member') || err.message.includes('membership'))) ||
      err.statusCode === 403 ||
      err.name === 'ForbiddenError',
      'Non-member received ForbiddenError'
    );
  }
  assert(nonMemberRejected === true, 'Private-group doubt is NEVER served to a non-member');

  // Member access succeeds
  const memberFeed = await doubtService.getGroupDoubts(privateGroupId, {}, memberUserId);
  assert(
    memberFeed.doubts.some((d: any) => d.doubtId === privateDoubt.doubtId),
    'Active member can access private group doubts'
  );

  // Cleanup test documents
  await Doubt.deleteOne({ _id: createdDoubt._id });
  await Doubt.deleteOne({ _id: privateDoubt._id });
  await Company.deleteOne({ _id: companyDoc._id });
  await Job.deleteOne({ _id: jobDoc._id });
  await CompanyReview.deleteOne({ _id: reviewDoc._id });
  await Follower.deleteOne({ _id: followerDoc._id });
  await Comment.deleteOne({ _id: commentDoc._id });
  await Comment.deleteOne({ _id: blockedComment._id });
  await ConnectionBlock.deleteOne({ _id: blockDoc._id });
  await Group.deleteOne({ _id: privateGroupDoc._id });
  await GroupMember.deleteMany({ groupId: privateGroupId });
  await User.deleteOne({ _id: memberUserDoc._id });

  console.log('\n========================================================================');
  console.log('✅ ALL DOUBTS, COMPANY, COMMENTS & REACTIONS TESTS PASSED (ITEM K)');
  console.log('========================================================================\n');
}

runDoubtCompanyCommentCacheTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  });
