import { NotFoundError } from "@/shared/errors/app.error";
import { Resume } from "../models";
import { logger } from "@/shared/logger.util";
import atsScanner from "@/Mentorship/utils/atsScanner";
import { BadRequestError } from "@/shared/errors/app.error";
import AWSService from "@/config/cache/aws.config";


interface ResumeUploadInput {
  userId: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  sessionId?: string;
}

interface MentorFeedbackInput {
  mentorId: string;
  rating: number;
  comments: string;
  detailedFeedback: {
    structure: string;
    content: string;
    formatting: string;
    keywords: string;
    overall: string;
  };
  actionItems: string[];
}

class ResumeService {
  /**
   * Upload and analyze resume
   */
  async uploadResume(input: ResumeUploadInput): Promise<any> {
    try {
      logger.info(`Uploading resume for user: ${input.userId}`);

      // 1. Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ];

      if (!allowedTypes.includes(input.file.mimetype)) {
        throw new BadRequestError(
          'Invalid file type. Only PDF and DOCX files are allowed'
        );
      }

      // 2. Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (input.file.size > maxSize) {
        throw new BadRequestError(
          'File size exceeds 5MB limit'
        );
      }

      // 3. Upload to S3
      const { url: fileUrl, key: fileKey } = await AWSService.uploadFile(
        input.file.buffer,
        input.file.originalname,
        {
          folder: 'resumes',
          contentType: input.file.mimetype,
        }
      );

      // 4. Analyze resume with ATS scanner
      const analysis = await atsScanner.analyzeResume(input.file.buffer, input.file.mimetype);

      // 5. Get latest version number
      const latestResume = await Resume.findOne({
        userId: input.userId,
        isLatest: true,
        isDeleted: false,
      });

      const version = latestResume ? latestResume.version + 1 : 1;

      // 6. Create resume record
      const resume = new Resume({
        userId: input.userId,
        sessionId: input.sessionId,
        filename: `resume_${Date.now()}_${input.file.originalname}`,
        originalName: input.file.originalname,
        fileUrl,
        fileKey,
        fileSize: input.file.size,
        mimeType: input.file.mimetype,
        analysis,
        version,
        isLatest: true,
      });

      await resume.save();

      logger.info(`Resume uploaded successfully: ${resume._id}`);

      return resume;
    } catch(error : any) {
      logger.error('Failed to upload resume:', error);
      throw error;
    }
  }

  /**
   * Get resume by ID
   */
  async getResumeById(resumeId: string, userId?: string): Promise<any> {
    try {
      const resume = await Resume.findOne({
        _id: resumeId,
        isDeleted: false,
      });

      if (!resume) {
        throw new NotFoundError('RESUME_NOT_FOUND');
      }

      // Check access permission
      if (userId && resume.userId !== userId) {
        throw new BadRequestError(
          'You are not authorized to view this resume'
        );
      }

      return resume;
    } catch(error : any) {
      logger.error('Failed to fetch resume:', error);
      throw error;
    }
  }

  /**
   * Get latest resume for user
   */
  async getLatestResume(userId: string): Promise<any> {
    try {
      // const resume = await Resume.getLatestResume(userId);
      const resume = await Resume.findOne({
        userId,
        isLatest: true,
        isDeleted: false,
      });

      if (!resume) {
        throw new NotFoundError(
          'RESUME_NOT_FOUND'
        );
      }

      return resume;
    } catch(error : any) {
      logger.error('Failed to fetch latest resume:', error);
      throw error;
    }
  }

  /**
   * Get all resume versions for user
   */
  async getAllResumeVersions(userId: string): Promise<any[]> {
    try {
      const resumes = await Resume.getAllVersions(userId);
      return resumes;
    } catch(error : any) {
      logger.error('Failed to fetch resume versions:', error);
      throw error;
    }
  }

  /**
   * Get resume by session
   */
  async getResumeBySession(sessionId: string): Promise<any> {
    try {
      const resume = await Resume.findOne({
        sessionId,
        isDeleted: false,
      });

      if (!resume) {
        throw new NotFoundError(
          'RESUME_NOT_FOUND'
        );
      }

      return resume;
    } catch(error : any) {
      logger.error('Failed to fetch resume by session:', error);
      throw error;
    }
  }

  /**
   * Add mentor feedback to resume
   */
  async addMentorFeedback(
    resumeId: string,
    feedback: MentorFeedbackInput,
    userId?: string
  ): Promise<any> {
    try {
      logger.info(`Adding mentor feedback to resume: ${resumeId}`);

      const resume = await this.getResumeById(resumeId, userId);

      // Validate rating
      if (feedback.rating < 1 || feedback.rating > 5) {
        throw new BadRequestError(
          'Rating must be between 1 and 5'
        );
      }

      await resume.addMentorFeedback(
        feedback.mentorId,
        feedback.rating,
        feedback.comments,
        feedback.detailedFeedback,
        feedback.actionItems
      );

      logger.info(`Mentor feedback added successfully to resume: ${resumeId}`);

      return resume;
    } catch(error : any) {
      logger.error('Failed to add mentor feedback:', error);
      throw error;
    }
  }

  /**
   * Delete resume
   */
  async deleteResume(resumeId: string, userId: string): Promise<void> {
    try {
      logger.info(`Deleting resume: ${resumeId}`);

      const resume = await this.getResumeById(resumeId, userId);

      // Check ownership
      if (resume.userId !== userId) {
        throw new BadRequestError(
          'You are not authorized to delete this resume'
        );
      }

      // Soft delete
      await resume.markAsDeleted();

      // Delete from S3
      try {
        await AWSService.deleteFile(resume.fileKey);
      } catch(error : any) {
        logger.warn(`Failed to delete file from S3: ${resume.fileKey}`);
      }

      logger.info(`Resume deleted successfully: ${resumeId}`);
    } catch(error : any) {
      logger.error('Failed to delete resume:', error);
      throw error;
    }
  }

  /**
   * Get resume statistics
   */
  async getResumeStats(userId: string): Promise<any> {
    try {
      const stats = await Resume.getResumeStats(userId);
      return stats;
    } catch(error : any) {
      logger.error('Failed to fetch resume stats:', error);
      throw error;
    }
  }

  /**
   * Generate signed URL for resume download
   */
  async getResumeDownloadUrl(resumeId: string, userId?: string): Promise<string> {
    try {
      const resume = await this.getResumeById(resumeId, userId);

      const signedUrl = await AWSService.getSignedUrl(resume.fileKey, 3600); // 1 hour expiry

      return signedUrl;
    } catch(error : any) {
      logger.error('Failed to generate download URL:', error);
      throw error;
    }
  }

  /**
   * Re-analyze existing resume
   */
  async reanalyzeResume(resumeId: string, userId?: string): Promise<any> {
    try {
      logger.info(`Re-analyzing resume: ${resumeId}`);

      const resume = await this.getResumeById(resumeId, userId);

      // Download file from S3 (not implemented in current AWS service, would need to add)
      // For now, we'll just return the existing analysis
      
      logger.warn('Re-analysis not fully implemented - returning existing analysis');

      return resume;
    } catch(error : any) {
      logger.error('Failed to re-analyze resume:', error);
      throw error;
    }
  }

  /**
   * Compare resume versions
   */
  async compareResumeVersions(
    resumeId1: string,
    resumeId2: string,
    userId?: string
  ): Promise<any> {
    try {
      logger.info(`Comparing resumes: ${resumeId1} vs ${resumeId2}`);

      const [resume1, resume2] = await Promise.all([
        this.getResumeById(resumeId1, userId),
        this.getResumeById(resumeId2, userId),
      ]);

      // Check ownership
      if (userId && (resume1.userId !== userId || resume2.userId !== userId)) {
        throw new BadRequestError(
          'You can only compare your own resumes'
        );
      }

      const comparison = {
        resume1: {
          id: resume1._id,
          version: resume1.version,
          atsScore: resume1.analysis.atsScore,
          uploadedAt: resume1.createdAt,
        },
        resume2: {
          id: resume2._id,
          version: resume2.version,
          atsScore: resume2.analysis.atsScore,
          uploadedAt: resume2.createdAt,
        },
        scoreDifference: resume2.analysis.atsScore - resume1.analysis.atsScore,
        improvement: resume2.analysis.atsScore > resume1.analysis.atsScore,
        keywordComparison: {
          added: resume2.analysis.keywords.filter(
            (k: string) => !resume1.analysis.keywords.includes(k)
          ),
          removed: resume1.analysis.keywords.filter(
            (k: string) => !resume2.analysis.keywords.includes(k)
          ),
        },
      };

      return comparison;
    } catch(error : any) {
      logger.error('Failed to compare resumes:', error);
      throw error;
    }
  }
}

export default new ResumeService();