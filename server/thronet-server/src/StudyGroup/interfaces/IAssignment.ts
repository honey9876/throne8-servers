// src/interfaces/IAssignment.ts

import { Document, Types } from 'mongoose';

/**
 * Assignment Interface
 */
export interface IAssignment extends Document {
  _id: Types.ObjectId; // ✅ FIXED
  assignmentId:string;
  
  // Basic Info
  title: string;
  description: string;
  instructions?: string;
  
  // References
  group: string; // Reference to Group
  creator: string; // Reference to User (teacher/leader)
  
  // Assignment Type
  assignmentType: 'homework' | 'project' | 'lab' | 'reading';
  
  // Subject/Topic
  subject?: string;
  topics?: string[];
  
  // Files & Resources
  attachments?: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedAt: Date;
  }[];
  
  // Grading
  totalMarks: number;
  
  // Deadlines
  assignedDate: Date;
  dueDate: Date;
  lateSubmissionAllowed: boolean;
  latePenalty?: number; // Percentage deduction
  
  // Submissions
  submissions: string[]; // References to AssignmentSubmission
  totalSubmissions: number;
  
  // Status
  isActive: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Assignment Submission Interface
 */
export interface IAssignmentSubmission extends Document {
  _id: Types.ObjectId; // ✅ FIXED
  submissionId: string;
  
  assignment: string; // Reference to Assignment
  student: string; // Reference to User
  
  // Submission Data
  submittedFiles?: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedAt: Date;
  }[];
  
  submissionText?: string;
  submittedAt: Date;
  
  // Grading
  marksObtained?: number;
  feedback?: string;
  gradedBy?: string; // Reference to User (teacher)
  gradedAt?: Date;
  
  // Status
  status: 'pending' | 'submitted' | 'graded' | 'returned';
  isLate: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}