/**
 * ====================================
 * TEST SERVICE (PRODUCTION-READY) - FIXED
 * ====================================
 * Handle complex test operations and auto-grading
 */

import Test from '../models/Test.model';
import Question from '../models/Question.model';
import { BadRequestError, NotFoundError } from '@/shared/errors/app.error';
import { LoggerUtil } from '@/shared/logger.util';
import mongoose from 'mongoose';

/**
 * Test Attempt Answer Interface
 */
interface TestAttemptAnswer {
  questionId: string;
  answer: string | string[];
  timeSpent?: number; // in seconds
}

/**
 * Test Attempt Result Interface
 */
interface TestAttemptResult {
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  score: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  timeTaken: number;
  questionResults: QuestionResult[];
}

/**
 * Question Result Interface
 */
interface QuestionResult {
  questionId: string;
  questionText: string;
  userAnswer: string | string[];
  correctAnswer?: string | string[];
  isCorrect: boolean;
  marksObtained: number;
  totalMarks: number;
  explanation?: string;
}

class TestService {
  /**
   * Auto-grade test attempt
   */
  async gradeTestAttempt(
    testId: string,
    answers: TestAttemptAnswer[],
    timeTaken: number
  ): Promise<TestAttemptResult> {
    LoggerUtil.info(`Grading test attempt for test ${testId}`);

    // Fetch test with questions
    const test = await Test.findById(testId).populate('questions').lean();

    if (!test) {
      throw new NotFoundError('Test not found');
    }

    if (!test.questions || test.questions.length === 0) {
      throw new BadRequestError('Test has no questions');
    }

    const questions = test.questions as any[];
    const answerMap = new Map(
      answers.map((a) => [a.questionId, a.answer])
    );

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    const questionResults: QuestionResult[] = [];

    // Grade each question
    for (const question of questions) {
      const userAnswer = answerMap.get(question._id.toString());
      
      if (!userAnswer) {
        // Unanswered
        questionResults.push({
          questionId: question._id.toString(),
          questionText: question.questionText,
          userAnswer: '',
          correctAnswer: question.correctAnswer,
          isCorrect: false,
          marksObtained: 0,
          totalMarks: question.marks,
          explanation: question.explanation,
        });
        continue;
      }

      // Check if answer is correct
      const isCorrect = this.checkAnswer(
        question.questionType,
        userAnswer,
        question.correctAnswer
      );

      let marksObtained = 0;

      if (isCorrect) {
        marksObtained = question.marks;
        correctCount++;
        totalScore += marksObtained;
      } else {
        wrongCount++;
        
        // Apply negative marking if enabled
        if (test.settings.negativeMarking && test.settings.negativeMarksPerQuestion) {
          marksObtained = -test.settings.negativeMarksPerQuestion;
          totalScore += marksObtained;
        }
      }

      questionResults.push({
        questionId: question._id.toString(),
        questionText: question.questionText,
        userAnswer,
        correctAnswer: test.settings.showAnswersAfterSubmit 
          ? question.correctAnswer 
          : undefined,
        isCorrect,
        marksObtained,
        totalMarks: question.marks,
        explanation: test.settings.showAnswersAfterSubmit 
          ? question.explanation 
          : undefined,
      });
    }

    const unanswered = questions.length - answers.length;
    const percentage = (totalScore / test.totalMarks) * 100;
    const passed = totalScore >= test.passingMarks;

    LoggerUtil.info(`Test graded: Score ${totalScore}/${test.totalMarks}, Passed: ${passed}`);

    return {
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      wrongAnswers: wrongCount,
      unanswered,
      score: Math.max(0, totalScore), // Don't allow negative total score
      totalMarks: test.totalMarks,
      percentage: Math.max(0, percentage),
      passed,
      timeTaken,
      questionResults,
    };
  }

  /**
   * Check if answer is correct
   */
  private checkAnswer(
    questionType: string,
    userAnswer: string | string[],
    correctAnswer: string | string[]
  ): boolean {
    if (questionType === 'mcq' || questionType === 'true-false') {
      if (Array.isArray(correctAnswer)) {
        // Multiple correct answers
        if (!Array.isArray(userAnswer)) return false;
        
        return (
          userAnswer.length === correctAnswer.length &&
          userAnswer.every((ans) => correctAnswer.includes(ans))
        );
      } else {
        // Single correct answer
        return userAnswer === correctAnswer;
      }
    }

    // For short-answer and long-answer, manual grading required
    return false;
  }

  /**
   * Shuffle questions for a test
   * ✅ FIXED: Proper type handling with non-null assertion
   */
  async shuffleTestQuestions(testId: string): Promise<any[]> {
    LoggerUtil.info(`Shuffling questions for test ${testId}`);

    const questions = await Question.find({ test: testId })
      .lean()
      .exec();

    if (!questions || questions.length === 0) {
      return [];
    }

    // ✅ FIX: Fisher-Yates shuffle with proper type handling
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      
      // ✅ Use tuple destructuring for swap (type-safe)
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }

    return shuffled;
  }

  /**
   * Validate test attempt
   */
  async validateTestAttempt(
    testId: string,
    userId: string,
    attemptNumber: number
  ): Promise<boolean> {
    LoggerUtil.info(`Validating test attempt for test ${testId}, user ${userId}`);

    const test = await Test.findById(testId).lean();

    if (!test) {
      throw new NotFoundError('Test not found');
    }

    if (!test.isPublished) {
      throw new BadRequestError('Test is not published yet');
    }

    if (!test.isActive) {
      throw new BadRequestError('Test is no longer active');
    }

    // Check if test is scheduled and live
    if (test.scheduledStartTime && test.scheduledEndTime) {
      const now = new Date();
      
      if (now < test.scheduledStartTime) {
        throw new BadRequestError('Test has not started yet');
      }
      
      if (now > test.scheduledEndTime) {
        throw new BadRequestError('Test has ended');
      }
    }

    // Check max attempts
    if (!test.settings.allowReAttempt && attemptNumber > 1) {
      throw new BadRequestError('Re-attempts are not allowed for this test');
    }

    if (attemptNumber > test.settings.maxAttempts) {
      throw new BadRequestError('Maximum attempts exceeded');
    }

    return true;
  }

  /**
   * Calculate test difficulty distribution
   */
  async getTestDifficultyDistribution(testId: string): Promise<any> {
    LoggerUtil.info(`Calculating difficulty distribution for test ${testId}`);

    const distribution = await Question.aggregate([
      { $match: { test: new mongoose.Types.ObjectId(testId) } },
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 },
          totalMarks: { $sum: '$marks' },
          averageMarks: { $avg: '$marks' },
        },
      },
      {
        $project: {
          difficulty: '$_id',
          count: 1,
          totalMarks: 1,
          averageMarks: { $round: ['$averageMarks', 2] },
          _id: 0,
        },
      },
    ]);

    return distribution;
  }

  /**
   * Calculate test topic distribution
   */
  async getTestTopicDistribution(testId: string): Promise<any> {
    LoggerUtil.info(`Calculating topic distribution for test ${testId}`);

    const distribution = await Question.aggregate([
      { $match: { test: new mongoose.Types.ObjectId(testId) } },
      { $match: { topic: { $ne: null } } },
      {
        $group: {
          _id: '$topic',
          count: { $sum: 1 },
          totalMarks: { $sum: '$marks' },
        },
      },
      {
        $project: {
          topic: '$_id',
          count: 1,
          totalMarks: 1,
          _id: 0,
        },
      },
      { $sort: { count: -1 } },
    ]);

    return distribution;
  }

  /**
   * Get recommended study topics based on test performance
   */
  async getRecommendedTopics(
    userId: string,
    testId: string
  ): Promise<string[]> {
    LoggerUtil.info(`Getting recommended topics for user ${userId}, test ${testId}`);

    // This would analyze user's test performance
    // and recommend topics they need to improve on
    
    // Placeholder implementation
    const weakTopics = await Question.aggregate([
      { $match: { test: new mongoose.Types.ObjectId(testId) } },
      { $match: { topic: { $ne: null } } },
      { $group: { _id: '$topic', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, topic: '$_id' } },
    ]);

    return weakTopics.map((t: any) => t.topic);
  }

  /**
   * Bulk import questions
   */
  async bulkImportQuestions(
    testId: string,
    questions: any[]
  ): Promise<any[]> {
    LoggerUtil.info(`Bulk importing ${questions.length} questions for test ${testId}`);

    const test = await Test.findById(testId);

    if (!test) {
      throw new NotFoundError('Test not found');
    }

    // Validate and prepare questions
    const preparedQuestions = questions.map((q, index) => ({
      ...q,
      test: testId,
      order: q.order || index + 1,
    }));

    // Insert questions
    const insertedQuestions = await Question.insertMany(preparedQuestions);

    // Update test
    test.questions.push(...insertedQuestions.map((q) => q._id as any));
    test.totalQuestions = test.questions.length;
    test.totalMarks += insertedQuestions.reduce((sum, q) => sum + q.marks, 0);
    
    await test.save();

    LoggerUtil.info(`Successfully imported ${insertedQuestions.length} questions`);

    return insertedQuestions;
  }

  /**
   * Clone test with all questions
   */
  async cloneTest(
    testId: string,
    userId: string,
    newGroupId?: string
  ): Promise<any> {
    LoggerUtil.info(`Cloning test ${testId} for user ${userId}`);

    const originalTest = await Test.findById(testId).lean();

    if (!originalTest) {
      throw new NotFoundError('Test not found');
    }

    // Create new test
    const newTestData: any = {
      ...originalTest,
      _id: undefined,
      creator: userId,
      group: newGroupId || originalTest.group,
      title: `${originalTest.title} (Copy)`,
      questions: [],
      isPublished: false,
      publishedAt: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    };

    const newTest = await Test.create(newTestData);

    // Clone questions
    const originalQuestions = await Question.find({ test: testId }).lean();

    const newQuestions = await Promise.all(
      originalQuestions.map((q: any) =>
        Question.create({
          ...q,
          _id: undefined,
          test: newTest._id,
          createdAt: undefined,
          updatedAt: undefined,
        })
      )
    );

    // Update new test with questions
    newTest.questions = newQuestions.map((q) => q._id as any);
    newTest.totalQuestions = newQuestions.length;
    await newTest.save();

    LoggerUtil.info(`Test cloned successfully: ${newTest._id}`);

    return newTest;
  }
}

export default new TestService();