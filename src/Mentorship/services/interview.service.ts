import { NotFoundError } from "@/shared/errors/app.error";
import { SessionMentor } from "../models";
import { logger } from "@/shared/logger.util";
import { BadRequestError } from "@/shared/errors/app.error";


interface MockInterviewSetup {
  sessionId: string;
  interviewType: string;
  targetCompany?: string;
  targetRole?: string;
  duration: number;
  recordingEnabled: boolean;
}

interface InterviewFeedback {
  technicalScore?: number;
  communicationScore?: number;
  problemSolvingScore?: number;
  overallScore?: number;
  strengths?: string[];
  improvements?: string[];
  detailedFeedback?: string;
}

class InterviewService {
  /**
   * Setup mock interview session
   */
  async setupMockInterview(setup: MockInterviewSetup): Promise<any> {
    try {
      logger.info(`Setting up mock interview for session: ${setup.sessionId}`);

      const session = await SessionMentor.findById(setup.sessionId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Validate interview type
      const validTypes = ['technical', 'behavioral', 'case_study', 'hr', 'system_design', 'coding'];
      if (!validTypes.includes(setup.interviewType)) {
        throw new BadRequestError(
          'Invalid interview type')
      }

      // Initialize metadata for mock interview
      if (!session.metadata) {
        session.metadata = {};
      }

      session.metadata.interviewType = setup.interviewType;
      session.metadata.targetCompany = setup.targetCompany;
      session.metadata.targetRole = setup.targetRole;

      // Setup recording configuration
      if (setup.recordingEnabled) {
        if (!session.meeting) {
          session.meeting = {
            platform: 'zoom',
          };
        }
        // Recording will be handled by the video platform
        logger.info('Recording enabled for mock interview');
      }

      await session.save();

      logger.info(`Mock interview setup completed for session: ${setup.sessionId}`);

      return {
        sessionId: session._id,
        interviewType: setup.interviewType,
        targetCompany: setup.targetCompany,
        targetRole: setup.targetRole,
        duration: setup.duration,
        recordingEnabled: setup.recordingEnabled,
        meetingDetails: session.meeting,
      };
    } catch(error : any) {
      logger.error('Failed to setup mock interview:', error);
      throw error;
    }
  }

  /**
   * Submit interview feedback
   */
  async submitInterviewFeedback(
    sessionId: string,
    mentorId: string,
    feedback: InterviewFeedback
  ): Promise<any> {
    try {
      logger.info(`Submitting interview feedback for session: ${sessionId}`);

      const session = await SessionMentor.findById(sessionId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Verify mentor
      if (session.mentorId !== mentorId) {
        throw new BadRequestError(
          'Only the assigned mentor can submit feedback'
        );
      }

      // Validate scores
      this.validateScores(feedback);

      // Calculate overall score if not provided
      if (!feedback.overallScore) {
        feedback.overallScore = this.calculateOverallScore(feedback);
      }

      // Initialize metadata if not exists
      if (!session.metadata) {
        session.metadata = {};
      }

      // Add interview feedback to session metadata
      session.metadata.interviewFeedback = feedback;

      await session.save();

      logger.info(`Interview feedback submitted successfully for session: ${sessionId}`);

      return {
        sessionId: session._id,
        feedback: session.metadata.interviewFeedback,
      };
    } catch(error : any) {
      logger.error('Failed to submit interview feedback:', error);
      throw error;
    }
  }

  /**
   * Get interview feedback
   */
  async getInterviewFeedback(sessionId: string, userId: string): Promise<any> {
    try {
      const session = await SessionMentor.findById(sessionId);

      if (!session) {
        throw new NotFoundError('SESSION_NOT_FOUND');
      }

      // Check access permission
      if (session.mentorId !== userId && session.menteeId !== userId) {
        throw new BadRequestError(
          'You are not authorized to view this feedback'
        );
      }

      if (!session.metadata?.interviewFeedback) {
        throw new NotFoundError(
          'Interview feedback not available yet'
        );
      }

      return {
        sessionId: session._id,
        interviewType: session.metadata.interviewType,
        targetCompany: session.metadata.targetCompany,
        targetRole: session.metadata.targetRole,
        feedback: session.metadata.interviewFeedback,
        recordingUrl: session.meeting?.recordingUrl,
      };
    } catch(error : any) {
      logger.error('Failed to fetch interview feedback:', error);
      throw error;
    }
  }

  /**
   * Generate interview questions based on type and role
   */
  async generateInterviewQuestions(
    interviewType: string,
    targetRole: string,
    targetCompany?: string
  ): Promise<string[]> {
    try {
      logger.info(`Generating interview questions: ${interviewType} for ${targetRole}`);

      // In production, this would integrate with an AI service or question bank
      // For now, we'll return predefined questions based on type

      const questions = this.getQuestionsByType(interviewType, targetRole, targetCompany);

      return questions;
    } catch(error : any) {
      logger.error('Failed to generate interview questions:', error);
      throw error;
    }
  }

  /**
   * Update recording URL after interview
   */
  async updateRecordingUrl(
    sessionId: string,
    recordingUrl: string,
    mentorId: string
  ): Promise<any> {
    try {
      logger.info(`Updating recording URL for session: ${sessionId}`);

      const session = await SessionMentor.findById(sessionId);

      if (!session) {
        throw new NotFoundError('SESSION_NOT_FOUND');
      }

      if (session.mentorId !== mentorId) {
        throw new BadRequestError(
          'Only the mentor can update recording URL'
        );
      }

      if (!session.meeting) {
        session.meeting = {
          platform: 'zoom',
        };
      }

      session.meeting.recordingUrl = recordingUrl;

      await session.save();

      logger.info(`Recording URL updated for session: ${sessionId}`);

      return {
        sessionId: session._id,
        recordingUrl: session.meeting.recordingUrl,
      };
    } catch(error : any) {
      logger.error('Failed to update recording URL:', error);
      throw error;
    }
  }

  /**
   * Get interview statistics for a user
   */
  async getInterviewStats(userId: string, role: 'mentor' | 'mentee'): Promise<any> {
    try {
      const matchField = role === 'mentor' ? 'mentorId' : 'menteeId';

      const stats = await SessionMentor.aggregate([
        {
          $match: {
            [matchField]: userId,
            sessionType: 'mock_interview',
            'metadata.interviewFeedback': { $exists: true },
          },
        },
        {
          $group: {
            _id: null,
            totalInterviews: { $sum: 1 },
            avgTechnicalScore: { $avg: '$metadata.interviewFeedback.technicalScore' },
            avgCommunicationScore: { $avg: '$metadata.interviewFeedback.communicationScore' },
            avgProblemSolvingScore: { $avg: '$metadata.interviewFeedback.problemSolvingScore' },
            avgOverallScore: { $avg: '$metadata.interviewFeedback.overallScore' },
          },
        },
      ]);

      return stats[0] || {
        totalInterviews: 0,
        avgTechnicalScore: 0,
        avgCommunicationScore: 0,
        avgProblemSolvingScore: 0,
        avgOverallScore: 0,
      };
    } catch(error : any) {
      logger.error('Failed to fetch interview stats:', error);
      throw error;
    }
  }

  /**
   * Validate feedback scores
   */
  private validateScores(feedback: InterviewFeedback): void {
    const scores = [
      feedback.technicalScore,
      feedback.communicationScore,
      feedback.problemSolvingScore,
      feedback.overallScore,
    ];

    scores.forEach((score) => {
      if (score !== undefined && (score < 1 || score > 10)) {
        throw new BadRequestError(
          'Scores must be between 1 and 10'
        );
      }
    });
  }

  /**
   * Calculate overall score from individual scores
   */
  private calculateOverallScore(feedback: InterviewFeedback): number {
    const scores = [
      feedback.technicalScore,
      feedback.communicationScore,
      feedback.problemSolvingScore,
    ].filter((score) => score !== undefined) as number[];

    if (scores.length === 0) {
      return 0;
    }

    const sum = scores.reduce((acc, score) => acc + score, 0);
    return Math.round((sum / scores.length) * 10) / 10; // Round to 1 decimal
  }

  /**
   * Get questions by interview type
   */
  private getQuestionsByType(
    interviewType: string,
    targetRole: string,
    targetCompany?: string
  ): string[] {
    const questionBank: Record<string, string[]> = {
      technical: [
        'Explain the difference between var, let, and const in JavaScript',
        'How does async/await work in JavaScript?',
        'What is the difference between SQL and NoSQL databases?',
        'Explain RESTful API design principles',
        'What is the difference between authentication and authorization?',
      ],
      behavioral: [
        'Tell me about a time when you faced a challenging problem at work',
        'Describe a situation where you had to work with a difficult team member',
        'How do you handle tight deadlines and pressure?',
        'Tell me about a project where you took initiative',
        'Describe a time when you failed and what you learned from it',
      ],
      system_design: [
        'Design a URL shortening service like bit.ly',
        'How would you design a news feed system like Twitter?',
        'Design a ride-sharing service like Uber',
        'How would you design a scalable chat application?',
        'Design a video streaming platform like YouTube',
      ],
      coding: [
        'Implement a function to reverse a linked list',
        'Find the longest substring without repeating characters',
        'Implement a binary search algorithm',
        'Check if a string is a valid palindrome',
        'Find the kth largest element in an array',
      ],
      hr: [
        'Tell me about yourself',
        'Why do you want to work for this company?',
        'What are your salary expectations?',
        'Where do you see yourself in 5 years?',
        'What are your greatest strengths and weaknesses?',
      ],
      case_study: [
        'How would you improve customer retention for our product?',
        'Estimate the market size for electric vehicles in India',
        'How would you launch a new feature in our app?',
        'What metrics would you track for a food delivery service?',
        'How would you increase revenue for our e-commerce platform?',
      ],
    };

    let questions = questionBank[interviewType] || questionBank.technical;

    // Customize questions based on company if provided
    if (targetCompany) {
      questions = [
        `Why do you want to work at ${targetCompany}?`,
        ...questions,
      ];
    }

    // Customize based on role
    if (targetRole) {
      questions = [
        `What makes you a good fit for the ${targetRole} position?`,
        ...questions,
      ];
    }

    return questions.slice(0, 10); // Return top 10 questions
  }
}

export default new InterviewService();