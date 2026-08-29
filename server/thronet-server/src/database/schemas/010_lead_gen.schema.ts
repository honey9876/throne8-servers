import { Schema } from 'mongoose';

export const LeadGenSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    campaign: {
      name: String,
      type: {
        type: String,
        enum: ['Email', 'Event', 'Content', 'Social', 'Partnership'],
      },
      startDate: Date,
      endDate: Date,
    },
    leads: [
      {
        name: String,
        email: {
          type: String,
          match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide valid email'],
        },
        phone: String,
        company: String,
        designation: String,
        source: {
          type: String,
          enum: ['Website', 'Event', 'Referral', 'Social', 'Email'],
        },
        capturedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'],
          default: 'New',
        },
        notes: String,
      },
    ],
    leadsCount: {
      type: Number,
      default: 0,
    },
    convertedCount: {
      type: Number,
      default: 0,
    },
    conversionRate: {
      type: Number,
      default: 0,
    },
    metadata: {
      source: String,
      campaignId: String,
      utmParams: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'lead_gens',
  }
);

// Indexes
LeadGenSchema.index({ company: 1, createdAt: -1 });
LeadGenSchema.index({ 'campaign.type': 1 });

export default LeadGenSchema;