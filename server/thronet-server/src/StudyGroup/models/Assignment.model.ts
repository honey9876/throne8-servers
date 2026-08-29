// src/models/Assignment.model.ts

import mongoose, { Schema } from 'mongoose';
import { IAssignment, IAssignmentSubmission } from '../interfaces/IAssignment';
import { validId } from '@/shared/security';

/**
 * Assignment Schema
 */
const AssignmentSchema = new Schema<IAssignment>(
  {
    assignmentId: {
      type: String,
      required: true,
      unique: true,
      validator: (v: any) => validId(v),  // UUID generate
    },
    title: {
      type: String,
      required: [true, 'Assignment title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: [1000, 'Instructions cannot exceed 1000 characters'],
    },
    group: {
      type: String, // ✅ Correct
      ref: 'StudyGroup_Group',
      required: [true, 'Group reference is required'],
    },
    creator: {
      type: String, // ✅ Correct
      ref: 'User',
      required: [true, 'Creator reference is required'],
    },
    assignmentType: {
      type: String,
      enum: {
        values: ['homework', 'project', 'lab', 'reading'],
        message: '{VALUE} is not a valid assignment type',
      },
      required: [true, 'Assignment type is required'],
      default: 'homework',
    },
    subject: {
      type: String,
      trim: true,
    },
    topics: [{
      type: String,
      trim: true,
    }],
    attachments: [{
      fileName: {
        type: String,
        required: true,
      },
      fileUrl: {
        type: String,
        required: true,
      },
      fileType: {
        type: String,
        required: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    totalMarks: {
      type: Number,
      required: [true, 'Total marks are required'],
      min: [1, 'Total marks must be at least 1'],
      max: [100, 'Total marks cannot exceed 100'],
    },
    assignedDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      validate: {
        validator: function (value: Date) {
          const doc = this as IAssignment; // ✅ Type assertion
          return value > doc.assignedDate;
        },
        message: 'Due date must be after assigned date',
      },
    },
    lateSubmissionAllowed: {
      type: Boolean,
      default: false,
    },
    latePenalty: {
      type: Number,
      min: [0, 'Late penalty cannot be negative'],
      max: [100, 'Late penalty cannot exceed 100%'],
      default: 0,
    },
    submissions: [{
      type: String,
      ref: 'StudyGroup_AssignmentSubmission',
    }],
    totalSubmissions: {
      type: Number,
      default: 0,
      min: [0, 'Total submissions cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
AssignmentSchema.index({ group: 1, dueDate: 1 });
AssignmentSchema.index({ creator: 1 });
AssignmentSchema.index({ assignmentType: 1 });
AssignmentSchema.index({ isActive: 1 });

// Virtual for checking if assignment is overdue
AssignmentSchema.virtual('isOverdue').get(function () {
  const doc = this as IAssignment; // ✅ Type assertion
  return new Date() > doc.dueDate;
});

// Pre-save hook
AssignmentSchema.pre('save', function (next) {
  const doc = this as IAssignment; // ✅ Type assertion

  // Update totalSubmissions
  if (doc.submissions) {
    doc.totalSubmissions = doc.submissions.length;
  }
  next();
});

/**
 * Assignment Submission Schema
 */
const AssignmentSubmissionSchema = new Schema<IAssignmentSubmission>(
  {

    submissionId: {
      type: String,
      required: true,
      unique: true,
      validate: (v: any) => validId(v),
    },
    assignment: {
      type: String, // ✅ Correct
      ref: 'StudyGroup_Assignment',
      required: [true, 'Assignment reference is required'],
    },
    student: {
      type: String, // ✅ Correct
      ref: 'User',
      required: [true, 'Student reference is required'],
    },
    submittedFiles: [{
      fileName: {
        type: String,
        required: true,
      },
      fileUrl: {
        type: String,
        required: true,
      },
      fileType: {
        type: String,
        required: true,
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    submissionText: {
      type: String,
      trim: true,
      maxlength: [5000, 'Submission text cannot exceed 5000 characters'],
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    marksObtained: {
      type: Number,
      min: [0, 'Marks cannot be negative'],
    },
    feedback: {
      type: String,
      trim: true,
      maxlength: [1000, 'Feedback cannot exceed 1000 characters'],
    },
    gradedBy: {
      type: String,
      ref: 'User',
    },
    gradedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'submitted', 'graded', 'returned'],
        message: '{VALUE} is not a valid status',
      },
      default: 'submitted',
    },
    isLate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
AssignmentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });
AssignmentSubmissionSchema.index({ status: 1 });

// Export models
export const Assignment = mongoose.model<IAssignment>('StudyGroup_Assignment', AssignmentSchema);
export const AssignmentSubmission = mongoose.model<IAssignmentSubmission>(
  'StudyGroup_AssignmentSubmission',
  AssignmentSubmissionSchema
);

export default Assignment;