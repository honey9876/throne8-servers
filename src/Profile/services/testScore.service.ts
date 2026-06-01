/**
 * Test Score Service - Business Logic for Test Scores
 * Handles test score CRUD operations with validity tracking
 * 
 * @module services/testScore.service
 * @version 1.0.0
 */

import { TestScore, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface CreateTestScoreData {
    userId: string;
    testName: 'GRE' | 'GMAT' | 'TOEFL' | 'IELTS' | 'SAT' | 'ACT' | 'LSAT' | 'MCAT' |
    'CAT' | 'JEE' | 'NEET' | 'GATE' | 'UPSC' | 'PTE' | 'Duolingo English Test' | 'Other';
    score: string;
    testDate: string;
    description?: string;
    associatedSchool?: string;
    validityYears?: number;
}

interface UpdateTestScoreData {
    testName?: 'GRE' | 'GMAT' | 'TOEFL' | 'IELTS' | 'SAT' | 'ACT' | 'LSAT' | 'MCAT' |
    'CAT' | 'JEE' | 'NEET' | 'GATE' | 'UPSC' | 'PTE' | 'Duolingo English Test' | 'Other';
    score?: string;
    testDate?: string;
    description?: string;
    associatedSchool?: string;
    validityYears?: number;
}

// ==================== TEST SCORE SERVICE CLASS ====================

class TestScoreService {

    /**
     * ✅ Create new test score
     */
    static async createTestScore(data: CreateTestScoreData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new test score', {
                userId: data.userId,
                testName: data.testName,
                correlationId,
            });

            // Step 1: Validate user exists
            const user = await User.findOne({ userId: data.userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Step 2: Parse test date
            const testDate = new Date(data.testDate);

            // Validate test date
            if (testDate > new Date()) {
                throw new Error('Test date cannot be in the future');
            }

            // Step 3: Create test score document
            const testScore = new TestScore({
                testScoreId: uuidv4(),
                userId: data.userId,
                testName: data.testName,
                score: data.score.trim(),
                testDate,
                description: data.description?.trim(),
                associatedSchool: data.associatedSchool?.trim(),
                validityYears: data.validityYears,
            });

            await testScore.save();

            // Step 4: Update user model with testScoreId
            if (!user.testScoreIds) {
                user.testScoreIds = [];
            }
            user.testScoreIds.push(testScore.testScoreId);
            await user.save();

            LoggerUtil.info('Test score created successfully', {
                testScoreId: testScore.testScoreId,
                userId: data.userId,
                testName: data.testName,
                correlationId,
            });

            return this.formatTestScoreResponse(testScore);

        } catch (error: any) {
            LoggerUtil.error('Test score creation failed', {
                error: error.message,
                stack: error.stack,
                userId: data.userId,
                correlationId,
            });

            throw error;
        }
    }

    /**
     * ✅ Get all test scores for user
     */
    static async getAllTestScores(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all test scores', {
                userId,
                includeArchived,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const testScoreList = await TestScore.findByUserId(userId, includeArchived);

            LoggerUtil.info('Test scores fetched successfully', {
                userId,
                count: testScoreList.length,
                correlationId,
            });

            return {
                testScoreList: testScoreList.map(ts => this.formatTestScoreResponse(ts)),
                total: testScoreList.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all test scores failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single test score by ID
     */
    static async getTestScoreById(testScoreId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching test score by ID', {
                testScoreId,
                userId,
                correlationId,
            });

            const testScore = await TestScore.findActiveById(testScoreId, userId);

            if (!testScore) {
                throw new Error('Test score not found');
            }

            LoggerUtil.info('Test score fetched successfully', {
                testScoreId,
                userId,
                correlationId,
            });

            return this.formatTestScoreResponse(testScore);

        } catch (error: any) {
            LoggerUtil.error('Get test score by ID failed', {
                error: error.message,
                testScoreId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update test score
     */
    static async updateTestScore(
        testScoreId: string,
        userId: string,
        updates: UpdateTestScoreData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating test score', {
                testScoreId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const testScore = await TestScore.findActiveById(testScoreId, userId);

            if (!testScore) {
                throw new Error('Test score not found');
            }

            // Apply updates
            if (updates.testName !== undefined) {
                testScore.testName = updates.testName;
            }
            if (updates.score !== undefined) {
                testScore.score = updates.score.trim();
            }
            if (updates.testDate !== undefined) {
                const testDate = new Date(updates.testDate);
                if (testDate > new Date()) {
                    throw new Error('Test date cannot be in the future');
                }
                testScore.testDate = testDate;
            }
            if (updates.description !== undefined) {
                testScore.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.associatedSchool !== undefined) {
                testScore.associatedSchool = updates.associatedSchool ? updates.associatedSchool.trim() : undefined;
            }
            if (updates.validityYears !== undefined) {
                testScore.validityYears = updates.validityYears;
            }

            await testScore.save();

            LoggerUtil.info('Test score updated successfully', {
                testScoreId,
                userId,
                correlationId,
            });

            return this.formatTestScoreResponse(testScore);

        } catch (error: any) {
            LoggerUtil.error('Update test score failed', {
                error: error.message,
                testScoreId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete test score (soft delete)
     */
    static async deleteTestScore(
        testScoreId: string,
        userId: string,
        permanent: boolean = false
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting test score', {
                testScoreId,
                userId,
                permanent,
                correlationId,
            });

            const testScore = await TestScore.findOne({
                testScoreId,
                userId,
            });

            if (!testScore) {
                throw new Error('Test score not found');
            }

            if (permanent) {
                // Permanent delete
                await TestScore.deleteOne({ testScoreId, userId });

                // Remove from user's testScoreIds
                await User.updateOne(
                    { userId },
                    { $pull: { testScoreIds: testScoreId } }
                );

                LoggerUtil.info('Test score permanently deleted', {
                    testScoreId,
                    userId,
                    correlationId,
                });

                return {
                    testScoreId,
                    deletedAt: new Date(),
                    permanent: true,
                    message: 'Test score permanently deleted',
                };
            } else {
                // Soft delete
                testScore.isDeleted = true;
                testScore.deletedAt = new Date();
                await testScore.save();

                LoggerUtil.info('Test score soft deleted', {
                    testScoreId,
                    userId,
                    correlationId,
                });

                return {
                    testScoreId,
                    deletedAt: testScore.deletedAt,
                    permanent: false,
                    message: 'Test score deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete test score failed', {
                error: error.message,
                testScoreId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive test score
     */
    static async archiveTestScore(testScoreId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving test score', {
                testScoreId,
                userId,
                correlationId,
            });

            const testScore = await TestScore.findActiveById(testScoreId, userId);

            if (!testScore) {
                throw new Error('Test score not found');
            }

            if (testScore.isArchived) {
                throw new Error('Test score is already archived');
            }

            testScore.isArchived = true;
            testScore.archivedAt = new Date();
            await testScore.save();

            LoggerUtil.info('Test score archived successfully', {
                testScoreId,
                userId,
                correlationId,
            });

            return {
                testScoreId: testScore.testScoreId,
                isArchived: testScore.isArchived,
                archivedAt: testScore.archivedAt,
                message: 'Test score archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive test score failed', {
                error: error.message,
                testScoreId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived test score
     */
    static async restoreTestScore(testScoreId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring test score', {
                testScoreId,
                userId,
                correlationId,
            });

            const testScore = await TestScore.findOne({
                testScoreId,
                userId,
                isDeleted: false,
            });

            if (!testScore) {
                throw new Error('Test score not found');
            }

            if (!testScore.isArchived) {
                throw new Error('Test score is not archived');
            }

            testScore.isArchived = false;
            testScore.archivedAt = undefined;
            await testScore.save();

            LoggerUtil.info('Test score restored successfully', {
                testScoreId,
                userId,
                correlationId,
            });

            return {
                testScoreId: testScore.testScoreId,
                isArchived: testScore.isArchived,
                message: 'Test score restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore test score failed', {
                error: error.message,
                testScoreId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder test scores
     */
    static async reorderTestScores(userId: string, orderedIds: string[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Reordering test scores', {
                userId,
                count: orderedIds.length,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            // Validate all IDs are unique
            const uniqueIds = new Set(orderedIds);
            if (uniqueIds.size !== orderedIds.length) {
                throw new Error('Duplicate test score IDs provided');
            }

            // Reorder using static method
            await TestScore.reorderTestScores(userId, orderedIds);

            LoggerUtil.info('Test scores reordered successfully', {
                userId,
                count: orderedIds.length,
                correlationId,
            });

            return {
                userId,
                reorderedCount: orderedIds.length,
                message: 'Test scores reordered successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder test scores failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Format test score response
     */
    private static formatTestScoreResponse(testScore: any): any {
        return {
            testScoreId: testScore.testScoreId,
            userId: testScore.userId,
            testName: testScore.testName,
            score: testScore.score,
            testDate: testScore.testDate,
            description: testScore.description,
            associatedSchool: testScore.associatedSchool,
            expirationDate: testScore.expirationDate,
            isExpired: testScore.isExpired,
            isValid: testScore.isValid,
            daysUntilExpiration: testScore.daysUntilExpiration,
            validityYears: testScore.validityYears,
            displayOrder: testScore.displayOrder,
            isArchived: testScore.isArchived,
            archivedAt: testScore.archivedAt,
            createdAt: testScore.createdAt,
            updatedAt: testScore.updatedAt,
        };
    }
}

export default TestScoreService;