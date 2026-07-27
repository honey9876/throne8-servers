/**
 * Comment Model - Activity System
 * @module models/Comment.model
 * @version 1.0.0
 */

import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IComment extends Document {
    commentId: string;
    postId: string;
    userId: string;
    content: string;
    likesCount: number;
    likedBy: string[];
    replies: string[];
    parentCommentId?: string;
    threadDepth: number;
    replyCount: number;
    isDeleted: boolean;
    deletedAt?: Date;
    reactions: {
        like: string[];
        celebrate: string[];
        support: string[];
        love: string[];
        insightful: string[];
        funny: string[];
    };
    reactionStats: {
        totalReactions: number;
        like: number;
        celebrate: number;
        support: number;
        love: number;
        insightful: number;
        funny: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

export interface ICommentModel extends Model<IComment> {
    findByCommentId(commentId: string): Promise<IComment | null>;
    findByPostId(postId: string): Promise<IComment[]>;
    findByUserId(userId: string): Promise<IComment[]>;
    getUserCommentCount(userId: string): Promise<number>;
    getUserCommentStats(userId: string): Promise<{
        totalComments: number;
        uniquePosts: number;
        averageCommentsPerPost: number | string;
    }>;
}

const CommentSchema = new Schema<IComment, ICommentModel>(
    {
        commentId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            // FIX:  hataya - unique:true apne aap index banata hai
        },
        postId: {
            type: String,
            required: true,
        },
        userId: {
            type: String,
            required: true,
        },
        content: {
            type: String,
            required: true,
            minlength: 1,
            maxlength: 2000,
            trim: true,
        },
        likesCount: { type: Number, default: 0, min: 0 },
        likedBy: [{ type: String }],
        replies: [{ type: String, default: [] }],
        parentCommentId: {
            type: String,
            default: null,
        },
        threadDepth: { type: Number, default: 0, min: 0, max: 5 },
        replyCount: { type: Number, default: 0 },
        isDeleted: { type: Boolean, default: false },
        deletedAt: Date,
        reactions: {
            like: [{ type: String }],
            celebrate: [{ type: String }],
            support: [{ type: String }],
            love: [{ type: String }],
            insightful: [{ type: String }],
            funny: [{ type: String }],
        },
        reactionStats: {
            totalReactions: { type: Number, default: 0 },
            like: { type: Number, default: 0 },
            celebrate: { type: Number, default: 0 },
            support: { type: Number, default: 0 },
            love: { type: Number, default: 0 },
            insightful: { type: Number, default: 0 },
            funny: { type: Number, default: 0 },
        },
    },
    {
        timestamps: true,
        collection: 'comments',
    }
);

// ==================== INDEXES ====================
CommentSchema.index({ postId: 1, createdAt: -1 });
CommentSchema.index({ userId: 1, createdAt: -1 });
CommentSchema.index({ postId: 1, isDeleted: 1 });
// FIX: parentCommentId field se  hataya - sirf yahan ek baar index hai
CommentSchema.index({ parentCommentId: 1 });

// ==================== STATIC METHODS ====================

CommentSchema.statics.findByCommentId = async function (commentId: string): Promise<IComment | null> {
    return this.findOne({ commentId, isDeleted: false });
};

CommentSchema.statics.findByPostId = async function (postId: string): Promise<IComment[]> {
    return this.find({ postId, isDeleted: false }).sort({ createdAt: -1 });
};

CommentSchema.statics.findByUserId = async function (userId: string): Promise<IComment[]> {
    return this.find({ userId, isDeleted: false }).sort({ createdAt: -1 });
};

CommentSchema.statics.getUserCommentCount = async function (userId: string): Promise<number> {
    return this.countDocuments({ userId, isDeleted: false });
};

CommentSchema.statics.getUserCommentStats = async function (userId: string) {
    const totalComments = await this.countDocuments({ userId, isDeleted: false });
    const postCounts = await this.aggregate([
        { $match: { userId, isDeleted: false } },
        { $group: { _id: '$postId', count: { $sum: 1 } } },
    ]);
    const uniquePosts = postCounts.length;
    return {
        totalComments,
        uniquePosts,
        averageCommentsPerPost: uniquePosts > 0 ? (totalComments / uniquePosts).toFixed(2) : 0,
    };
};

const Comment = mongoose.model<IComment, ICommentModel>('Comment', CommentSchema);
export default Comment;