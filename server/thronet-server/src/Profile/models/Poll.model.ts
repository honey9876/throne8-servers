// models/Poll.model.ts - CREATE NEW FILE

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IPoll extends Document {
    pollId: string;
    postId: string;
    userId: string;
    question: string;
    options: {
        optionId: string;
        text: string;
        votes: number;
        votedBy: string[];
    }[];
    totalVotes: number;
    endsAt?: Date;
    isActive: boolean;
    createdAt: Date;
}

const PollSchema = new Schema<IPoll>({
    pollId: {
        type: String,
        required: true,
        unique: true,
        default: () => uuidv4(),
        index: true
    },
    postId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    question: {
        type: String,
        required: true,
        maxlength: 500
    },
    options: [{
        optionId: {
            type: String,
            default: () => uuidv4()
        },
        text: {
            type: String,
            required: true,
            maxlength: 200
        },
        votes: {
            type: Number,
            default: 0
        },
        votedBy: [{
            type: String
        }]
    }],
    totalVotes: {
        type: Number,
        default: 0
    },
    endsAt: Date,
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    collection: 'polls'
});

const Poll = mongoose.model<IPoll>('Poll', PollSchema);
export default Poll;