// src/models/Question.model.ts

import mongoose, { Schema } from 'mongoose';
import { IQuestion } from '../interfaces/IQuestion';

const QuestionSchema = new Schema<IQuestion>(
  {
    test: {
      type: Schema.Types.ObjectId, // ✅ This is correct
      ref: 'StudyGroup_Test',
      required: [true, 'Test reference is required'],
    },
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      minlength: [10, 'Question must be at least 10 characters'],
      maxlength: [2000, 'Question cannot exceed 2000 characters'],
    },
    questionType: {
      type: String,
      enum: {
        values: ['mcq', 'true-false', 'short-answer', 'long-answer'],
        message: '{VALUE} is not a valid question type',
      },
      required: [true, 'Question type is required'],
    },
    options: {
      type: [String],
      validate: {
        validator: function(options: string[]) {
          const doc = this as IQuestion; // ✅ Type assertion
          if (doc.questionType === 'mcq') {
            return options && options.length >= 2 && options.length <= 6;
          }
          if (doc.questionType === 'true-false') {
            return options && options.length === 2;
          }
          return true;
        },
        message: 'MCQ must have 2-6 options, True/False must have exactly 2 options',
      },
    },
    correctAnswer: {
      type: Schema.Types.Mixed, // Can be string or array
      required: function() {
        const doc = this as IQuestion; // ✅ Type assertion
        return doc.questionType === 'mcq' || doc.questionType === 'true-false';
      },
    },
    maxWords: {
      type: Number,
      min: [10, 'Max words must be at least 10'],
      max: [1000, 'Max words cannot exceed 1000'],
    },
    sampleAnswer: {
      type: String,
      trim: true,
      maxlength: [5000, 'Sample answer cannot exceed 5000 characters'],
    },
    marks: {
      type: Number,
      required: [true, 'Marks are required'],
      min: [1, 'Marks must be at least 1'],
      max: [100, 'Marks cannot exceed 100'],
    },
    difficulty: {
      type: String,
      enum: {
        values: ['easy', 'medium', 'hard'],
        message: '{VALUE} is not a valid difficulty level',
      },
      default: 'medium',
    },
    subject: {
      type: String,
      trim: true,
    },
    topic: {
      type: String,
      trim: true,
    },
    explanation: {
      type: String,
      trim: true,
      maxlength: [1000, 'Explanation cannot exceed 1000 characters'],
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      required: [true, 'Question order is required'],
      min: [1, 'Order must be at least 1'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
QuestionSchema.index({ test: 1, order: 1 });
QuestionSchema.index({ difficulty: 1 });
QuestionSchema.index({ subject: 1 });

// Pre-save validation
QuestionSchema.pre('save', function(next) {
  const doc = this as IQuestion; // ✅ Type assertion
  
  // Ensure correct answer exists for MCQ and True/False
  if (
    (doc.questionType === 'mcq' || doc.questionType === 'true-false') &&
    !doc.correctAnswer
  ) {
    return next(new Error('Correct answer is required for MCQ and True/False questions'));
  }
  
  next();
});

const Question = mongoose.model<IQuestion>('StudyGroup_Question', QuestionSchema);

export default Question;