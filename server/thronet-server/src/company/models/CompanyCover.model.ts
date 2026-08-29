import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export interface ICompanyCover extends Document {
    coverId: string;
    companyId: string;
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    cloudinarySecureUrl: string;
    cloudinaryFolder: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    format: string;
    isActive: boolean;
    status: 'active' | 'archived' | 'deleted';
    isDeleted: boolean;
    deletedAt?: Date;
    uploadedBy: string;
    uploadedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICompanyCoverModel extends Model<ICompanyCover> {
    findByCompanyId(companyId: string): Promise<ICompanyCover[]>;
    findActiveCover(companyId: string): Promise<ICompanyCover | null>;
    getCompanyCoverCount(companyId: string): Promise<number>;
    setActiveCover(coverId: string, companyId: string): Promise<ICompanyCover>;
    findByCoverId(coverId: string, companyId: string): Promise<ICompanyCover | null>;
    deleteCover(coverId: string, companyId: string): Promise<ICompanyCover | null>;
}

const CompanyCoverSchema = new Schema<ICompanyCover, ICompanyCoverModel>(
    {
        coverId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        companyId: {
            type: String,
            required: [true, 'Company ID is required'],
        },
        cloudinaryPublicId: { type: String, required: true },
        cloudinaryUrl: { type: String, required: true },
        cloudinarySecureUrl: { type: String, required: true },
        cloudinaryFolder: { type: String, default: 'company-covers' },
        originalName: { type: String, required: true },
        mimeType: {
            type: String,
            required: true,
            enum: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        },
        fileSize: { type: Number, required: true, min: 0, max: 10485760 },
        width: { type: Number, required: true, min: 400, max: 10000 },
        height: { type: Number, required: true, min: 200, max: 10000 },
        format: {
            type: String,
            required: true,
            enum: ['jpg', 'jpeg', 'png', 'webp'],
        },
        isActive: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ['active', 'archived', 'deleted'],
            default: 'active',
        },
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        uploadedBy: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        collection: 'company_covers',
        toJSON: {
            virtuals: true,
            transform: (_doc, ret) => { delete (ret as any).__v; return ret; },
        },
    }
);

CompanyCoverSchema.index({ companyId: 1, isActive: 1 });
CompanyCoverSchema.index({ companyId: 1, isDeleted: 1 });
CompanyCoverSchema.index({ cloudinaryPublicId: 1 });
CompanyCoverSchema.index({ createdAt: -1 });

CompanyCoverSchema.pre('save', function (next) {
    if (this.isDeleted) {
        this.status = 'deleted';
        this.isActive = false;
    } else {
        this.status = 'active';
    }
    next();
});

// Static methods
CompanyCoverSchema.statics.findByCompanyId = async function (companyId: string): Promise<ICompanyCover[]> {
    return this.find({ companyId, isDeleted: false }).sort({ createdAt: -1 }).exec();
};

CompanyCoverSchema.statics.findActiveCover = async function (companyId: string): Promise<ICompanyCover | null> {
    return this.findOne({ companyId, isActive: true, isDeleted: false }).exec();
};

CompanyCoverSchema.statics.getCompanyCoverCount = async function (companyId: string): Promise<number> {
    return this.countDocuments({ companyId, isDeleted: false });
};

CompanyCoverSchema.statics.setActiveCover = async function (coverId: string, companyId: string): Promise<ICompanyCover> {
    await this.updateMany({ companyId }, { $set: { isActive: false } });

    const cover = await this.findOneAndUpdate(
        { coverId, companyId, isDeleted: false },
        { $set: { isActive: true } },
        { new: true }
    );

    if (!cover) throw new Error('Cover not found');
    return cover;
};

CompanyCoverSchema.statics.findByCoverId = async function (coverId: string, companyId: string): Promise<ICompanyCover | null> {
    return this.findOne({ coverId, companyId, isDeleted: false }).exec();
};

CompanyCoverSchema.statics.deleteCover = async function (coverId: string, companyId: string): Promise<ICompanyCover | null> {
    return this.findOneAndUpdate(
        { coverId, companyId, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date(), isActive: false, status: 'deleted' } },
        { new: true }
    );
};

const CompanyCover = mongoose.model<ICompanyCover, ICompanyCoverModel>('CompanyCover', CompanyCoverSchema);
export default CompanyCover;