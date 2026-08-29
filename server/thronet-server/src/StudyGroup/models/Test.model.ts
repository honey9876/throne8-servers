// src/models/Test.model.ts

import mongoose, { Schema } from 'mongoose';
import { ITest } from '../interfaces/ITest';

const TestSchema = new Schema<ITest>(
  {
    testId:{
      type: String,
      required: true
    },
    title: {
      type: String,
      required: [true, 'Test title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
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
    totalMarks: {
      type: Number,
      required: [true, 'Total marks are required'],
      min: [1, 'Total marks must be at least 1'],
    },
    passingMarks: {
      type: Number,
      required: [true, 'Passing marks are required'],
      min: [0, 'Passing marks cannot be negative'],
      validate: {
        validator: function(value: number) {
          const doc = this as ITest; // ✅ Type assertion
          return value <= doc.totalMarks;
        },
        message: 'Passing marks cannot exceed total marks',
      },
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [5, 'Duration must be at least 5 minutes'],
      max: [300, 'Duration cannot exceed 300 minutes (5 hours)'],
    },
    scheduledStartTime: {
      type: Date,
    },
    scheduledEndTime: {
      type: Date,
      validate: {
        validator: function(value: Date) {
          const doc = this as ITest; // ✅ Type assertion
          if (!doc.scheduledStartTime) return true;
          return value > doc.scheduledStartTime;
        },
        message: 'End time must be after start time',
      },
    },
    testType: {
      type: String,
      enum: {
        values: ['practice', 'mock', 'assignment'],
        message: '{VALUE} is not a valid test type',
      },
      required: [true, 'Test type is required'],
      default: 'practice',
    },
    questions: [{
      type: String,
      ref: 'StudyGroup_Question',
    }],
    totalQuestions: {
      type: Number,
      default: 0,
      min: [0, 'Total questions cannot be negative'],
    },
    settings: {
      shuffleQuestions: {
        type: Boolean,
        default: false,
      },
      showAnswersAfterSubmit: {
        type: Boolean,
        default: true,
      },
      allowReAttempt: {
        type: Boolean,
        default: false,
      },
      maxAttempts: {
        type: Number,
        default: 1,
        min: [1, 'Max attempts must be at least 1'],
        max: [10, 'Max attempts cannot exceed 10'],
      },
      negativeMarking: {
        type: Boolean,
        default: false,
      },
      negativeMarksPerQuestion: {
        type: Number,
        min: [0, 'Negative marks cannot be negative'],
        max: [10, 'Negative marks per question cannot exceed 10'],
      },
    },
    subject: {
      type: String,
      trim: true,
    },
    topics: [{
      type: String,
      trim: true,
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
TestSchema.index({ group: 1, createdAt: -1 });
TestSchema.index({ creator: 1 });
TestSchema.index({ testType: 1 });
TestSchema.index({ isPublished: 1 });
TestSchema.index({ scheduledStartTime: 1 });

// Virtual for checking if test is live
TestSchema.virtual('isLive').get(function() {
  const doc = this as ITest; // ✅ Type assertion
  if (!doc.scheduledStartTime || !doc.scheduledEndTime) return false;
  const now = new Date();
  return now >= doc.scheduledStartTime && now <= doc.scheduledEndTime;
});

// Pre-save hook
TestSchema.pre('save', function(next) {
  const doc = this as ITest; // ✅ Type assertion
  
  // Auto-set totalQuestions
  if (doc.questions) {
    doc.totalQuestions = doc.questions.length;
  }
  
  // Set publishedAt when first published
  if (doc.isPublished && !doc.publishedAt) {
    doc.publishedAt = new Date();
  }
  
  next();
});

const Test = mongoose.model<ITest>('StudyGroup_Test', TestSchema);

export default Test;