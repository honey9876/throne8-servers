// src/types/assignment.types.ts

/**
 * Create Assignment Request
 */
export interface CreateAssignmentRequest {
  title: string;
  description: string;
  instructions?: string;
  assignmentType: 'homework' | 'project' | 'lab' | 'reading';
  subject?: string;
  topics?: string[];
  totalMarks: number;
  dueDate: string;
  lateSubmissionAllowed?: boolean;
  latePenalty?: number;
}

/**
 * Update Assignment Request
 */
export interface UpdateAssignmentRequest {
  title?: string;
  description?: string;
  instructions?: string;
  totalMarks?: number;
  dueDate?: string;
  lateSubmissionAllowed?: boolean;
  latePenalty?: number;
  isActive?: boolean;
}

/**
 * Submit Assignment Request
 */
export interface SubmitAssignmentRequest {
  submissionText?: string;
}

/**
 * Grade Assignment Request
 */
export interface GradeAssignmentRequest {
  marksObtained: number;
  feedback?: string;
}

/**
 * Assignment Response
 */
export interface AssignmentResponse {
  _id: string;
  title: string;
  description: string;
  instructions?: string;
  group: any;
  creator: any;
  assignmentType: string;
  subject?: string;
  topics?: string[];
  attachments?: any[];
  totalMarks: number;
  assignedDate: Date;
  dueDate: Date;
  lateSubmissionAllowed: boolean;
  latePenalty?: number;
  totalSubmissions: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Extra fields for students
  hasSubmitted?: boolean;
  mySubmission?: any;
  isOverdue?: boolean;
  daysRemaining?: number;
}

/**
 * Assignment List Query
 */
export interface AssignmentListQuery {
  page?: number;
  limit?: number;
  groupId?: string;
  status?: 'active' | 'completed' | 'overdue';
  assignmentType?: string;
  subject?: string;
  sortBy?: 'dueDate' | 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}