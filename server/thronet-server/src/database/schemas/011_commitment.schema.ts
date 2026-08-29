import { Schema } from 'mongoose';

export const CommitmentSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Commitment title is required'],
      trim: true,
    },
    description: String,
    category: {
      type: String,
      enum: [
        'Sustainability',
        'Diversity',
        'Ethics',
        'Community',
        'Innovation',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Completed', 'In Progress', 'On Hold'],
      default: 'Active',
    },
    startDate: Date,
    targetDate: Date,
    endDate: Date,
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    metrics: [
      {
        name: String,
        value: Schema.Types.Mixed,
        unit: String,
      },
    ],
    impact: {
      description: String,
      beneficiaries: Number,
      reach: String,
    },
    verificationDetails: {
      isVerified: { type: Boolean, default: false },
      verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: 'Admin',
      },
      verificationDate: Date,
      verificationNotes: String,
    },
    attachments: [String],
  },
  {
    timestamps: true,
    collection: 'commitments',
  }
);

// Indexes
CommitmentSchema.index({ company: 1, category: 1 });
CommitmentSchema.index({ status: 1 });
CommitmentSchema.index({ progress: -1 });

export default CommitmentSchema;