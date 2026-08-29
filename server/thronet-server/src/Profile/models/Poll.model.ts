import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface IPollOption {
    optionId: string;
    text: string;
    votes: number;
    votedBy: string[];
}

export interface IPoll extends Document {
    pollId: string;
    postEntryId: string;   // Post.posts[].entryId se link
    userId: string;
    question: string;
    options: IPollOption[];
    duration: 1 | 3 | 7 | 14;
    totalVotes: number;
    endsAt: Date;
    isActive: boolean;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IPollModel extends Model<IPoll> {
    findByPollId(pollId: string): Promise<IPoll | null>;
    findByPostEntryId(postEntryId: string): Promise<IPoll | null>;
    castVote(pollId: string, optionId: string, userId: string): Promise<IPoll>;
    removeVote(pollId: string, optionId: string, userId: string): Promise<IPoll>;
}

// ==================== SCHEMA ====================

const PollOptionSchema = new Schema<IPollOption>(
    {
        optionId: { type: String, required: true, default: () => uuidv4() },
        text: { type: String, required: true, maxlength: 100, trim: true },
        votes: { type: Number, default: 0, min: 0 },
        votedBy: [{ type: String }],
    },
    { _id: false }
);

const PollSchema = new Schema<IPoll, IPollModel>(
    {
        pollId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
        },
        postEntryId: {
            type: String,
            required: true,
            unique: true,   // ek post mein sirf ek poll
        },
        userId: { type: String, required: true },
        question: { type: String, required: true, maxlength: 140, trim: true },
        options: {
            type: [PollOptionSchema],
            validate: {
                validator: (v: IPollOption[]) => v.length >= 2 && v.length <= 4,
                message: 'Poll must have 2 to 4 options',
            },
        },
        duration: {
            type: Number,
            enum: [1, 3, 7, 14],
            required: true,
            default: 7,
        },
        totalVotes: { type: Number, default: 0, min: 0 },
        endsAt: { type: Date, required: true },
        isActive: { type: Boolean, default: true },
        isDeleted: { type: Boolean, default: false },
    },
    {
        timestamps: true,
        collection: 'polls',
    }
);

// ==================== INDEXES ====================

PollSchema.index({ isActive: 1, endsAt: 1 });   // cron job ke liye (expire polls)
PollSchema.index({ userId: 1, createdAt: -1 });

// ==================== STATIC METHODS ====================

PollSchema.statics.findByPollId = async function (
    pollId: string
): Promise<IPoll | null> {
    return this.findOne({ pollId, isDeleted: false });
};

PollSchema.statics.findByPostEntryId = async function (
    postEntryId: string
): Promise<IPoll | null> {
    return this.findOne({ postEntryId, isDeleted: false });
};

PollSchema.statics.castVote = async function (
    pollId: string,
    optionId: string,
    userId: string
): Promise<IPoll> {
    const poll = await this.findOne({ pollId, isDeleted: false, isActive: true });
    if (!poll) throw new Error('Poll not found or expired');

    // Check: user ne pehle vote kiya hai kisi bhi option pe
    const alreadyVoted = poll.options.some((opt) => opt.votedBy.includes(userId));
    if (alreadyVoted) throw new Error('You have already voted');

    const option = poll.options.find((opt) => opt.optionId === optionId);
    if (!option) throw new Error('Option not found');

    option.votedBy.push(userId);
    option.votes++;
    poll.totalVotes++;
    await poll.save();
    return poll;
};

PollSchema.statics.removeVote = async function (
    pollId: string,
    optionId: string,
    userId: string
): Promise<IPoll> {
    const poll = await this.findOne({ pollId, isDeleted: false, isActive: true });
    if (!poll) throw new Error('Poll not found or expired');

    const option = poll.options.find((opt) => opt.optionId === optionId);
    if (!option) throw new Error('Option not found');

    const idx = option.votedBy.indexOf(userId);
    if (idx === -1) throw new Error('Vote not found');

    option.votedBy.splice(idx, 1);
    option.votes = Math.max(0, option.votes - 1);
    poll.totalVotes = Math.max(0, poll.totalVotes - 1);
    await poll.save();
    return poll;
};

// ==================== EXPORT ====================

const Poll = mongoose.model<IPoll, IPollModel>('Poll', PollSchema);
export default Poll;