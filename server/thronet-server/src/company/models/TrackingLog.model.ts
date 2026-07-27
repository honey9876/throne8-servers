import mongoose, { Schema, Document } from 'mongoose';

export interface ITrackingLog extends Document {
    companyId: mongoose.Types.ObjectId;
    userId: string;
    eventType: 'search_appearance' | 'page_view' | 'post_impression' | 'follower_gained' | 'follower_lost';
    postId?: mongoose.Types.ObjectId;
    searchQuery?: string;
    sessionId?: string;
    createdAt: Date;
}

const TrackingLogSchema = new Schema({
    companyId: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
    userId: {
        type: String,
        required: true,
    },
    eventType: {
        type: String,
        enum: ['search_appearance', 'page_view', 'post_impression', 'follower_gained', 'follower_lost'],
        required: true,
    },
    postId: {
        type: Schema.Types.ObjectId,
        ref: 'CompanyPost'
    },
    searchQuery: {
        type: String,
        maxlength: 200
    },
    sessionId: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
}, {
    timestamps: false,
    collection: 'company_tracking_logs',
    versionKey: false
});

// Auto delete after 90 days
TrackingLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// Prevent counting same user twice per day per event
TrackingLogSchema.index(
    { companyId: 1, userId: 1, eventType: 1, createdAt: 1 }
);

const TrackingLog = mongoose.model<ITrackingLog>(
    'TrackingLog',
    TrackingLogSchema
);

export default TrackingLog;