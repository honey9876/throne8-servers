import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IMutedThread extends Document {
    muteId: string;
    userId: string;   // jisne mute kiya
    postId: string;   // konsa post/thread mute hua
    mutedAt: Date;
}

export interface IMutedThreadModel extends Model<IMutedThread> {
    isMuted(userId: string, postId: string): Promise<boolean>;
}

const MutedThreadSchema = new Schema<IMutedThread, IMutedThreadModel>(
    {
        muteId: { type: String, required: true, unique: true, default: () => uuidv4() },
        userId: { type: String, required: true },
        postId: { type: String, required: true },
        mutedAt: { type: Date, default: Date.now },
    },
    { collection: 'muted_threads' }
);

// ✅ Ek user ek thread ko sirf ek baar mute kare
MutedThreadSchema.index({ userId: 1, postId: 1 }, { unique: true });

MutedThreadSchema.statics.isMuted = function (userId: string, postId: string) {
    return this.exists({ userId, postId }).then((r: any) => !!r);
};

const MutedThread = mongoose.model<IMutedThread, IMutedThreadModel>('MutedThread', MutedThreadSchema);
export default MutedThread;