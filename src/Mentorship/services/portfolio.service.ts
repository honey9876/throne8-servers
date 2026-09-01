
import { logger } from '@/shared/logger.util';
import { User } from '@/auth/models';
import { Portfolio } from '../models';
import { NotFoundError } from '@/shared/errors/app.error';
import { BadRequestError, ForbiddenError } from '@/shared/errors/app.error';

interface CreatePortfolioInput {
  userId: string;
  portfolioUrl: string;
  portfolioType: 'design' | 'development' | 'product' | 'data_science' | 'other';
  projects?: any[];
  skills?: string[];
  sessionId?: string;
}

interface PortfolioAnalysis {
  overallScore: number;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  technicalDepth: number;
  presentationQuality: number;
  projectDiversity: number;
  completeness: number;
}

class PortfolioService {
  /**
   * Create a new portfolio
   */
  async createPortfolio(input: CreatePortfolioInput, authToken?: string): Promise<any> {
    try {
      logger.info(`Creating portfolio for user ${input.userId}`);

      // Verify user exists
      await User.findByUserId(input.userId);

      // Create portfolio
      const portfolio = new Portfolio({
        userId: input.userId,
        portfolioUrl: input.portfolioUrl,
        portfolioType: input.portfolioType,
        projects: input.projects || [],
        skills: input.skills || [],
        sessionId: input.sessionId,
        status: 'pending_review',
      });

      await portfolio.save();

      logger.info(`Portfolio created successfully: ${portfolio._id}`);

      // TODO: Trigger AI analysis

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to create portfolio:', error);
      throw error;
    }
  }

  /**
   * Get portfolio by ID
   */
  async getPortfolioById(
    portfolioId: string,
    userId?: string,
    _authToken?: string
  ): Promise<any> {
    try {
      const portfolio = await Portfolio.findById(portfolioId);

      if (!portfolio) {
        throw new NotFoundError('PORTFOLIO_NOT_FOUND');
      }

      // Check access permission
      if (userId && portfolio.userId !== userId && !portfolio.mentorFeedback?.mentorId) {
        throw new ForbiddenError(
          'UNAUTHORIZED_ACCESS'
        );
      }

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to fetch portfolio:', error);
      throw error;
    }
  }

  /**
   * Get all portfolios for a user
   */
  async getUserPortfolios(userId: string, _authToken?: string): Promise<any[]> {
    try {
      const portfolios = await Portfolio.find({ userId })
        .sort({ createdAt: -1 })
        .lean();

      return portfolios;
    } catch(error : any) {
      logger.error('Failed to fetch user portfolios:', error);
      throw error;
    }
  }

  /**
   * Get portfolios pending review
   */
  async getPendingReviews(_authToken?: string): Promise<any[]> {
    try {
      const portfolios = await Portfolio.find({
        status: 'pending_review',
      })
        .sort({ createdAt: 1 })
        .lean();

      return portfolios;
    } catch(error : any) {
      logger.error('Failed to fetch pending reviews:', error);
      throw error;
    }
  }

  /**
   * Analyze portfolio with AI
   */
  async analyzePortfolio(
    portfolioId: string,
    analysis: PortfolioAnalysis,
    _authToken?: string
  ): Promise<any> {
    try {
      const portfolio: any = await Portfolio.findById(portfolioId);

      if (!portfolio) {
        throw new NotFoundError('PORTFOLIO_NOT_FOUND');
      }

      portfolio.analysis = analysis;
      portfolio.status = 'under_review';
      await portfolio.save();

      logger.info(`Portfolio analyzed: ${portfolioId}`);

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to analyze portfolio:', error);
      throw error;
    }
  }

  /**
   * Add mentor feedback
   */
  async addMentorFeedback(
    portfolioId: string,
    mentorId: string,
    feedback: {
      overallComments: string;
      projectFeedbacks: any[];
      actionItems: string[];
      resources: string[];
    },
    authToken?: string
  ): Promise<any> {
    try {
      const portfolio = await this.getPortfolioById(portfolioId, undefined, authToken);

      if (portfolio.status !== 'under_review' && portfolio.status !== 'pending_review') {
        throw new BadRequestError(
          'Portfolio is not in review status'
        );
      }

      await portfolio.addMentorFeedback(
        mentorId,
        feedback.overallComments,
        feedback.projectFeedbacks,
        feedback.actionItems,
        feedback.resources
      );

      logger.info(`Mentor feedback added for portfolio: ${portfolioId}`);

      // TODO: Send notification to user

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to add mentor feedback:', error);
      throw error;
    }
  }

  /**
   * Submit portfolio revision
   */
  async submitRevision(
    portfolioId: string,
    userId: string,
    newPortfolioUrl: string,
    changes: string,
    authToken?: string
  ): Promise<any> {
    try {
      const portfolio = await this.getPortfolioById(portfolioId, userId, authToken);

      if (portfolio.userId !== userId) {
        throw new ForbiddenError(
          'Only the owner can submit revisions'
        );
      }

      if (portfolio.status !== 'reviewed') {
        throw new BadRequestError(
          'Can only submit revisions for reviewed portfolios'
        );
      }

      await portfolio.submitRevision(newPortfolioUrl, changes);

      logger.info(`Revision submitted for portfolio: ${portfolioId}`);

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to submit revision:', error);
      throw error;
    }
  }

  /**
   * Add project to portfolio
   */
  async addProject(
    portfolioId: string,
    userId: string,
    project: any,
    authToken?: string
  ): Promise<any> {
    try {
      const portfolio = await this.getPortfolioById(portfolioId, userId, authToken);

      if (portfolio.userId !== userId) {
        throw new ForbiddenError(
          'Only the owner can add projects'
        );
      }

      await portfolio.addProject(project);

      logger.info(`Project added to portfolio: ${portfolioId}`);

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to add project:', error);
      throw error;
    }
  }

  /**
   * Update project in portfolio
   */
  async updateProject(
    portfolioId: string,
    userId: string,
    projectTitle: string,
    updates: any,
    authToken?: string
  ): Promise<any> {
    try {
      const portfolio = await this.getPortfolioById(portfolioId, userId, authToken);

      if (portfolio.userId !== userId) {
        throw new ForbiddenError(
          'Only the owner can update projects'
        );
      }

      await portfolio.updateProject(projectTitle, updates);

      logger.info(`Project updated in portfolio: ${portfolioId}`);

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to update project:', error);
      throw error;
    }
  }

  /**
   * Remove project from portfolio
   */
  async removeProject(
    portfolioId: string,
    userId: string,
    projectTitle: string,
    authToken?: string
  ): Promise<any> {
    try {
      const portfolio = await this.getPortfolioById(portfolioId, userId, authToken);

      if (portfolio.userId !== userId) {
        throw new ForbiddenError(
          'Only the owner can remove projects'
        );
      }

      await portfolio.removeProject(projectTitle);

      logger.info(`Project removed from portfolio: ${portfolioId}`);

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to remove project:', error);
      throw error;
    }
  }

  /**
   * Get portfolio statistics
   */
  async getPortfolioStats(userId: string, _authToken?: string): Promise<any> {
    try {
      const portfolios = await Portfolio.find({ userId });

      const stats = {
        total: portfolios.length,
        reviewed: portfolios.filter((p: any) => p.status === 'reviewed').length,
        pending: portfolios.filter((p: any) => p.status === 'pending_review').length,
        underReview: portfolios.filter((p: any) => p.status === 'under_review').length,
        averageScore: 0,
        totalProjects: 0,
        totalRevisions: 0,
      };

      const reviewedPortfolios = portfolios.filter((p: any) => p.analysis);
      if (reviewedPortfolios.length > 0) {
        const totalScore = reviewedPortfolios.reduce(
          (sum: any, p: any) => sum + (p.analysis?.overallScore || 0),
          0
        );
        stats.averageScore = totalScore / reviewedPortfolios.length;
      }

      stats.totalProjects = portfolios.reduce(
        (sum: any, p: any) => sum + (p.projects?.length || 0),
        0
      );

      stats.totalRevisions = portfolios.reduce(
        (sum: any, p: any) => sum + (p.revisions?.length || 0),
        0
      );

      return stats;
    } catch(error : any) {
      logger.error('Failed to fetch portfolio stats:', error);
      throw error;
    }
  }

  /**
   * Archive portfolio
   */
  async archivePortfolio(
    portfolioId: string,
    userId: string,
    authToken?: string
  ): Promise<any> {
    try {
      const portfolio = await this.getPortfolioById(portfolioId, userId, authToken);

      if (portfolio.userId !== userId) {
        throw new ForbiddenError(
          'Only the owner can archive this portfolio'
        );
      }

      await portfolio.markAsArchived();

      logger.info(`Portfolio archived: ${portfolioId}`);

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to archive portfolio:', error);
      throw error;
    }
  }

  /**
   * Auto-analyze portfolio (AI-based)
   */
  async autoAnalyzePortfolio(portfolioId: string): Promise<any> {
    try {
      const portfolio: any = await Portfolio.findById(portfolioId);

      if (!portfolio) {
        throw new NotFoundError('PORTFOLIO_NOT_FOUND');
      }

      // Simple scoring algorithm (can be replaced with actual AI)
      const projectCount = portfolio.projects?.length || 0;
      const skillCount = portfolio.skills?.length || 0;

      const technicalDepth = Math.min(10, projectCount * 2);
      const presentationQuality = portfolio.portfolioUrl ? 8 : 5;
      const projectDiversity = Math.min(10, skillCount);
      const completeness = Math.min(10, (projectCount + skillCount) / 2);

      const overallScore = Math.round(
        (technicalDepth + presentationQuality + projectDiversity + completeness) / 4 * 10
      );

      const analysis: PortfolioAnalysis = {
        overallScore,
        technicalDepth,
        presentationQuality,
        projectDiversity,
        completeness,
        strengths: this.generateStrengths(portfolio),
        improvements: this.generateImprovements(portfolio),
        suggestions: this.generateSuggestions(portfolio),
      };

      portfolio.analysis = analysis;
      portfolio.status = 'under_review';
      await portfolio.save();

      logger.info(`Auto-analyzed portfolio: ${portfolioId}`);

      return portfolio;
    } catch(error : any) {
      logger.error('Failed to auto-analyze portfolio:', error);
      throw error;
    }
  }

  private generateStrengths(_portfolio: any): string[] {
    const strengths: string[] = [];

    if (_portfolio.projects && _portfolio.projects.length >= 5) {
      strengths.push('Strong project portfolio with multiple case studies');
    }

    if (_portfolio.skills && _portfolio.skills.length >= 8) {
      strengths.push('Diverse skill set showcased');
    }

    if (_portfolio.portfolioUrl) {
      strengths.push('Professional portfolio website');
    }

    return strengths.length > 0 ? strengths : ['Good foundation to build upon'];
  }

  private generateImprovements(_portfolio: any): string[] {
    const improvements: string[] = [];

    if (!_portfolio.projects || _portfolio.projects.length < 3) {
      improvements.push('Add more project case studies (minimum 3-5 recommended)');
    }

    if (!_portfolio.skills || _portfolio.skills.length < 5) {
      improvements.push('Expand your skills list to showcase expertise');
    }

    if (!_portfolio.portfolioUrl) {
      improvements.push('Create a professional portfolio website');
    }

    return improvements;
  }

  private generateSuggestions(_portfolio: any): string[] {
    const suggestions = [
      'Add detailed project descriptions with problem-solution approach',
      'Include metrics and results for each project',
      'Showcase your design/development process',
      'Add testimonials or client feedback if available',
      'Keep portfolio updated with latest work',
    ];

    return suggestions;
  }
}

export default new PortfolioService();